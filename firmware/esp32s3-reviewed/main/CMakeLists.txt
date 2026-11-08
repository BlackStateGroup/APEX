# Reuse unchanged historical USB loop/header and portable core; own BLE adapter.
idf_component_register(SRCS "../../esp32s3/main/main.c" "ble_accessory.c" "../../core/apex.c"
  INCLUDE_DIRS "../../core" "../../esp32s3/main"
  REQUIRES esp_driver_usb_serial_jtag bt nvs_flash)
