# APEX unconventional phone-sensing lab

**Status: executable synthetic experiments, not a physical discovery.**

The hypothesis worth pursuing is that several restricted observations can jointly
reveal something that no single observation identifies. We tested this constructively
instead of dismissing it. Three experiments support narrower, useful versions of
that idea and supply deliberately failing controls. None uses a phone, receives
real RF, transmits, changes permissions, or contacts external devices.

## Reproduce

Python 3.10+ standard library only. From the repository root:

```sh
python3 -m unittest discover -s tests -p test_phone_sensing_lab.py -v
python3 tools/experimental/phone_sensing_lab.py > /tmp/phone-sensing-results.json
```

The committed `research/phone-sensing-lab-results.json` uses seed `20261109` and
1,000 calibration trials plus 1,000 independently seeded trials for every scenario.
The report records the executable's SHA-256. Use `--seed` and `--trials` to repeat
with other samples; allowed trial counts are 50–10,000. Calibration and every test
scenario use separate deterministic random streams. No threshold is selected on
positive test examples. These are exploratory hypotheses, not a preregistered study.

Binary rates include Wilson 95% intervals. They describe Monte Carlo uncertainty
under the specified model, **not uncertainty about actual phone performance**.
Parameters are assumed, not fitted to or measured on Apple hardware. Baseline
thresholds use a calibration-null 95th percentile; this is not a guarantee of a
5% error rate under distribution shift. All outcomes, including failures, are
retained. No production app behavior is changed by this lab.

## 1. Use absent observations as a second signal

**Hypothesis:** a paired reference can cancel a common callback-retention rate,
revealing target-path changes which surviving-packet RSSI misses.

[De, Vasisht, Sundaram and Kravets](https://arxiv.org/abs/2306.01688) already studied
BLE packet-reception probability and RSSI sampling bias. Our contribution here is
an APEX-oriented computational comparison and confound test, not invention of
packet-loss sensing or a reproduction of their measured results.

For a known number of emitted updates, expected target and reference observation
rates are `q * p_target` and `q * p_reference`. Their ratio cancels a shared `q`.
This assumes a stable reference, known update counts, and genuinely common
retention behavior. It does not follow merely from having two Bluetooth devices.

The experiment draws Gaussian RSSI values, retains values above an assumed
sensitivity threshold, quantizes RSSI to 1 dB, and independently applies callback
retention. Both beacons share a retention *probability*, not identical temporal
outages. Counts are unique synthetic updates, not all BLE packets. Before and
after windows each contain 160 emitted updates per beacon; callback retention
varies independently between 45% and 95%. At least five observations in each of
four groups are required; otherwise the method abstains.

Methods:

- RSSI-only: decrease in mean surviving target RSSI.
- Uncorrected retention: log decrease in target observation count.
- Paired reference: target log decrease minus reference log decrease.
- Combined: equal-weight RSSI and paired-reference scores, each normalized by
  calibration-null standard deviation. Weights are fixed, not fitted on positives.

### Actual synthetic results

Percentage of all trials flagged, including abstentions in the denominator:

| Scenario | RSSI only | Uncorrected | Paired reference | Combined |
|---|---:|---:|---:|---:|
| Nominal unchanged target | 6.1% | 4.3% | 4.9% | 4.3% |
| Target attenuated by 4 dB | 95.1% | 37.5% | 93.2% | 99.8% |
| Target suffers 35% RSSI-independent erasure | 9.1% | 33.4% | 90.5% | 69.8% |
| Common callback rate falls, target unchanged | 9.6% | 100.0% | 12.3% | 10.2% |
| Target-specific callback loss, radio unchanged | 8.5% | 34.3% | 90.7% | 67.5% |
| Receiver gain changes, target unchanged | 94.8% | 35.3% | 93.3% | 99.8% |
| Reference improves, target unchanged | 5.5% | 3.9% | 99.7% | 95.9% |

This is promising for *change detection under a verified model*, not distance,
identity, occupancy, packet decoding or an interference classifier. The selective
erasure model deliberately removes information from surviving RSSI; its poor
RSSI performance is expected, not a surprise discovery. Combining every metric
also did worse than the paired metric alone in that condition.

The reference cancels the expected shared rate but not finite-sample uncertainty:
the stronger common scheduler shift raises false alarms to 12.3%. With just 12
emitted updates per beacon per window, nominal-null trials abstained 38.5% of the
time and the paired method still flagged 17.5% of *all* null trials. Sparse-erasure
trials abstained 64.5%, with only 19.1% detected. The dense-window calibration is
not portable to sparse data. Those failures are part of the result.

**Exact counterexample:** radio retention 0.4 with callback retention 0.8 has the
same observation probability as radio retention 0.8 with callback retention 0.4.
For RSSI-independent erasure, the RSSI distribution can also be identical. The
lab constructs identical coupled observations. No analysis of those observations
alone can determine which mechanism caused loss. A reference or intervention
must supply genuinely independent evidence, not a confidence label.

### APEX and iPhone path

APEX already keeps selected BLE PLX source fields and callback-receipt timestamps:
`packages/core/ble-observation-session.ts`, `ble-plx-source-evidence.ts`, and
`src/foreground-ble-workbench.ts`. The current workbench is capped at ten seconds
or 25 total callbacks, across all observed sources. The 160-update experiment is
not a claim that those existing collections are sufficient. No acquisition cap
was changed. Any longer collection is separate engineering and device acceptance.

Apple's [Core Bluetooth guidance](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/BestPracticesForInteractingWithARemotePeripheralDevice/BestPracticesForInteractingWithARemotePeripheralDevice.html)
explains foreground discovery callbacks and duplicate reporting. Its
[background guide](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html)
explains that duplicates are coalesced in the background. Callback receipt is not
an RF sampling clock. Deduplicate at an explicitly validated transmitter-update
level and obtain the emitted-update denominator independently. Generic BTHome
packet identifiers cannot simply be assumed to count every physical packet;
repeats, wraparound, restart and update semantics require verification.

## Tiny learned-model baseline

A two-feature, L2-regularized logistic classifier learns from RSSI change and
paired-reference retention change. The committed output includes its two weights,
intercept, feature normalization, threshold, optimization settings and sample floor.
This is a tiny explainable model, not a neural foundation model or an app feature.

It trains on 1,000 synthetic null examples and 1,000 positives split equally
between attenuation and erasure, then chooses a threshold on another 1,000 null
examples. Evaluation reuses exactly the held-out vectors of the hand-written
baselines above. Training, threshold calibration and evaluation have separate
random streams. Its sigmoid score is **not** a calibrated real-world probability.

Actual results were 99.3% detection for the attenuation model and 90.6% for erasure,
with 6.6% nominal false positives. It did not establish superiority to the simple
paired method on erasure: that baseline achieved 90.5% with 4.9% false positives.
The learned model falsely flagged 90.4% of target-specific scheduler-loss trials,
98.7% of receiver-gain trials, and 99.5% of improving-reference trials. It abstained
on the same sparse windows as the other methods and detected only 19.0% of all
sparse-erasure trials. Its threshold is not acceptable for physical deployment.

This is a concrete first step toward an app understanding observed patterns, and
also a check against treating a learned label as a discovered physical cause.
Training with real controlled observations, held-out devices/sessions, explicit
out-of-distribution handling and stricter abstention is still required. Merely
adding a model cannot separate observationally identical radio and OS-loss worlds.

## 2. Fuse genuinely different phone-radio observations

**Hypothesis:** BLE signal changes plus a range observation from another radio can
separate motion-induced path loss from an additional attenuation event better
than either view alone.

A possible supported route is an owned compatible peer with BLE and
[Apple Nearby Interaction UWB](https://developer.apple.com/nearby-interaction/).
Nearby Interaction supplies peer-relative spatial information; compatible devices
and the required setup are necessary. It is an active cooperative ranging feature,
not passive arbitrary-UWB reception. This lab never starts a session. UWB and
Bluetooth are not phase-coherently combined here, and no third-band waveform is
recovered. The API path is proposed, not integrated or physically validated.

The toy model uses a log-distance BLE loss with exponent 2, a moving peer initially
1–4 m away, a before/after distance ratio 0.7–1.8, Gaussian range errors of 0.08 m
and BLE window-difference errors of 1.1 dB. These are hypothetical error values.
Fusion subtracts `20 log10(range_after / range_before)` from the BLE loss. The
modeled positive event is an additional 3 dB of attenuation.

| Scenario | BLE only | UWB range only | Fused residual |
|---|---:|---:|---:|
| Nominal null, geometry may change | 3.9% | 7.3% | 3.6% |
| Additional 3 dB attenuation | 40.2% | 6.0% | 78.7% |
| Range underestimated 30%, no attenuation event | 3.9% | 0.0% | 82.3% |
| Actual path exponent 3.5, assumed 2 | 33.6% | 5.1% | 40.1% |
| Stale range, no attenuation event | 4.4% | 0.0% | 47.6% |
| Unmodeled 3 dB BLE nuisance, no target event | 42.8% | 5.0% | 79.3% |

The constructive finding is that an independent second radio can remove one
otherwise ambiguous degree of freedom. The failing controls show why timestamps,
calibration, missingness and nuisance modeling matter. A latent disturbance that
produces the same observations as the target remains unidentifiable. These values
must not be described as phone detection accuracy or scientific breakthrough.

## 3. Can several limited listeners identify an otherwise ambiguous frequency?

**Hypothesis:** multiple known analog-to-digital views can disambiguate aliases,
provided the original signal reaches each analog path and additional assumptions
hold. This is the closest tested version of combining limited listeners to infer
something each alone cannot determine.

Established [sub-Nyquist multiband work by Mishali and Eldar](https://arxiv.org/abs/0902.4291)
uses deliberate analog mixing before low-rate sampling. It supports exploring
multi-view acquisition, but does not establish that an iPhone's public APIs expose
those views. [Analog Devices' sampling explanation](https://www.analog.com/en/resources/analog-dialogue/raqs/raq-issue-64.html)
distinguishes input bandwidth from sample rate. A high carrier frequency can be
observed at a low rate if the analog front end passes it and ambiguity is managed.

The exact arithmetic experiment assumes **one stationary real sinusoid**, an
ideal front end passing 0–500 MHz, exact known sample rates, noiseless alias
estimates, and an independently justified 0–500 MHz input-frequency bound:

| Ideal sampling views | Observed aliases | Remaining input-frequency candidates |
|---|---|---:|
| 2.0 MHz | 80 kHz | 500 |
| 2.0 and 2.1 MHz | 80 and 780 kHz | 24 |
| 2.0, 2.1 and 2.3 MHz | 80, 780 and 780 kHz | 1: 433.92 MHz |

The full candidate sets are retained in the result JSON. A single 2 MHz sampler
produces the same real samples for 433.92 MHz and 80 kHz within floating-point
roundoff. Three constraints resolve that ambiguity **within the declared bound**.
Repeating the same view adds no information. Without the bound, 1,399.92 MHz gives
the same three aliases. Multiple tones, drifting oscillators, sample-clock error,
phase noise and alias-estimation error are not covered by this exact experiment.

A separate ideal-filter control rejects the 433.92 MHz input before sampling and
produces zero signal power. There is then nothing to reconstruct. That is a model
control, not a measurement of an actual phone filter. We have not characterized
phone out-of-band sensitivity or nonlinear coupling and do not assign it zero
by assumption in any physical claim.

This experiment uses different sampling views of a shared analog input, **not**
proof that Bluetooth, Wi-Fi and UWB outputs are interchangeable waveform samples.
App-level RSSI, decoded fields and range observations have different measurement
operators. Their useful combination is experiment 2, not synthetic raw I/Q.

## Which ambitious directions remain worth trying?

1. **Phone-only evidence fusion:** combine supported BLE observations, compatible
   peer UWB range and optional motion/orientation context. First determine whether
   independent information survives the real APIs and whether it beats the best
   individual channel on held-out nuisance conditions.
2. **Controlled out-of-band coupling:** characterize whether an unexpected signal
   leaves a repeatable signature in an accessible observation. Require a shielded,
   authorized test with calibrated attenuation, randomized signal-on/off states,
   harmonics/intermodulation controls and an independent instrument. No such
   excitation is authorized or performed by this computational lab. A signature
   alone is not reception or decoding of the original waveform.
3. **Receive-front-end-assisted reconstruction:** a receiver, filtered mixer or
   appropriate wideband sampler can create the missing analog observations, with
   APEX doing the inference. Prefer imported receive-only recordings first. APEX's
   existing offline I/Q inspectors are an integration destination; this document
   does not claim an iPhone directly accepts a chosen SDR or that a new receiver
   adapter is implemented.
4. **Sparse multiband reconstruction:** reproduce a published analog measurement
   model, then challenge it with clock error, saturation, unknown mixer gain,
   crowded spectra and an absent-band control. A positive noisy result would
   justify a hardware proposal. The current three-alias test is only a first,
   single-tone identifiability test, not general compressed-spectrum recovery.

## Physical experiment gates and falsifiers

No device testing has run. A future authorized bench must independently record:

- Phone model, OS, app/build hash, foreground state, permissions, thermal/battery
  state, exact accessory model/firmware and stable transmitter-update semantics.
- Emitted-update logs or a verified schedule, independent sniffer/instrument data,
  raw selected callback evidence and monotonic acquisition timestamps. Sequence
  counters alone do not prove transmitted-packet counts or independence.
- Randomized, interleaved target-change and sham trials; include ordinary phone
  rotation/movement, CPU load, missing callbacks, reference movement, range bias,
  background transitions and deliberate stale sensor alignment. Train/calibrate
  on separate sessions and hold out phones, days and room arrangements.
- The same timeout, minimum-sample and abstention rules for every method. Report
  abstentions, all-trial detection rates and false alarms, not only easy cases.

For a first registered engineering gate, require at most 5% false alarms across
held-out nuisance strata and at least a 10 percentage-point detection gain over
the best individual method, with uncertainty intervals excluding zero for the
paired gain. These are proposed acceptance targets, not achieved physical results.
If independent bands add no information, if calibration leaks between train/test,
if timestamp skew explains the gain, or if sham trials produce comparable effects,
reject the present hypothesis and revise the measurement model. A failure here
rules out a specific configuration, not every possible physical mechanism.

The next deliverable should be a bounded offline import/replay of *authorized*
paired BLE/UWB observations with strict provenance and abstention, before an app
adds live sensing. Physical operation, new permissions and external hardware
remain separately authorized steps.
