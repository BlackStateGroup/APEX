/* Execute the actual target source against controlled SDK calls. */
#include "../firmware/esp32s3-signed-lab/main/main.c"
#include <assert.h>
#include <stdio.h>
#ifdef CONFIG_APEX_SIGNED_READ_LAB_OPT_IN
#include "monocypher-ed25519.h"
static uint8_t image[4096], input[APEX_MAX_FRAME], output_bytes[APEX_MAX_FRAME];
static size_t input_length, output_length;
static int installs, uninstalls, finds, reads, write_calls, step, scenario;
static int64_t clock_us;
static esp_partition_t partition = {true, 4096};
const esp_partition_t *esp_partition_find_first(int type, int subtype, const char *label) {
    assert(type == 1 && subtype == 0x40 && strcmp(label, "lab_keys") == 0); finds++;
    return scenario == 1 ? NULL : &partition;
}
int esp_partition_read(const esp_partition_t *p, size_t offset, void *value, size_t length) {
    assert(p == &partition && offset == 0 && length == 4096); reads++;
    if (scenario == 2) return -1;
    memcpy(value, image, length); if (scenario == 3) ((uint8_t *)value)[40] ^= 1;
    return 0;
}
int usb_serial_jtag_driver_install(const usb_serial_jtag_driver_config_t *config) {
    assert(config->tx_buffer_size == 1024 && config->rx_buffer_size == 1024);
    installs++; return scenario == 4 ? -1 : 0;
}
int usb_serial_jtag_driver_uninstall(void) { uninstalls++; return 0; }
bool usb_serial_jtag_is_connected(void) { return !(scenario == 7 && step >= 1); }
int64_t esp_timer_get_time(void) { return clock_us; }
void vTaskDelay(int ticks) { assert(ticks == 1); }
int usb_serial_jtag_read_bytes(void *value, size_t length, int ticks) {
    assert(length == 256 && ticks == 50); step++;
    if (scenario == 8) return -1;
    if (scenario == 9) return 257; /* Defensive rejection of invalid SDK length. */
    if (scenario == 6) {
        if (step == 1) { memcpy(value, input, 20); clock_us = 1; return 20; }
        if (step == 2) { clock_us = 600001; return 0; }
        if (step == 3) { memcpy(value, input + 20, input_length - 20); return (int)input_length - 20; }
        if (step == 4) { memcpy(value, input, input_length); return (int)input_length; }
        return -1;
    }
    if (step == 1) { memcpy(value, input, input_length); return (int)input_length; }
    return -1;
}
int usb_serial_jtag_write_bytes(const void *value, size_t length, int ticks) {
    assert(ticks == 100); write_calls++;
    if (scenario == 5) return write_calls == 1 ? 1 : 0;
    size_t count = length < 7 ? length : 7;
    assert(output_length + count <= sizeof(output_bytes));
    memcpy(output_bytes + output_length, value, count); output_length += count; return (int)count;
}
int main(void) {
    uint8_t seed[32], secret[64], pub[32];
    FILE *random = fopen("/dev/urandom", "rb"); assert(random && fread(seed, 1, 32, random) == 32); assert(fclose(random) == 0);
    memset(image, 0xff, sizeof(image)); memcpy(image, "APEXLAB1", 8); memcpy(image + 8, seed, 32);
    crypto_ed25519_key_pair(secret, pub, seed); memcpy(image + 40, pub, 32); crypto_wipe(secret, sizeof(secret));
    apex_frame_t q = {0}; q.kind = 1; q.opcode = 0x70; q.id = 1; q.length = 36; q.payload[0] = 1; q.payload[1] = 3;
    input_length = apex_encode(&q, input, sizeof(input));
    for (scenario = 0; scenario <= 9; scenario++) {
        installs = uninstalls = finds = reads = write_calls = step = transport_failed = 0; clock_us = 0; output_length = 0;
        app_main();
        assert(!peer.active);
        for (size_t i = 0; i < sizeof(peer.secret_key); ++i) assert(peer.secret_key[i] == 0);
        assert(finds == 1);
        if (scenario >= 1 && scenario <= 3) assert(installs == 0);
        if (scenario == 4) assert(installs == 1 && uninstalls == 0);
        if (scenario == 0 || scenario == 6 || scenario == 7) assert(output_length == 112 && write_calls > 1);
        if (scenario == 5) assert(transport_failed && write_calls == 2 && uninstalls == 1);
        if (scenario == 7) assert(step == 1 && uninstalls == 1);
        if (scenario >= 8) assert(output_length == 0 && uninstalls == 1);
    }
    crypto_wipe(image, sizeof(image));
    puts("Actual target source: 10 controlled SDK startup/partial-write/timeout/bus-loss/read-failure scenarios passed.");
    return 0;
}
#else
int main(void) { app_main(); puts("Disabled target source links and runs without any SDK/crypto/USB calls."); return 0; }
#endif
