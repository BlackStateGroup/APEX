#!/usr/bin/env python3
"""Synthetic-only APEX falsification lab. Standard library; no device/network I/O.

Experiments, not a receiver or a deployed classifier. All physical parameters below
are declared assumptions, not measurements of Apple hardware or CoreBluetooth.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import statistics

VERSION = 1
DEFAULT_SEED = 20261109
N_EVENTS = 160
METHODS = ('rssi_only', 'uncorrected_retention', 'paired_reference_retention', 'combined')
SCENARIOS = (
    'nominal_null', 'target_attenuation', 'target_erasure',
    'scheduler_shift_null', 'differential_scheduler_null',
    'receiver_gain_null', 'reference_fade_null', 'sparse_null', 'sparse_erasure',
)


def wilson(successes: int, count: int) -> list[float]:
    """95% binomial interval for independent synthetic trial outcomes."""
    if count <= 0 or not 0 <= successes <= count:
        raise ValueError('Invalid successes or trial count')
    z = 1.959963984540054
    p = successes / count
    denominator = 1 + z * z / count
    center = (p + z * z / (2 * count)) / denominator
    half = z * math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denominator
    return [max(0., center - half), min(1., center + half)]


def stable_rng(seed: int, label: str) -> random.Random:
    # Stable domain separation. Calibration cannot consume test random draws.
    digest = hashlib.sha256(f'{seed}:{label}'.encode()).digest()
    return random.Random(int.from_bytes(digest, 'big'))


def window(rng: random.Random, q: float, *, attenuation: float = 0.,
           erasure: float = 0., differential_loss: float = 0.,
           receiver_gain: float = 0., reference_fade: float = 0.,
           events: int = N_EVENTS) -> tuple[list[float], list[float]]:
    """One synthetic observation per known emitted update, never raw RF packets.

    The target/reference callback-retention probabilities are q*(1-diff_loss)
    and q, independently sampled conditional on q. This is a shared rate, not
    perfectly synchronized all-or-none scheduler outages.
    """
    if not 0 <= q <= 1 or not 0 <= erasure <= 1 or not 0 <= differential_loss <= 1:
        raise ValueError('Invalid probability')
    if not isinstance(events, int) or not 1 <= events <= 10000:
        raise ValueError('Invalid event budget')
    target, reference = [], []
    for _ in range(events):
        # Independent log-normal shadowing in power -> Gaussian RSSI in dB.
        target_rssi = rng.gauss(-84. - attenuation + receiver_gain, 5.)
        ref_rssi = rng.gauss(-65. - reference_fade + receiver_gain, 5.)
        target_callback = rng.random() < q * (1 - differential_loss)
        target_survives = rng.random() >= erasure
        ref_callback = rng.random() < q
        # Hard sensitivity model intentionally simplified; quantization to 1 dB.
        if target_rssi >= -88. and target_callback and target_survives:
            target.append(round(target_rssi))
        if ref_rssi >= -88. and ref_callback:
            reference.append(round(ref_rssi))
    return target, reference


def scores(before: tuple[list[float], list[float]],
           after: tuple[list[float], list[float]]) -> dict[str, float] | None:
    """Directed decrease scores. Abstain, rather than invent RSSI for empty data."""
    b_target, b_ref = before
    a_target, a_ref = after
    if min(map(len, (b_target, b_ref, a_target, a_ref))) < 5:
        return None
    # All four windows have the same known number of emitted updates in this lab.
    raw = math.log(len(b_target) / len(a_target))
    corrected = raw - math.log(len(b_ref) / len(a_ref))
    return {
        'rssi_only': statistics.mean(b_target) - statistics.mean(a_target),
        'uncorrected_retention': raw,
        'paired_reference_retention': corrected,
    }


def trial(rng: random.Random, scenario: str) -> dict[str, float] | None:
    if scenario not in SCENARIOS:
        raise ValueError('Unknown scenario')
    q_before, q_after = rng.uniform(.45, .95), rng.uniform(.45, .95)
    before_args, after_args = {}, {}
    if scenario == 'target_attenuation':
        after_args['attenuation'] = 4.
    elif scenario in ('target_erasure', 'sparse_erasure'):
        after_args['erasure'] = .35
    elif scenario == 'scheduler_shift_null':
        q_before, q_after = .9, .35
    elif scenario == 'differential_scheduler_null':
        after_args['differential_loss'] = .35
    elif scenario == 'receiver_gain_null':
        after_args['receiver_gain'] = -4.
    elif scenario == 'reference_fade_null':
        # A previously obstructed reference improves, falsely resembling target loss.
        before_args['reference_fade'] = 23.
    if scenario.startswith('sparse_'):
        before_args['events'] = after_args['events'] = 12
    return scores(window(rng, q_before, **before_args), window(rng, q_after, **after_args))


def quantile(values: list[float], fraction: float) -> float:
    if not values or not 0 <= fraction <= 1:
        raise ValueError('Invalid quantile')
    return sorted(values)[max(0, min(len(values) - 1, math.ceil(fraction * len(values)) - 1))]


def auc(positive: list[float], negative: list[float]) -> float | None:
    # Rank-based Mann-Whitney statistic, with half credit for ties.
    if not positive or not negative:
        return None
    tagged = sorted([(x, 1) for x in positive] + [(x, 0) for x in negative])
    negative_seen, concordant, i = 0, 0., 0
    while i < len(tagged):
        j = i
        while j < len(tagged) and tagged[j][0] == tagged[i][0]:
            j += 1
        pos = sum(label for _, label in tagged[i:j])
        neg = j - i - pos
        concordant += pos * (negative_seen + .5 * neg)
        negative_seen += neg
        i = j
    return concordant / (len(positive) * len(negative))


def add_combined(row: dict[str, float], centers: dict, scales: dict) -> dict:
    # Fixed equal weights in calibration-null SD units, not tuned on alternatives.
    result = dict(row)
    result['combined'] = sum((row[m] - centers[m]) / scales[m]
                             for m in ('rssi_only', 'paired_reference_retention'))
    return result


def detection_experiment(seed: int, trials: int) -> dict:
    calibration_rng = stable_rng(seed, 'calibration-null')
    calibration = [trial(calibration_rng, 'nominal_null') for _ in range(trials)]
    calibration = [row for row in calibration if row is not None]
    if len(calibration) < 20:
        raise ValueError('Insufficient calibration observations')
    base_methods = METHODS[:-1]
    centers = {m: statistics.mean(row[m] for row in calibration) for m in base_methods}
    scales = {m: statistics.stdev(row[m] for row in calibration) for m in base_methods}
    calibration = [add_combined(row, centers, scales) for row in calibration]
    thresholds = {m: quantile([row[m] for row in calibration], .95) for m in METHODS}
    rows_by_scenario, reports = {}, {}
    for scenario in SCENARIOS:
        rng = stable_rng(seed, f'holdout:{scenario}')
        rows = [trial(rng, scenario) for _ in range(trials)]
        scored = [add_combined(row, centers, scales) for row in rows if row is not None]
        rows_by_scenario[scenario] = scored
        methods = {}
        for m in METHODS:
            flagged = sum(row[m] > thresholds[m] for row in scored)
            methods[m] = {
                'flagged': flagged,
                # Primary rate includes abstentions. Abstentions are never detections.
                'flag_rate_all_trials': flagged / trials,
                'wilson_95_all_trials': wilson(flagged, trials),
                'flag_rate_scored_only': flagged / len(scored) if scored else None,
            }
        reports[scenario] = {'trials': trials, 'scored': len(scored),
                             'abstained': trials - len(scored), 'methods': methods}
    baseline = rows_by_scenario['nominal_null']
    for scenario in ('target_attenuation', 'target_erasure', 'sparse_erasure'):
        for m in METHODS:
            reports[scenario]['methods'][m]['auc_vs_nominal_null_scored_only'] = auc(
                [row[m] for row in rows_by_scenario[scenario]], [row[m] for row in baseline])
    return {
        'evidence': 'SYNTHETIC_ONLY',
        'assumptions': {
            'known_emitted_updates_per_beacon_per_window': N_EVENTS,
            'sparse_emitted_updates_per_beacon_per_window': 12,
            'target_mean_dbm': -84, 'reference_mean_dbm': -65,
            'iid_rssi_standard_deviation_db': 5, 'hard_sensitivity_dbm': -88,
            'nominal_callback_retention_range': [.45, .95],
            'same_retention_rate_for_both_beacons': 'except differential_scheduler_null',
            'rssi_quantization_db': 1, 'minimum_callbacks_in_each_group': 5,
            'unknown_apple_hardware_parameters': True,
        },
        'calibration_null_trials': trials,
        'threshold_method': '95th empirical percentile of independent calibration null; strict greater-than',
        'combined_method': 'equal-weight RSSI and paired-reference scores in calibration-null SD units',
        'thresholds': thresholds, 'centers': centers, 'scales': scales,
        'scenarios': reports,
    }


def alias_hz(frequency_hz: int, sample_rate_hz: int) -> int:
    """Real sinusoid alias magnitude, exact integer arithmetic."""
    if frequency_hz < 0 or sample_rate_hz <= 0:
        raise ValueError('Invalid frequency or sample rate')
    residual = frequency_hz % sample_rate_hz
    return min(residual, sample_rate_hz - residual)


def alias_candidates(aliases: list[int], sample_rates: list[int], upper_hz: int) -> list[int]:
    if not aliases or len(aliases) != len(sample_rates) or upper_hz < 0:
        raise ValueError('Invalid alias constraints')
    for alias, fs in zip(aliases, sample_rates):
        if fs <= 0 or not 0 <= alias <= fs / 2:
            raise ValueError('Invalid alias constraint')
    first, rate = aliases[0], sample_rates[0]
    candidates = set()
    for k in range(upper_hz // rate + 2):
        for f in (k * rate + first, k * rate - first):
            if 0 <= f <= upper_hz and all(alias_hz(f, fs) == a for a, fs in zip(aliases, sample_rates)):
                candidates.add(f)
    return sorted(candidates)


def alias_experiment() -> dict:
    f = 433_920_000
    rates = [2_000_000, 2_100_000, 2_300_000]
    aliases = [alias_hz(f, fs) for fs in rates]
    bound = 500_000_000
    steps = []
    for n in range(1, len(rates) + 1):
        candidates = alias_candidates(aliases[:n], rates[:n], bound)
        steps.append({'sample_rates_hz': rates[:n], 'aliases_hz': aliases[:n],
                      'candidate_count': len(candidates), 'candidates_hz': candidates})
    # Integer cycles avoid floating error from multiplying large RF frequencies.
    def samples(freq: int, fs: int, passband: tuple[int, int] = (0, 500_000_000)) -> list[float]:
        gain = 1. if passband[0] <= freq <= passband[1] else 0.
        return [gain * math.cos(2 * math.pi * ((freq * n) % fs) / fs) for n in range(128)]
    x, y = samples(f, rates[0]), samples(aliases[0], rates[0])
    blocked = samples(f, rates[0], (2_400_000_000, 2_500_000_000))
    lcm = math.lcm(*rates)
    return {
        'evidence': 'EXACT_DISCRETE_MODEL_NOT_HARDWARE',
        'input_frequency_hz': f, 'assumed_input_upper_bound_hz': bound,
        'progressive_constraints': steps,
        'one_rate_high_vs_low_tone_max_sample_difference': max(abs(a - b) for a, b in zip(x, y)),
        'unbounded_counterexample_hz': f + lcm,
        'counterexample_has_same_three_aliases': all(alias_hz(f + lcm, fs) == a for a, fs in zip(aliases, rates)),
        'ideal_frontend_stopband_output_power': sum(x*x for x in blocked) / len(blocked),
        'frontend_stopband_note': 'If the analog path rejects the input, the ideal sampler sees zero; no digital alias estimator can recover it.',
    }


def indistinguishability(seed: int) -> dict:
    rng = stable_rng(seed, 'indistinguishability')
    uniform = [rng.random() for _ in range(1000)]
    # Model A: radio keeps .4, scheduler keeps .8. Model B: .8 radio, .4 scheduler.
    # Composition is Bernoulli(.32) in both; couple with the same uniform variate.
    a = [x < .4 * .8 for x in uniform]
    b = [x < .8 * .4 for x in uniform]
    return {
        'radio_retention_a': .4, 'callback_retention_a': .8,
        'radio_retention_b': .8, 'callback_retention_b': .4,
        'observed_probability_both': .32,
        'coupled_observation_vectors_identical': a == b,
        'accepted_rssi_can_also_be_identical': 'under RSSI-independent erasure and callback loss',
        'implication': 'No classifier can distinguish these worlds from these observations alone. Independent reference/logging or intervention is needed.',
    }


def fusion_trial(rng: random.Random, scenario: str) -> dict[str, float]:
    """BLE attenuation + compatible-peer UWB range, with declared toy errors.

    Both radios see the same owned dual-radio peer. This is cross-band evidence
    fusion, not phase-coherent combining or reconstruction of a third RF band.
    """
    valid = ('nominal_null', 'obstruction', 'range_bias_null', 'path_exponent_null',
             'stale_range_null', 'shared_bias_null')
    if scenario not in valid:
        raise ValueError('Unknown fusion scenario')
    d0 = rng.uniform(1., 4.)
    d1 = d0 * rng.uniform(.7, 1.8)
    attenuation = 3. if scenario == 'obstruction' else 0.
    exponent = 3.5 if scenario == 'path_exponent_null' else 2.
    ble = 10 * exponent * math.log10(d1 / d0) + attenuation + rng.gauss(0., 1.1)
    measured0 = max(.1, d0 + rng.gauss(0., .08))
    measured1 = max(.1, d1 + rng.gauss(0., .08))
    if scenario == 'range_bias_null':
        measured1 *= .7
    if scenario == 'stale_range_null':
        measured1 = measured0
    if scenario == 'shared_bias_null':
        # An unobserved nuisance can look exactly like obstruction in both views.
        ble += 3.
    range_score = 20 * math.log10(measured1 / measured0)
    return {'ble_only': ble, 'uwb_range_only': range_score,
            'ble_plus_uwb_residual': ble - range_score}


def fusion_experiment(seed: int, trials: int) -> dict:
    methods = ('ble_only', 'uwb_range_only', 'ble_plus_uwb_residual')
    rng = stable_rng(seed, 'fusion-calibration')
    calibration = [fusion_trial(rng, 'nominal_null') for _ in range(trials)]
    thresholds = {m: quantile([x[m] for x in calibration], .95) for m in methods}
    scenarios = {}
    for scenario in ('nominal_null', 'obstruction', 'range_bias_null',
                     'path_exponent_null', 'stale_range_null', 'shared_bias_null'):
        rng = stable_rng(seed, f'fusion-holdout:{scenario}')
        rows = [fusion_trial(rng, scenario) for _ in range(trials)]
        result = {}
        for m in methods:
            flagged = sum(x[m] > thresholds[m] for x in rows)
            result[m] = {'flagged': flagged, 'flag_rate': flagged / trials,
                         'wilson_95': wilson(flagged, trials)}
        scenarios[scenario] = result
    return {
        'evidence': 'SYNTHETIC_ONLY_NOT_NATIVE_INTEGRATION',
        'assumptions': {
            'same_compatible_owned_peer_supports_ble_and_uwb': True,
            'distance_before_m': [1., 4.], 'distance_after_ratio': [.7, 1.8],
            'assumed_log_distance_exponent': 2., 'obstruction_loss_db': 3.,
            'ble_window_difference_noise_sd_db': 1.1, 'uwb_range_noise_sd_m': .08,
            'apple_device_error_statistics': 'not measured; values are hypothetical',
        },
        'thresholds': thresholds, 'trials_per_scenario': trials,
        'scenarios': scenarios,
        'claim': 'Joint information can reject a modeled geometry confound that each individual band cannot; this does not recover arbitrary-band RF.',
    }


def sigmoid(value: float) -> float:
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    exp_value = math.exp(value)
    return exp_value / (1 + exp_value)


def model_score(row: dict, model: dict) -> float:
    features = model['features']
    return sigmoid(model['intercept'] + sum(
        weight * (row[feature] - center) / scale
        for feature, weight, center, scale in zip(features, model['weights'], model['centers'], model['scales'])))


def tiny_model_experiment(seed: int, trials: int) -> dict:
    features = ('rssi_only', 'paired_reference_retention')
    training = []
    # Balanced labels, equal representation of two synthetic positive mechanisms.
    for scenario, label, count in (('nominal_null', 0, trials),
                                   ('target_attenuation', 1, trials // 2),
                                   ('target_erasure', 1, trials - trials // 2)):
        rng = stable_rng(seed, f'model-training:{scenario}')
        for _ in range(count):
            row = trial(rng, scenario)
            if row is not None:
                training.append((row, label))
    centers = [statistics.mean(row[f] for row, _ in training) for f in features]
    scales = [statistics.stdev(row[f] for row, _ in training) for f in features]
    vectors = [([1.] + [(row[f] - c) / s for f, c, s in zip(features, centers, scales)], y)
               for row, y in training]
    weights = [0., 0., 0.]
    # Fixed optimization settings. No hyperparameter selection on holdout results.
    epochs, learning_rate, l2 = 250, .15, .02
    for _ in range(epochs):
        gradient = [0., 0., 0.]
        for vector, label in vectors:
            error = sigmoid(sum(w * x for w, x in zip(weights, vector))) - label
            for i, x in enumerate(vector):
                gradient[i] += error * x / len(vectors)
        for i in range(3):
            weights[i] -= learning_rate * (gradient[i] + (l2 * weights[i] if i else 0.))
    model = {'kind': 'two-feature L2 logistic classifier', 'features': list(features),
             'centers': centers, 'scales': scales, 'intercept': weights[0], 'weights': weights[1:],
             'training_rows': len(training), 'training_negative_rows': sum(y == 0 for _, y in training),
             'training_positive_rows': sum(y == 1 for _, y in training),
             'epochs': epochs, 'learning_rate': learning_rate, 'l2': l2,
             'score_semantics': 'uncalibrated synthetic-model score, not real-world event probability',
             'minimum_callbacks_each_group': 5}
    rng = stable_rng(seed, 'model-threshold-null')
    threshold_rows = [trial(rng, 'nominal_null') for _ in range(trials)]
    threshold_scores = [model_score(row, model) for row in threshold_rows if row is not None]
    threshold = quantile(threshold_scores, .95)
    model['threshold'] = threshold
    scenarios = {}
    for scenario in SCENARIOS:
        # Same test vectors as the hand-written baselines, never training vectors.
        rng = stable_rng(seed, f'holdout:{scenario}')
        rows = [trial(rng, scenario) for _ in range(trials)]
        scored = [model_score(row, model) for row in rows if row is not None]
        flagged = sum(score > threshold for score in scored)
        scenarios[scenario] = {'trials': trials, 'abstained': trials - len(scored),
                               'flagged': flagged, 'flag_rate_all_trials': flagged / trials,
                               'wilson_95_all_trials': wilson(flagged, trials)}
    return {'evidence': 'TRAINED_AND_TESTED_ON_SYNTHETIC_DATA_ONLY', 'model': model,
            'threshold_calibration_rows': len(threshold_scores), 'scenarios': scenarios,
            'not_app_integrated': True,
            'out_of_distribution_policy': 'No claimed reliability beyond the published synthetic model; nuisance stress results are retained.'}


def run(seed: int = DEFAULT_SEED, trials: int = 1000) -> dict:
    if not isinstance(trials, int) or not 50 <= trials <= 10000:
        raise ValueError('Trials must be between 50 and 10000')
    return {
        'schema_version': VERSION, 'seed': seed, 'trials_per_scenario': trials,
        'claim_level': 'synthetic falsification and feasibility study, not physical discovery',
        'runtime_dependencies': 'Python 3.10+ standard library only',
        'missing_observation_experiment': detection_experiment(seed, trials),
        'alias_disambiguation_experiment': alias_experiment(),
        'ble_uwb_fusion_experiment': fusion_experiment(seed, trials),
        'tiny_learned_model': tiny_model_experiment(seed, trials),
        'nonidentifiability_counterexample': indistinguishability(seed),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=int, default=DEFAULT_SEED)
    parser.add_argument('--trials', type=int, default=1000)
    args = parser.parse_args()
    result = run(args.seed, args.trials)
    result['source_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))


if __name__ == '__main__':
    main()
