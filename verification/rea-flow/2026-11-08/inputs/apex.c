#include "apex.h"
#include <string.h>

static uint16_t get16(const uint8_t *p) { return (uint16_t)((uint16_t)p[0] | (uint16_t)p[1] << 8); }
static void put16(uint8_t *p, uint16_t value) { p[0] = (uint8_t)value; p[1] = (uint8_t)(value >> 8); }

uint16_t apex_crc16(const uint8_t *bytes, size_t length) {
    uint16_t crc = 0xffffu;
    size_t i;
    for (i = 0; i < length; ++i) {
        unsigned bit;
        crc ^= (uint16_t)((uint16_t)bytes[i] << 8);
        for (bit = 0; bit < 8u; ++bit) {
            crc = (uint16_t)((crc & 0x8000u) ? ((uint32_t)crc << 1) ^ 0x1021u : (uint32_t)crc << 1);
        }
    }
    return crc;
}

size_t apex_encode(const apex_frame_t *frame, uint8_t *output, size_t capacity) {
    size_t size;
    if (!frame || !output || frame->kind < 1u || frame->kind > 3u || frame->id == 0u || frame->length > APEX_MAX_PAYLOAD) return 0u;
    size = (size_t)frame->length + 12u;
    if (capacity < size) return 0u;
    output[0] = 0x41u; output[1] = 0x58u; output[2] = 1u;
    output[3] = frame->kind; output[4] = frame->opcode; output[5] = 0u;
    put16(output + 6, frame->id); put16(output + 8, frame->length);
    memcpy(output + 10, frame->payload, frame->length);
    put16(output + size - 2u, apex_crc16(output, size - 2u));
    return size;
}

void apex_stream_init(apex_stream_t *stream, apex_frame_fn receive, void *context) {
    memset(stream, 0, sizeof(*stream)); stream->receive = receive; stream->context = context;
}
static void discard(apex_stream_t *stream, size_t count, int corrupt) {
    memmove(stream->buffer, stream->buffer + count, stream->used - count);
    stream->used -= count;
    if (corrupt) stream->discarded += count;
}
void apex_stream_feed(apex_stream_t *stream, const uint8_t *bytes, size_t length) {
    size_t i;
    for (i = 0; i < length; ++i) {
        if (stream->used == APEX_MAX_FRAME) discard(stream, 1u, 1);
        stream->buffer[stream->used++] = bytes[i];
        while (stream->used >= 2u) {
            uint16_t payload_length;
            uint16_t id;
            size_t size;
            apex_frame_t frame;
            uint8_t *buffer = stream->buffer;
            if (buffer[0] != 0x41u || buffer[1] != 0x58u) { discard(stream, 1u, 1); continue; }
            if (stream->used < 10u) break;
            payload_length = get16(buffer + 8); id = get16(buffer + 6);
            if (buffer[2] != 1u || buffer[3] < 1u || buffer[3] > 3u || buffer[5] != 0u || id == 0u || payload_length > APEX_MAX_PAYLOAD) {
                discard(stream, 1u, 1); continue;
            }
            size = (size_t)payload_length + 12u;
            if (stream->used < size) break;
            if (apex_crc16(buffer, size - 2u) != get16(buffer + size - 2u)) { discard(stream, 1u, 1); continue; }
            frame.kind = buffer[3]; frame.opcode = buffer[4]; frame.id = id; frame.length = payload_length;
            memcpy(frame.payload, buffer + 10, payload_length);
            discard(stream, size, 0);
            if (stream->receive) stream->receive(&frame, stream->context);
        }
    }
}

#ifdef ESP_PLATFORM
static const char identity[] = "{\"id\":\"apex-s3-dev\",\"board\":\"esp32s3\",\"firmware\":\"0.1.0\",\"protocol\":1,\"source\":\"accessory\"}";
#else
static const char identity[] = "{\"id\":\"apex-host\",\"board\":\"host\",\"firmware\":\"0.1.0\",\"protocol\":1,\"source\":\"host\"}";
#endif
static const char capabilities[] = "{\"operations\":[\"system.info\",\"system.capabilities\",\"system.ping\"]}";

static void dispatch(const apex_frame_t *request, void *context) {
    apex_device_t *device = (apex_device_t *)context;
    apex_frame_t response;
    uint8_t encoded[APEX_MAX_FRAME];
    const char *json = NULL;
    size_t size;
    if (request->kind != APEX_REQUEST) return;
    memset(&response, 0, sizeof(response));
    response.kind = APEX_RESPONSE; response.opcode = request->opcode; response.id = request->id;
    if ((request->opcode == 1u || request->opcode == 2u) && request->length != 0u) {
        response.kind = APEX_ERROR; json = "{\"code\":\"INVALID_ARGUMENT\"}";
    } else if (request->opcode == 1u) json = identity;
    else if (request->opcode == 2u) json = capabilities;
    else if (request->opcode == 3u) {
        response.length = request->length; memcpy(response.payload, request->payload, request->length);
    } else { response.kind = APEX_ERROR; json = "{\"code\":\"UNSUPPORTED_OPERATION\"}"; }
    if (json) { response.length = (uint16_t)strlen(json); memcpy(response.payload, json, response.length); }
    size = apex_encode(&response, encoded, sizeof(encoded));
    if (size != 0u && device->output) device->output(encoded, size, device->context);
}
void apex_device_init(apex_device_t *device, apex_output_fn output, void *context) {
    device->output = output; device->context = context;
    apex_stream_init(&device->stream, dispatch, device);
}
void apex_device_feed(apex_device_t *device, const uint8_t *bytes, size_t length) { apex_stream_feed(&device->stream, bytes, length); }
