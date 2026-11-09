"""Host tests for an offline synthetic lab; no phone/radio operations."""
import importlib.util
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/experimental/phone_sensing_lab.py'
spec = importlib.util.spec_from_file_location('phone_sensing_lab', SOURCE)
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class PhoneSensingLabTests(unittest.TestCase):
    def test_alias_at_boundaries(self):
        self.assertEqual(lab.alias_hz(0, 10), 0)
        self.assertEqual(lab.alias_hz(10, 10), 0)
        self.assertEqual(lab.alias_hz(5, 10), 5)
        self.assertEqual(lab.alias_hz(7, 10), 3)

    def test_alias_matches_brute_force(self):
        rates = [10, 13, 17]
        for f in range(60):
            aliases = [lab.alias_hz(f, rate) for rate in rates]
            expected = [x for x in range(101) if all(lab.alias_hz(x, r) == a for r, a in zip(rates, aliases))]
            self.assertEqual(lab.alias_candidates(aliases, rates, 100), expected)

    def test_more_independent_views_reduce_ambiguity(self):
        result = lab.alias_experiment()
        self.assertEqual([x['candidate_count'] for x in result['progressive_constraints']], [500, 24, 1])
        self.assertEqual(result['progressive_constraints'][-1]['candidates_hz'], [433920000])
        self.assertLess(result['one_rate_high_vs_low_tone_max_sample_difference'], 1e-12)

    def test_duplicate_view_adds_no_information(self):
        self.assertEqual(lab.alias_candidates([3], [10], 100), lab.alias_candidates([3, 3], [10, 10], 100))

    def test_bounded_prior_is_essential(self):
        result = lab.alias_experiment()
        self.assertTrue(result['counterexample_has_same_three_aliases'])
        self.assertGreater(result['unbounded_counterexample_hz'], result['assumed_input_upper_bound_hz'])
        self.assertEqual(result['ideal_frontend_stopband_output_power'], 0)

    def test_invalid_alias_constraints(self):
        for args in (([], [], 2), ([6], [10], 20), ([1], [0], 20), ([1], [10], -1)):
            with self.assertRaises(ValueError):
                lab.alias_candidates(*args)
        with self.assertRaises(ValueError):
            lab.alias_hz(-1, 10)

    def test_score_exact_common_factor_cancellation(self):
        before = ([-80.] * 80, [-60.] * 100)
        after = ([-80.] * 40, [-60.] * 50)
        result = lab.scores(before, after)
        self.assertAlmostEqual(result['paired_reference_retention'], 0.)
        self.assertAlmostEqual(result['uncorrected_retention'], math.log(2))
        self.assertEqual(result['rssi_only'], 0)

    def test_sparse_windows_abstain(self):
        self.assertIsNone(lab.scores(([-80.] * 4, [-60.] * 5), ([-80.] * 5, [-60.] * 5)))
        self.assertIsNotNone(lab.scores(([-80.] * 5, [-60.] * 5), ([-80.] * 5, [-60.] * 5)))

    def test_identical_scores_when_erasure_is_differential_callback_loss(self):
        # Separate latent explanations, exactly the same app-visible evidence.
        before = ([-80.] * 80, [-65.] * 100)
        after_radio = ([-80.] * 40, [-65.] * 100)
        after_os = ([-80.] * 40, [-65.] * 100)
        self.assertEqual(lab.scores(before, after_radio), lab.scores(before, after_os))
        self.assertTrue(lab.indistinguishability(8)['coupled_observation_vectors_identical'])

    def test_auc_ties_and_order(self):
        self.assertEqual(lab.auc([1, 1], [1, 1]), .5)
        self.assertEqual(lab.auc([3, 4], [1, 2]), 1.)
        self.assertEqual(lab.auc([1, 2], [3, 4]), 0.)
        self.assertIsNone(lab.auc([], [1]))

    def test_quantile_edges(self):
        self.assertEqual(lab.quantile([3., 1., 2.], 0), 1.)
        self.assertEqual(lab.quantile([3., 1., 2.], 1), 3.)
        with self.assertRaises(ValueError):
            lab.quantile([], .95)

    def test_tiny_model_stable_scores_and_no_holdout_training(self):
        self.assertEqual(lab.sigmoid(0), .5)
        self.assertEqual(lab.sigmoid(10000), 1)
        self.assertEqual(lab.sigmoid(-10000), 0)
        r = lab.tiny_model_experiment(2345, 50)
        self.assertEqual(r['model']['training_rows'], 100)
        self.assertEqual(r['model']['training_positive_rows'], 50)
        self.assertEqual(r['model']['training_negative_rows'], 50)
        self.assertEqual(len(r['model']['weights']), 2)
        self.assertGreaterEqual(r['model']['threshold'], 0)
        self.assertLessEqual(r['model']['threshold'], 1)
        self.assertTrue(r['not_app_integrated'])

    def test_wilson_bounds_and_known_center(self):
        low, high = lab.wilson(50, 100)
        self.assertAlmostEqual(low + high, 1.)
        self.assertLess(low, .5)
        self.assertGreater(high, .5)
        self.assertGreaterEqual(lab.wilson(0, 100)[0], 0)
        self.assertLessEqual(lab.wilson(100, 100)[1], 1)
        with self.assertRaises(ValueError):
            lab.wilson(1, 0)

    def test_calibration_rng_is_domain_separated(self):
        a = lab.stable_rng(1, 'calibration-null')
        b = lab.stable_rng(1, 'holdout:nominal_null')
        self.assertNotEqual([a.random() for _ in range(10)], [b.random() for _ in range(10)])
        self.assertEqual(lab.stable_rng(1, 'x').random(), lab.stable_rng(1, 'x').random())

    def test_window_constraints(self):
        for kwargs in ({'q': -1}, {'q': 2}, {'q': .5, 'erasure': 2}, {'q': .5, 'events': 0}):
            with self.assertRaises(ValueError):
                lab.window(random.Random(1), **kwargs)
        self.assertEqual(lab.window(random.Random(1), 0), ([], []))

    def test_unknown_scenarios_fail(self):
        with self.assertRaises(ValueError):
            lab.trial(random.Random(1), 'unknown')
        with self.assertRaises(ValueError):
            lab.fusion_trial(random.Random(1), 'unknown')

    def test_reproducible_and_finite_report(self):
        a = lab.run(1234, 50)
        self.assertEqual(a, lab.run(1234, 50))
        json.dumps(a, allow_nan=False)
        self.assertEqual(a['claim_level'], 'synthetic falsification and feasibility study, not physical discovery')
        for scenario in a['missing_observation_experiment']['scenarios'].values():
            self.assertEqual(scenario['trials'], scenario['scored'] + scenario['abstained'])
            for method in scenario['methods'].values():
                self.assertEqual(method['flag_rate_all_trials'], method['flagged'] / 50)

    def test_invalid_trial_budget(self):
        for trials in (0, 49, 10001):
            with self.assertRaises(ValueError):
                lab.run(1, trials)

    def test_cli_json_and_source_hash(self):
        completed = subprocess.run([sys.executable, str(SOURCE), '--trials', '50'],
                                   check=True, text=True, capture_output=True, timeout=30)
        result = json.loads(completed.stdout)
        self.assertEqual(len(result['source_sha256']), 64)
        self.assertEqual(completed.stderr, '')


if __name__ == '__main__':
    unittest.main()
