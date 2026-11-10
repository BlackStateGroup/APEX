#include <stddef.h>
#include <stdbool.h>
typedef struct { int tx_buffer_size; int rx_buffer_size; } usb_serial_jtag_driver_config_t;
#define USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT() {0, 0}
int usb_serial_jtag_driver_install(const usb_serial_jtag_driver_config_t *config);
int usb_serial_jtag_driver_uninstall(void);
int usb_serial_jtag_read_bytes(void *bytes, size_t length, int ticks);
int usb_serial_jtag_write_bytes(const void *bytes, size_t length, int ticks);
bool usb_serial_jtag_is_connected(void);
