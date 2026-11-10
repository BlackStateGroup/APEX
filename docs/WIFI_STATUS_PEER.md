# Wi-Fi status companion

**Analysis → Wi-Fi security report** accepts a manual configuration summary on
iPhone, Android and web. The native apps also have a live status card for a
Raspberry Pi or other Linux management host, including hardware normally used
to run Pwnagotchi. Run the APEX companion as a separate process on the host.
The connection reports the companion’s reachability, Linux uptime and the
network security mode declared when the companion starts. The status is about
the APEX companion and its host. The security mode is configuration supplied
by the operator, so confirm it against the current router settings.

The [proposed Wi-Fi access and recovery scope](WIFI_ACCESS_RECOVERY_INTENT.md)
records Black State’s intended capability for the APEX Wi-Fi area.

## Run the companion

Use an updated Python 3 installation on Linux and a private management
interface reachable by the phone. Set up a TLS certificate for the exact DNS
name or IPv4 address you will enter in APEX. The phone’s app trust store must
trust the certificate chain. On iPhone, grant Local Network access when prompted.

Generate a unique pairing token in a private file on the host.

```sh
( umask 077; python3 -c 'import secrets; print(secrets.token_hex(32))' > wifi-peer.token )
```

Start the peer with your management interface address and TLS files. The
example IPv4 address is a placeholder. The peer binds to loopback by default.

```sh
python3 tools/wifi-status-peer.py \
  --bind 192.0.2.10 --port 8443 \
  --cert ./chain.pem --key ./key.pem --token-file ./wifi-peer.token \
  --security wpa3
```

For a supported OpenWrt configuration, substitute `--openwrt-encryption
sae-mixed` for `--security wpa3`. Supply only the `encryption` value for the
intended wireless interface. For example, `uci -q get wireless.<section>.encryption`
returns that one value on the router when you substitute its section name.
The companion treats `psk2` as WPA2 Personal, `sae` as WPA3 Personal, `sae-mixed`
as transition mode and `wpa2` as Enterprise. For a configuration outside the
supported OpenWrt values, enter a verified mode explicitly or leave it unknown.

In the app, enter the HTTPS origin and the companion token obtained through
your setup channel, then tap **Connect and read status**. The pairing lasts
while the inspector is open in the foreground. Disconnecting, leaving the
inspector or moving the app out of the foreground clears the in-memory token
and result. Refresh sends a fresh status request during the active pairing.
Restart the companion with a newly generated token to invalidate the old one.

The peer serves `GET /v1/status` over HTTPS, checks a bearer token and returns a
small, versioned JSON response. APEX requests only that route, disables redirects
and cookies, bounds the accepted response and rejects unsupported fields.
Keep the laboratory peer on a private management interface. The built-in server
is a development companion. Native device compatibility, including Pwnagotchi
image and network setup, requires a physical bench test.

## Upstream code and interfaces

| Source | Used in this feature |
| --- | --- |
| [Expo](https://github.com/expo/expo) ([MIT](https://github.com/expo/expo/blob/main/LICENSE)) | APEX’s existing locked `expo/fetch` client provides native TLS, redirect control, cancellation and streamed responses on iOS and Android. |
| [CPython](https://github.com/python/cpython) ([PSF licence](https://github.com/python/cpython/blob/main/LICENSE)) | The peer uses the standard `ssl`, `http.server` and `hmac` modules for TLS, HTTP and token comparison. Linux `/proc/uptime` supplies the only host metric. |
| [OpenWrt netifd](https://github.com/openwrt/netifd/blob/a1e39a458f9601100ee6bf91b0d6800688cf6a5b/scripts/netifd-wireless.sh) | The upstream encryption mapping was used as a reference for the small UCI value map. APEX implements its own map and receives only the selected configuration value. |
| [Pwnagotchi health display](https://github.com/evilsocket/pwnagotchi/blob/9034d55d4d69c98fdd50cdf7ecd698a3248975a4/pwnagotchi/plugins/default/memtemp.py) ([GPLv3](https://github.com/evilsocket/pwnagotchi/blob/9034d55d4d69c98fdd50cdf7ecd698a3248975a4/LICENSE.md)) | Reviewed as a device health reference. The companion is an independent service on the same Linux host. |
| [Prometheus node_exporter](https://github.com/prometheus/node_exporter/blob/master/collector/stat_linux.go) ([Apache 2.0](https://github.com/prometheus/node_exporter/blob/master/LICENSE)) | Candidate for standard host metrics if the scope grows. The current implementation uses the local Linux interface directly. |

There are no new npm or Python package dependencies. The companion reads a
local uptime metric and a single operator-declared mode. It has no hooks into
Pwnagotchi’s capture engine or credentials.

## Verification

`node --test tests/wifi-status-peer.test.ts` exercises the request contract and,
on Linux with Python 3 and OpenSSL installed, starts a real loopback TLS peer.
The integration checks a successful read, OpenWrt transition mode, token
rejection and rejection of unsupported routes and write requests. This is a
host-side protocol check. The Playwright smoke test covers the manual web flow.
