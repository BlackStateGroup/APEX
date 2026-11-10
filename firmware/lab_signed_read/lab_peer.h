#ifndef APEX_LAB_PEER_H
#define APEX_LAB_PEER_H
#include "apex.h"

/* Separate, read-only peer. Never passed to apex_device_init/legacy dispatch.
 * One serial owner; callbacks must not reenter. No heap or hardware APIs. */
#define APEX_LAB_SIGN_LIMIT 4096u
#define APEX_LAB_KEY_IMAGE_SIZE 4096u
typedef struct {
    apex_stream_t stream;
    apex_output_fn output;
    void *context;
    uint8_t secret_key[64];
    uint8_t public_key[32];
    uint8_t transcript[sizeof("APEX/AXP1/SIGNED-READ/V1") + 32u + 176u + 292u];
    apex_frame_t reply;
    uint8_t wire[APEX_MAX_FRAME];
    unsigned signed_count;
    int active;
} apex_lab_peer_t;

/* Always consumes/wipes seed, even when disabled or invalid. Explicit opt-in
 * AND a provisioned seed matching an independently retained public key required. */
int apex_lab_peer_init(apex_lab_peer_t *peer, int opt_in, uint8_t seed[32],
                       const uint8_t expected_public_key[32],
                       apex_output_fn output, void *context);
/* Exact offline image: APEXLAB1, seed[32], public key[32], 0xff padding.
 * Consumes/wipes the supplied record on every path. */
int apex_lab_peer_init_record(apex_lab_peer_t *peer, int opt_in,
                              uint8_t *record, size_t length,
                              apex_output_fn output, void *context);
void apex_lab_peer_feed(apex_lab_peer_t *peer, const uint8_t *bytes, size_t length);
void apex_lab_peer_close(apex_lab_peer_t *peer);
#endif
