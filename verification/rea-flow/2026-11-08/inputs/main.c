#include "apex.h"
#include <errno.h>
#include <stdlib.h>
#include <unistd.h>

static void output(const uint8_t *bytes, size_t length, void *context) {
    size_t offset = 0u;
    (void)context;
    while (offset < length) {
        ssize_t written = write(STDOUT_FILENO, bytes + offset, length - offset);
        if (written < 0 && errno == EINTR) continue;
        if (written <= 0) exit(1);
        offset += (size_t)written;
    }
}
int main(void) {
    apex_device_t device;
    uint8_t bytes[256];
    apex_device_init(&device, output, NULL);
    for (;;) {
        ssize_t count = read(STDIN_FILENO, bytes, sizeof(bytes));
        if (count < 0 && errno == EINTR) continue;
        if (count < 0) return 1;
        if (count == 0) return 0;
        apex_device_feed(&device, bytes, (size_t)count);
    }
}
