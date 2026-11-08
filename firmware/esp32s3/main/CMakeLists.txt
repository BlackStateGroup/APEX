idf_component_register(SRCS "main.c" "ble_accessory.c" "../../core/apex.c"
  INCLUDE_DIRS "../../core" REQUIRES esp_driver_usb_serial_jtag bt nvs_flash)
