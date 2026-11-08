# Final independent Flipper review artifacts

The original environment-specific scripts and their final outputs are preserved.
They were run against the sibling implementation with the same final core SHA256:
8b1b80c9ae649b57ca2647560b4448ad788b8cdc511c3ef7fde64eabc3527629.
Their absolute checkout imports identify the reviewed workspace, not a portable
installation path. The original .log contents are stored unchanged as .txt here.

Review passed 37 cases, including all 65,536 two-byte complete-frame inputs, plus
separate caps and host-input checks. It independently reproduced and verified the
fix for resizable views becoming out of bounds. Main combined validation separately
reruns the checked-in suites after integration.

Measured dense output after the aggregate field cap: 8,224 input bytes, 4,096 fields,
729,857 compact core JSON characters and 1,456,230 pretty CLI JSON bytes. Original
bytes appear once. fields/unknownFields reference lists serialize metadata again;
CLI holds byte snapshot, numeric byte array and full JSON simultaneously. Structural
bounds do not establish an exact worst-case heap or a separate serialized-byte cap.

No upstream conformance oracle, device/browser/radio acceptance, hostile filesystem
race proof or licensing clearance was established. Test-only fixture construction
helpers are allowed; production exports no outbound encoder or command path.
