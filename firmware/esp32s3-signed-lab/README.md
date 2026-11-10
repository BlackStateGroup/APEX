# USB-only signed-read laboratory peer

This separate ESP32-S3 / ESP-IDF v6.1 target implements experimental AXP/1 opcode
`0x70`. It is disabled by default, not shipping firmware, and not enabled in the
default APEX application. A separate [opt-in lab client](../../docs/SIGNED_READ_LAB_CLIENT.md)
provides native verification and explicit USB pairing controls. Nothing in this directory authorises flashing or operating
hardware. See [verification evidence](../../review-evidence/lab-signed-read/REPORT.md).

## Scope and isolation

Only signed **system.info**, **system.capabilities** and **system.ping** replies
are available. The target reuses the unchanged portable AXP parser and encoder,
but never calls the legacy dispatcher. Ordinary legacy reads and every other
outer/inner opcode are silent. Metadata requests must be empty; ping is an exact
binary echo up to 128 bytes. Replies stay below the host's 256-byte body limit.
Malformed inputs never receive signatures or trigger fallback/error commands.

There are no Bluetooth, Wi-Fi, receive-only radio, NFC, access-control, unlock,
write, firmware-update or arbitrary-command handlers. Radio configuration is
rejected at compilation, and the minimal target's component list excludes radio
adapters. The historical `esp32s3`, `esp32s3-reviewed`, `esp32s3-radio-rx` targets,
portable `firmware/core` and host authority are unchanged. The new app entry is
selected only by an explicit build-time flag.

`CONFIG_APEX_SIGNED_READ_LAB_OPT_IN` defaults to `n`. When off, `app_main` is
inert and the signing code is not compiled into the main component. SDK/ROM boot
behaviour still exists; this is not a claim that the board has no electrical
activity. When on, a valid separately provisioned key image is required **before
USB driver installation**. Missing/corrupt/mismatched keys stop startup. There
is no generated/default device key and no automatic erase or recovery.

## Exact cryptographic contract

The byte layout is unchanged from
[ACCESSORY_TRUST_FOUNDATION.md](../../docs/ACCESSORY_TRUST_FOUNDATION.md):

`UTF-8("APEX/AXP1/SIGNED-READ/V1\0") || raw public key[32] || complete canonical AXP request including CRC || response prefix through body`

The accepted AXP parser enforces the fixed version/reserved byte and nonzero ID,
so canonical re-encoding retains the exact accepted request. Monocypher 4.0.2's
optional pure Ed25519/SHA-512 implementation signs those bytes. Both host and
ESP32 builds compile the same C peer and signing sources. Node supplies real
Ed25519 verification, never peer signatures, in the interoperability tests.

CRC detects corruption; it is not authentication. A signature binds the paired
key and challenged response, not firmware integrity, truthful metadata, silicon
identity, proximity or ownership. The development ID is deliberately generic.

The accessory does **not authenticate hosts**. Anyone with the lab USB connection
may request these three reads. Repeating a valid request can yield the same valid
reply; the host's fresh challenge/request binding rejects replayed responses.
There is no accessory replay ledger, encryption or protection against live relays.
Do not add privileged operations under this read-only policy.

## Controlled offline lab-key provisioning

The tool creates a fresh CSPRNG seed for each lab identity. It cannot import a
seed, use a public test vector, overwrite a destination, open a serial port or
flash. For a separately approved lab setup, create a **new private directory
outside the checkout**:

```sh
node tools/provision_lab_signed_read.mjs --generate-new-lab-key /private/new-apex-lab-key "Owned bench S3"
```

The directory is mode 0700 and both files are mode 0600 on POSIX:

- `lab-key-partition.bin`: 4096 bytes containing `APEXLAB1`, a 32-byte seed,
  its 32-byte public key, then `0xff` padding. This is **secret material**.
- `public-key.json`: full public key and label for the trusted operator record.

The separate `lab_keys` data partition is subtype `0x40`, offset `0x110000`, size
`0x1000`, with the partition-table `readonly` flag. The firmware checks the
partition attributes, exact format/padding, and derives the public key from the
seed before comparing it with the stored public key. It only uses
`esp_partition_read`; no NVS initialisation, write or erase call is present.
The partition image is **not embedded in firmware or added to build/flash targets**.
Any eventual provisioning is a distinct approved operation on an identified board
after checking the entire partition layout and preserving existing data.

Obtain the full public key from the protected provisioning record through an
independent trusted channel. Explicitly compare and confirm all 64 hex characters
before `confirmPairing`; do not trust a device name, USB ID, on-wire key or mere
possession of this self-consistent image. This format is not an integrity seal
against substitution of the whole image; the independent host pin detects that.

The key image is plaintext, readable by anyone with sufficient physical/debug
access. No secure element, secure boot, flash encryption, anti-cloning or production
key custody is provided. Use only disposable laboratory identities, never production
credentials or RFC/public test seeds. Protect the operator directory and avoid
logs/backups/CI artifacts containing the image. The firmware wipes temporary
seed/record storage and clears the signing state on close/failure. Node/OpenSSL
managed key memory cannot be guaranteed fully erased by the provisioning tool.
Key replacement needs new offline provisioning and explicit host revocation and
pairing. No on-wire key export or rotation exists.

## Build and software checks

```sh
python3 tools/build_lab_signed_read.py
node --test tests/lab-signed-read.test.ts tests/accessory-trust.test.ts
python3 tools/build_lab_signed_read.py --sanitize
APEX_LAB_SANITIZE=1 node --test tests/lab-signed-read.test.ts
npm test
npm run typecheck
```

With ESP-IDF **v6.1** active, the default build is inert:

```sh
idf.py -C firmware/esp32s3-signed-lab set-target esp32s3 build
```

For an opted-in **compilation only**, explicitly enable the Kconfig setting in
this separate project using `menuconfig`, then run `build`. The dedicated CI
workflow compiles both configurations in separate build directories. Neither
configuration includes a key. No test opens USB/BLE, provisions or flashes.

The host executable accepts only pipe input and an explicit offline key image;
it is not a production transport adapter. Tests create random ephemeral identities
in private temporary directories and delete them. Their lab approval declarations
are test fixtures, not evidence of a human pairing with physical hardware.

## Runtime bounds and remaining acceptance

Buffers are fixed-size and one serial owner feeds the parser. Callbacks must not
reenter. The target uses a 16 KiB main-task stack; actual device stack headroom
and latency remain unmeasured. USB partial writes advance by the returned byte
count; an error/timeout fences the peer and wipes its key without retry or fallback.
After 4096 signed replies, the next eligible read closes the peer; resumption needs
a separately authorised restart. Invalid frames consume bounded parser storage
but there is no CPU/rate or DoS guarantee. Partial requests are discarded after
500 ms without input. Detected USB SOF/bus loss after a connection is terminal for
that boot and wipes the peer. SOF indicates bus presence, not whether a serial
application is open; a port close without bus loss is not detected. Actual timing
and phone/USB cleanup still require physical acceptance. Controlled SDK tests
exercise the actual main loop, including partial writes, failure and timeout paths.

Before physical use: review protocol/key custody and this implementation, identify
the owned board and its flash layout, approve provisioning/flashing separately,
measure real USB behaviour, signing latency/task stack and disconnect recovery,
and review/physically validate the opt-in native crypto, USB transport and human
pairing UI. iPhone USB transport remains unavailable.
No physical accessory, iPhone or Android acceptance is implied by software tests.
