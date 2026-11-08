"""Independent exact-fraction cross-check; synthetic TLM bytes, no device/network."""
from pathlib import Path
from fractions import Fraction
import base64
import hashlib
import json
import random
import subprocess

rng = random.Random(20261108)
def decimal(n, places=9):
    sign = '-' if n < 0 else ''
    whole, remainder = divmod(abs(n), 10 ** places)
    fraction = f'{remainder:0{places}d}'.rstrip('0') if places else ''
    return f'{sign}{whole}' + (f'.{fraction}' if fraction else '')
def rational(value): return [str(value.numerator), str(value.denominator)]
inputs = []
expected = []
counts = {'within-tolerance': 0, 'outside-tolerance': 0, 'incomplete': 0}
for case in range(1200):
    width = 1 + case % 4
    offset = rng.randrange(14 - width + 1) if case % 20 else 14
    order = 'little' if (case // 4) % 2 else 'big'
    signed = bool((case // 8) % 2)
    divisor = [1, 3, 7, 10, 100, 256, 1000000000][case % 7]
    shift = rng.choice([-1000000000, -1, 0, 1, 1000000000])
    payload = bytes([0x20, 0] + [rng.randrange(256) for _ in range(12)])
    reading_text = decimal(rng.randrange(-10**20, 10**20), 9)
    reading = Fraction(reading_text)
    if offset + width <= len(payload):
        raw = int.from_bytes(payload[offset:offset + width], order, signed=signed)
        value = Fraction(raw, divisor) + shift
        residual = value - reading
        lower = abs(residual) * 10**9
        tolerance_int = lower.numerator // lower.denominator + (case % 3 - 1)
        tolerance_int = max(0, tolerance_int)
        tolerance_text = decimal(tolerance_int)
        match = abs(residual) <= Fraction(tolerance_text)
        status = 'within-tolerance' if match else 'outside-tolerance'
        row = {'status': status, 'rawInteger': str(raw), 'value': rational(value), 'residual': rational(residual), 'withinTolerance': match}
    else:
        tolerance_text = '0'
        status = 'incomplete'
        row = {'status': status, 'rawInteger': None, 'value': None, 'residual': None, 'withinTolerance': None}
    counts[status] += 2
    source = {
      'schemaVersion': 1, 'sdk': 'react-native-ble-plx@3.5.1', 'platform': 'ios',
      'representation': 'ios-normalized-fields-with-opaque-json-base64',
      'provenance': {'origin': 'synthetic-fixture', 'label': 'Independent synthetic TLM arithmetic oracle', 'capturedAt': None},
      'snapshot': {'id':'oracle', 'name':None, 'rssi':None, 'manufacturerData':None,
                   'rawScanRecord':'e30=', 'serviceData':{'FEAA':base64.b64encode(payload).decode()},
                   'serviceUUIDs':None, 'localName':None, 'txPowerLevel':None,
                   'solicitedServiceUUIDs':None, 'isConnectable':None, 'overflowServiceUUIDs':None},
      'unavailableFields':['name','rssi','manufacturerData','serviceUUIDs','localName','txPowerLevel','solicitedServiceUUIDs','isConnectable','overflowServiceUUIDs'],
      'undefinedFields':[]}
    document = json.dumps(source, separators=(',', ':'))
    dataset = {'schemaVersion':1, 'scope':'owned-lab', 'serviceUuid':'FEAA',
               'groups':[{'id':'a','condition':'synthetic a'},{'id':'b','condition':'synthetic b'}],
               'sources':[{'id':'oracle','platform':'ios','snapshotId':'oracle','origin':'synthetic-fixture'}],
               'trials':[{'id':key,'groupId':key,'sourceId':'oracle','receiptId':'synthetic-'+key,'document':document} for key in ['a','b']]}
    request = {'schemaVersion':1, 'dataset':json.dumps(dataset,separators=(',', ':')),
               'candidate':{'byteOffset':offset,'width':width,'byteOrder':order,'signed':signed,'divisor':divisor,'valueOffset':shift},
               'tolerance':tolerance_text,'assignments':[{'trialId':'a','subset':'discovery','expected':reading_text},{'trialId':'b','subset':'held-out','expected':reading_text}]}
    inputs.append(json.dumps(request, separators=(',', ':')))
    expected.append([row, row])
encoded = json.dumps(inputs).encode()
result = subprocess.run(['node', str(Path(__file__).with_name('check.mjs'))], input=encoded, capture_output=True, check=True)
actual = json.loads(result.stdout)
assert len(actual) == len(expected)
for case, (got, want) in enumerate(zip(actual, expected)):
    assert got == want, (case, got, want)
print(json.dumps({'syntheticDatasets':len(inputs),'rowsCompared':len(inputs)*2,'decisions':counts,
                  'oracle':'Python fractions.Fraction and int.from_bytes; no production arithmetic helper',
                  'seed':20261108,'inputSha256':hashlib.sha256(encoded).hexdigest(),
                  'result':'All exact integers, reduced value/residual fractions, statuses and inclusive tolerance decisions agree.'}, indent=2))
