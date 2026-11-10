#include "lab_peer.h"
#include "monocypher.h"
#include "monocypher-ed25519.h"
#include <string.h>

static const uint8_t domain[] = "APEX/AXP1/SIGNED-READ/V1"; /* includes NUL */
/* Development labels, never silicon identity or an attestation. */
static const char info[] = "{\"id\":\"apex-s3-signed-lab\",\"board\":\"esp32s3\",\"firmware\":\"lab-1\",\"protocol\":1,\"source\":\"accessory\"}";
static const char capabilities[] = "{\"operations\":[\"system.info\",\"system.capabilities\",\"system.ping\"]}";
_Static_assert(sizeof(info) - 1u <= 256u, "info body bound");
_Static_assert(sizeof(capabilities) - 1u <= 256u, "capabilities body bound");

void apex_lab_peer_close(apex_lab_peer_t *peer) {
    if (peer) crypto_wipe(peer, sizeof(*peer));
}

static void receive(const apex_frame_t *request, void *context) {
    apex_lab_peer_t *peer = (apex_lab_peer_t *)context;
    apex_frame_t *reply = &peer->reply;
    const uint8_t *body;
    size_t body_length, wire_length, cursor;
    uint16_t request_length;
    uint8_t operation;
    if (!peer->active || request->kind != APEX_REQUEST || request->opcode != 0x70u ||
        request->length < 36u || request->length > 164u) return;
    operation = request->payload[1];
    request_length = (uint16_t)(request->payload[34] | (uint16_t)request->payload[35] << 8);
    if (request->payload[0] != 1u || operation < 1u || operation > 3u ||
        request_length > 128u || request->length != 36u + request_length ||
        (operation != 3u && request_length != 0u)) return;
    if (peer->signed_count >= APEX_LAB_SIGN_LIMIT) { apex_lab_peer_close(peer); return; }
    if (operation == 1u) { body = (const uint8_t *)info; body_length = sizeof(info) - 1u; }
    else if (operation == 2u) { body = (const uint8_t *)capabilities; body_length = sizeof(capabilities) - 1u; }
    else { body = request->payload + 36u; body_length = request_length; }

    memset(reply, 0, sizeof(*reply));
    reply->kind = APEX_RESPONSE; reply->opcode = 0x70u; reply->id = request->id;
    reply->length = (uint16_t)(36u + body_length + 64u);
    memcpy(reply->payload, request->payload, 34u);
    reply->payload[34] = (uint8_t)body_length;
    reply->payload[35] = (uint8_t)(body_length >> 8);
    memcpy(reply->payload + 36u, body, body_length);

    /* The strict existing parser accepts only canonical AXP headers. Re-encoding
     * reproduces the entire accepted request, including its CRC, exactly. */
    memcpy(peer->transcript, domain, sizeof(domain));
    cursor = sizeof(domain);
    memcpy(peer->transcript + cursor, peer->public_key, 32u); cursor += 32u;
    wire_length = apex_encode(request, peer->transcript + cursor, 176u);
    if (!wire_length) { apex_lab_peer_close(peer); return; }
    cursor += wire_length;
    memcpy(peer->transcript + cursor, reply->payload, 36u + body_length);
    cursor += 36u + body_length;
    /* Pure RFC 8032 Ed25519/SHA-512, NOT Monocypher's default EdDSA/BLAKE2b
     * and NOT Ed25519ph. No caller-supplied arbitrary signing message. */
    crypto_ed25519_sign(reply->payload + 36u + body_length, peer->secret_key,
                        peer->transcript, cursor);
    peer->signed_count++;
    wire_length = apex_encode(reply, peer->wire, sizeof(peer->wire));
    crypto_wipe(peer->transcript, sizeof(peer->transcript));
    if (wire_length && peer->output) peer->output(peer->wire, wire_length, peer->context);
}

int apex_lab_peer_init(apex_lab_peer_t *peer, int opt_in, uint8_t seed[32],
                       const uint8_t expected_public_key[32],
                       apex_output_fn output, void *context) {
    if (!peer) { if (seed) crypto_wipe(seed, 32u); return 0; }
    memset(peer, 0, sizeof(*peer));
    if (opt_in != 1 || !seed || !expected_public_key || !output) {
        if (seed) crypto_wipe(seed, 32u);
        return 0;
    }
    crypto_ed25519_key_pair(peer->secret_key, peer->public_key, seed);
    if (crypto_verify32(peer->public_key, expected_public_key) != 0) {
        apex_lab_peer_close(peer); return 0;
    }
    peer->active = 1; peer->output = output; peer->context = context;
    apex_stream_init(&peer->stream, receive, peer);
    return 1;
}

void apex_lab_peer_feed(apex_lab_peer_t *peer, const uint8_t *bytes, size_t length) {
    size_t i;
    if (!peer || !bytes) return;
    for (i = 0; i < length && peer->active; ++i) apex_stream_feed(&peer->stream, bytes + i, 1u);
}

int apex_lab_peer_init_record(apex_lab_peer_t *peer, int opt_in,
                              uint8_t *record, size_t length,
                              apex_output_fn output, void *context) {
    size_t i;
    int valid = 0;
    apex_lab_peer_close(peer);
    if (record && length == APEX_LAB_KEY_IMAGE_SIZE && memcmp(record, "APEXLAB1", 8u) == 0) {
        valid = 1;
        for (i = 72u; i < length; ++i) if (record[i] != 0xffu) valid = 0;
        if (valid) valid = apex_lab_peer_init(peer, opt_in, record + 8u, record + 40u, output, context);
    }
    if (record) crypto_wipe(record, length);
    return valid;
}
