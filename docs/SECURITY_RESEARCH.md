# Security research and trust boundaries

Research uses owned equipment or explicitly authorised equipment within a defined test environment. Record the fixture owner/authority, exact targets and interfaces, permitted operations, time window, stop conditions, data handling and a route to disconnect equipment. Keep real third-party credentials and unrelated traffic out of shared fixtures and commits.

## Research environments

| Environment | Purpose | Required separation |
| --- | --- | --- |
| Software fixtures | Protocol parsing, corrupted frames and timing analysis | Synthetic inputs labelled; no hardware claim |
| Wired accessory bench | Native transport, lifecycle and board timing | Known phone/board/cable, explicit attachment, current/voltage limits |
| RF/NFC lab | Owned tags, readers, sensors and appliances | Controlled targets; suitable shielding/cabled paths and receiver protection |
| Vehicle bench | CAN/diagnostic interoperability | Isolated ECU/simulator, no connection to a moving vehicle or safety-critical live network |
| Industrial/access bench | Register/property reads and secure-channel commissioning | Local simulator or disconnected owned equipment, known bus topology, valid credentials |

## Threat model and current limits

An attached accessory, imported log, RF capture, NFC tag or AI response can be malicious or malformed. Protect the host through bounded parsing, shape validation, limited operations and finite timeouts. Do not execute instructions found in a capture or forward arbitrary commands through a sidecar. Do not identify a person or authorise an operation using a tag UID alone.

AXP/1 currently has no accessory authentication, encryption, trusted clock or anti-replay protection. Its CRC cannot establish sender identity. The initial three system commands have no peripheral actuation. Adding credentials or state-changing drivers before a separate trust design would exceed this foundation's assurances.

USB permission authorises an application to communicate with a USB device; it does not authorise use of systems connected downstream. Likewise, a BLE bond or a decoded RF frame is not authority to operate equipment. Maintain those boundaries in capability manifests and operator workflows.

Future remote/sidecar services require local binding, authenticated clients, operation allowlists, bounded files/processes, protected secrets and explicit data export. AI receives observations, not unrestricted control. Provider outputs remain hypotheses until checked against independent fixtures. Persistent capture encryption, signed updates and tamper-evident evidence are planned, not implemented.

## Research output

Publish reproducible compatibility evidence and limitations. Do not include manufacturer key databases, captured personal data, cloned access credentials, bypass automation or unsupported claims of universal unlocking. When a supported interface requires authentication or enrolment, record that prerequisite explicitly rather than suggesting protocol coverage removes it.

For a suspected vulnerability, retain the minimal authorised reproduction and affected versions privately, stop tests outside scope, and use the vendor/project's coordinated reporting process. This repository has no public vulnerability-submission service configured yet.
