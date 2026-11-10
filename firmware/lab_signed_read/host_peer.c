/* Pipe-only executable for interoperability tests. No serial device access.
 * Key path is explicit; key bytes never appear in arguments or diagnostics. */
#include "lab_peer.h"
#include "monocypher.h"
#include <stdio.h>
#include <string.h>

static apex_lab_peer_t peer;
static int failed;
static void output(const uint8_t *bytes, size_t length, void *context) {
    (void)context;
    if (fwrite(bytes, 1, length, stdout) != length || fflush(stdout) != 0) {
        failed = 1; apex_lab_peer_close(&peer);
    }
}
int main(int argc, char **argv) {
    uint8_t record[APEX_LAB_KEY_IMAGE_SIZE];
    FILE *file;
    size_t count;
    int extra, byte, enabled;
    if (argc != 3 || (strcmp(argv[1], "--lab-opt-in") && strcmp(argv[1], "--disabled"))) return 2;
    enabled = strcmp(argv[1], "--lab-opt-in") == 0;
    file = fopen(argv[2], "rb");
    if (!file) return 2;
    count = fread(record, 1, sizeof(record), file); extra = fgetc(file);
    if (ferror(file) || fclose(file) != 0 || extra != EOF || count != sizeof(record)) {
        crypto_wipe(record, sizeof(record)); return 2;
    }
    if (!apex_lab_peer_init_record(&peer, enabled, record, sizeof(record), output, NULL)) return 2;
    while (peer.active && (byte = getchar()) != EOF) {
        uint8_t input = (uint8_t)byte;
        apex_lab_peer_feed(&peer, &input, 1u);
    }
    apex_lab_peer_close(&peer);
    return failed || ferror(stdin) ? 1 : 0;
}
