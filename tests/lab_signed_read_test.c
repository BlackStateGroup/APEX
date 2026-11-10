#include "lab_peer.h"
#include "monocypher.h"
#include "monocypher-ed25519.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static unsigned emitted;
static void output(const uint8_t *bytes, size_t length, void *context) {
    (void)bytes; (void)length; (void)context; emitted++;
}
static int zero(const void *pointer, size_t length) {
    const uint8_t *bytes = pointer;
    size_t i;
    for (i = 0; i < length; ++i) if (bytes[i]) return 0;
    return 1;
}
int main(void) {
    /* Ephemeral process-local random keys, never an embedded test identity. */
    uint8_t seed[32], saved[32], secret[64], public_key[32], record[4096];
    uint8_t wire[APEX_MAX_FRAME];
    apex_frame_t request = {0};
    apex_lab_peer_t peer;
    FILE *random = fopen("/dev/urandom", "rb");
    unsigned i, state = 0x5a723u;
    assert(random && fread(saved, 1, 32, random) == 32); assert(fclose(random) == 0);
    memcpy(seed, saved, 32); crypto_ed25519_key_pair(secret, public_key, seed);
    assert(zero(seed, 32)); crypto_wipe(secret, sizeof(secret));
    for (i = 0; i < 2; ++i) {
        memcpy(seed, saved, 32);
        assert(!apex_lab_peer_init(&peer, i ? 2 : 0, seed, public_key, output, NULL));
        assert(zero(seed, 32) && zero(&peer, sizeof(peer)));
    }
    memcpy(seed, saved, 32); public_key[0] ^= 1;
    assert(!apex_lab_peer_init(&peer, 1, seed, public_key, output, NULL));
    assert(zero(seed, 32) && zero(&peer, sizeof(peer))); public_key[0] ^= 1;
    memset(record, 0xff, sizeof(record)); memcpy(record, "APEXLAB1", 8);
    memcpy(record + 8, saved, 32); memcpy(record + 40, public_key, 32);
    assert(apex_lab_peer_init_record(&peer, 1, record, sizeof(record), output, NULL));
    assert(zero(record, sizeof(record)));
    request.kind = APEX_REQUEST; request.opcode = 0x70; request.id = 1; request.length = 36;
    request.payload[0] = 1; request.payload[1] = 3;
    size_t length = apex_encode(&request, wire, sizeof(wire)); assert(length == 48);
    /* Boundary injection avoids thousands of expensive signatures in unit tests. */
    peer.signed_count = APEX_LAB_SIGN_LIMIT - 1;
    apex_lab_peer_feed(&peer, wire, length); assert(emitted == 1 && peer.active);
    apex_lab_peer_feed(&peer, wire, length); assert(emitted == 1 && zero(&peer, sizeof(peer)));
    apex_lab_peer_feed(&peer, wire, length); assert(emitted == 1);
    memcpy(seed, saved, 32); assert(apex_lab_peer_init(&peer, 1, seed, public_key, output, NULL));
    /* Deterministic framing noise: ASan/UBSan checks parser bounds/retention. */
    for (i = 0; i < 200000; ++i) {
        state = state * 1664525u + 1013904223u;
        uint8_t byte = (uint8_t)(state >> 24);
        apex_lab_peer_feed(&peer, &byte, 1);
        assert(peer.stream.used <= APEX_MAX_FRAME);
    }
    assert(emitted == 1);
    apex_lab_peer_close(&peer); assert(zero(&peer, sizeof(peer)));
    memset(record, 0xff, sizeof(record));
    assert(!apex_lab_peer_init_record(&peer, 1, record, sizeof(record), output, NULL));
    assert(zero(record, sizeof(record)) && zero(&peer, sizeof(peer)));
    crypto_wipe(saved, sizeof(saved));
    puts("Lab C checks passed: opt-in, key mismatch, erasure, signing budget, 200000 noise bytes.");
    return 0;
}
