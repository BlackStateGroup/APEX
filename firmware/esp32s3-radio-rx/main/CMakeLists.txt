idf_component_register(SRCS "main.cpp" "bounded_esp_hal.cpp"
  "../../radio_rx/rx_service.cpp" "../../radio_rx/receive_only_hal.cpp"
  "../../radio_rx/cc1101_receiver.cpp" "../../core/apex.c"
  INCLUDE_DIRS "." "../../radio_rx" "../../core"
  REQUIRES apex_radiolib esp_driver_gpio esp_driver_spi esp_driver_usb_serial_jtag esp_timer)
target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_20)
target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
