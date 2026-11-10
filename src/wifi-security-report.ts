export const WIFI_REPORT_LIMIT = 2048;

export function inspectWifiReport(input: string) {
  if (input.length > WIFI_REPORT_LIMIT) throw new Error('Report exceeds the input limit.');
  const value: unknown = JSON.parse(input);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a Wi-Fi configuration report.');
  }
  const report = value as Record<string, unknown>;
  const fields = ['version', 'source', 'deviceStatus', 'security'];
  if (Object.keys(report).length !== fields.length || !fields.every(key => Object.hasOwn(report, key))) {
    throw new Error('Only configuration and device status fields are accepted.');
  }
  const { version, source, deviceStatus, security } = report;
  if (version !== 1 || (source !== 'manual' && source !== 'pwnagotchi-summary' && source !== 'example') ||
      (deviceStatus !== 'ready' && deviceStatus !== 'offline' && deviceStatus !== 'unknown')) {
    throw new Error('Invalid report version, source or device status.');
  }
  const findings = {
    open: 'The reported network is open. Enable authenticated Wi-Fi where possible.',
    wpa2: 'Review whether WPA3 is supported and use a strong, unique passphrase.',
    transition: 'Review whether legacy WPA2 compatibility is still needed.',
    wpa3: 'WPA3 Personal is reported. Verify the setting in the controller.',
    enterprise: 'Verify certificate validation and account policy in the controller.',
    unknown: 'Check the security mode in the controller before drawing conclusions.',
  } as const;
  if (typeof security !== 'string' || !Object.hasOwn(findings, security)) {
    throw new Error('Unsupported security mode.');
  }
  return { source, deviceStatus, security, finding: findings[security as keyof typeof findings] };
}
