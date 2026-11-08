#ifndef APEX_H
#define APEX_H
#include <stddef.h>
#include <stdint.h>

#define APEX_MAX_PAYLOAD 512u
#define APEX_MAX_FRAME 524u
#define APEX_REQUEST 1u
#define APEX_RESPONSE 2u
#define APEX_ERROR 3u

typedef struct {
    uint8_t kind;
    uint8_t opcode;
    uint16_t id;
    uint16_t length;
    uint8_t payload[APEX_MAX_PAYLOAD];
} apex_frame_t;
typedef void (*apex_frame_fn)(const apex_frame_t *frame, void *context);
typedef void (*apex_output_fn)(const uint8_t *bytes, size_t length, void *context);
typedef struct {
    uint8_t buffer[APEX_MAX_FRAME];
    size_t used;
    size_t discarded;
    apex_frame_fn receive;
    void *context;
} apex_stream_t;
typedef struct {
    apex_stream_t stream;
    apex_output_fn output;
    void *context;
} apex_device_t;

uint16_t apex_crc16(const uint8_t *bytes, size_t length);
size_t apex_encode(const apex_frame_t *frame, uint8_t *output, size_t capacity);
void apex_stream_init(apex_stream_t *stream, apex_frame_fn receive, void *context);
void apex_stream_feed(apex_stream_t *stream, const uint8_t *bytes, size_t length);
void apex_device_init(apex_device_t *device, apex_output_fn output, void *context);
void apex_device_feed(apex_device_t *device, const uint8_t *bytes, size_t length);
#endif
