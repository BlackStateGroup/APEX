#include "apex.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static unsigned received;
static void count_frame(const apex_frame_t *frame, void *context) {
    (void)context;
    assert(frame->id == 42u); assert(frame->opcode == 3u); assert(frame->length == 512u);
    received++;
}
int main(void) {
    apex_frame_t frame;
    apex_stream_t stream;
    uint8_t bytes[APEX_MAX_FRAME];
    uint32_t random = 0x12345678u;
    size_t i, size;
    assert(apex_crc16((const uint8_t *)"123456789", 9u) == 0x29b1u);
    memset(&frame, 0, sizeof(frame)); frame.kind = 1u; frame.opcode = 3u; frame.id = 42u; frame.length = 512u;
    for (i = 0; i < 512u; i++) frame.payload[i] = (uint8_t)i;
    size = apex_encode(&frame, bytes, sizeof(bytes)); assert(size == 524u);
    assert(apex_encode(&frame, bytes, 523u) == 0u);
    apex_stream_init(&stream, count_frame, NULL);
    for (i = 0; i < size; i++) apex_stream_feed(&stream, bytes + i, 1u);
    assert(received == 1u);
    bytes[20] ^= 1u; apex_stream_feed(&stream, bytes, size); assert(received == 1u);
    bytes[20] ^= 1u; apex_stream_feed(&stream, bytes, size); assert(received == 2u);
    /* Bounded random-input stress, no callback assumptions for accidental frames. */
    apex_stream_init(&stream, NULL, NULL);
    for (i = 0; i < 1000000u; i++) {
        uint8_t byte;
        random ^= random << 13; random ^= random >> 17; random ^= random << 5;
        byte = (uint8_t)random; apex_stream_feed(&stream, &byte, 1u);
        assert(stream.used <= APEX_MAX_FRAME);
    }
    frame.id = 0u; assert(apex_encode(&frame, bytes, sizeof(bytes)) == 0u);
    frame.id = 1u; frame.length = 513u; assert(apex_encode(&frame, bytes, sizeof(bytes)) == 0u);
    puts("C: CRC vector, bounds, fragmentation, corruption recovery and 1,000,000 noise bytes passed.");
    return 0;
}
