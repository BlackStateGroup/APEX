# Twenty-first combined local checkpoint

Fixed offline runner on clean source a417247bafe80651ac6bcb6b1ef521a8a566daf3.
Started 2026-11-08T03:41:41.988Z; finished 2026-11-08T03:42:47.581Z. All nine stages
passed and tracked process groups settled. Result/manifest bytes match.

828/828 Node tests, zero skipped; 22 archive and 5 REA preflight contract tests:
855 total, plus portable C. TypeScript, 541-entry inventory, all three offline
Expo JavaScript exports and synthetic lab passed. Thirty-one browser cases were
listed, none executed. Generated exports are excluded from this source package.
The unchanged synthetic demonstration is 5796 bytes including newline, SHA-256
a3d5a315c053b80d7c7fa4a5c62aa2d67b2a6316dcef9087f3a8eabe2ec35b82.

Protocol encode/CRC/streaming decode now read actual fixed, nonshared, attached
Uint8Array storage without caller byte hooks. Encode captures metadata once and
checks actual payload extent before allocation. Ordinary/golden/C wire bytes and
512/524 limits remain unchanged. Cross-realm byte views now encode; formerly
tolerated generic iterables and shared/resizable storage reject. Decoder retained
storage stays 524 bytes without a chunk-sized copy. Callback mutation/reset and
immediate nested pushes remain explicit, nontransactional behavior; detachment
throws before resuming. This is not an immutable stream or hostile-JS sandbox.
Independent protocol review passed 27 focused checks and six real host-C
integration checks; parent integrated protocol/session subset passed 123.

A separate Evidence-tab pasted-bundle preview uses unchanged exact bundle/record
validation and local hashing. Inspect is explicit; four bounded metadata summaries
per page. No journal access, import/restore/export/share, persistence or provider
connection was added. Verified state/reports are immutable. Oversized edits retain
the prior draft but clear results and block Inspect until an accepted replacement
or Clear. Activation leases/generations fence old actions and results; already
started hashing may continue, so this is not cancellation. Long legacy timestamps
retain exact source text but display an explicitly labeled 120-code-unit excerpt.
Whole-bundle and canonical record digests are distinguished from authenticity,
trusted time, physical reception, complete selection and chronological ordering.

Independent review reproduced mutable verified aliases and a 51,523-character
metadata rendering flood before repair. All original failures are retained.
Final independent review passed 26 focused checks plus TypeScript. Controller and
actual static TSX tests do not exercise mounted React scheduling, TextInput paste
behavior, layout, accessibility or native digest backends. The authored Playwright
scenario was only listed. These acceptance gates remain unrun.

All checks are local/synthetic except the owned host-C peer, which is not hardware.
Kotlin, installed BLE dependency, native BLE manager, lockfile and protected source
registers remain unchanged. No native permission, phone/radio/device, browser,
provider or remote publication action occurred. Earlier USB receipt hypothetical
model checks remain separate from the 855 aggregate total and do not establish
native recovery. Source/start status is not immutable-source isolation. Offline
flags and targeted network traps are not an operating-system network sandbox.
Raw outputs are preserved unchanged, with .txt appended to runner logs.
