# Thirty-ninth combined local checkpoint

Clean tested source c57f4f50122fcf8abda3b5633855a9f23ae34417. Run 2026-11-08T08:10:20.165Z to 2026-11-08T08:12:07.472Z.
All nine stages and process groups passed and settled. Result and manifest match.
1711/1711 Node tests, zero skips, plus 22 archive and 5 preflight = 1738 total.
Portable C, full TypeScript, inventory 541, three offline JavaScript exports and
unchanged 8,806-byte synthetic lab passed. Forty browser cases listed, none executed.
All existing protected dependency/native/source-register and original-file hashes
remain unchanged.

The exact native TypeScript adapter now traverses the existing C callback fixture
through BleTransport and DeviceSession, with explicit fake RN/PLX, permissions,
MTU, SDK scheduling and teardown. Actual C replies, IDs/CRC, maximum ping and the
READY-shaped fragmentation edge pass for simulated Android and iOS. These are not
native binaries or physical devices. The C fixture never invokes firmware startup.

The chain exposed new native connection work after session close when a late
permission grant settled. Reviewed optional acquisition cancellation prevents the
next setup phase, but never races away already-issued native effects. Reserved
pre-dispatch work issues no call; dispatched effects remain owned through settlement
and exact cleanup. A rejected driver with no returned cleanup certificate remains
conservatively unknown, regardless of abort or apparent native cleanup success.
Existing iOS destruction acknowledgment remains unresolved and its reset gate closed.

Actual App source-extracted handlers/unmount cleanup also reproduced new acquisition
after detach and after awaiting prior-session close. Attachment, epoch, operation
and selected-session guards now block it and stale UI publication. Busy publication
precedes browser refresh so an old operation cannot overwrite a synchronously started
successor. Foreground policy and browser gesture/ownership contracts are unchanged.
Before-fix and independent adversarial logs remain retained; focused counts overlap
this aggregate. These tests do not claim mounted React/browser/phone behavior.

The separate existing SDK initialization/configuration delta still lacks fresh
independent approval. No denied review was retried, delegated or rerouted. Firmware,
installed dependencies, native project sources and CI remain unchanged. No actual
SDK/native build, browser, device/radio/USB/flash, provider/account/credential/settings
change or remote publication occurred. Genuine native/browser and physical acceptance
remain open. Patch reconstruction separately proves tracked-byte equality, not a
runtime rerun. Offline flags are not OS isolation.
