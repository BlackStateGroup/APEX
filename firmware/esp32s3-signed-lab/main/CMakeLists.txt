idf_component_register(SRCS "main.c"
  INCLUDE_DIRS "." REQUIRES esp_driver_usb_serial_jtag esp_partition)
if(CONFIG_APEX_SIGNED_READ_LAB_OPT_IN)
  target_sources(${COMPONENT_LIB} PRIVATE
    "../../core/apex.c" "../../lab_signed_read/lab_peer.c"
    "../../lab_signed_read/vendor/monocypher.c"
    "../../lab_signed_read/vendor/monocypher-ed25519.c")
  target_include_directories(${COMPONENT_LIB} PRIVATE
    "../../core" "../../lab_signed_read" "../../lab_signed_read/vendor")
endif()
