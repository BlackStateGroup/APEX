if(CMAKE_BUILD_EARLY_EXPANSION)
  idf_component_register()
  return()
endif()
get_filename_component(APEX_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
find_package(Python3 REQUIRED COMPONENTS Interpreter)
set(PATCHED_MODULE "${CMAKE_CURRENT_BINARY_DIR}/Module.cpp")
execute_process(COMMAND "${Python3_EXECUTABLE}" "${APEX_ROOT}/tools/prepare_radiolib_rx.py"
  --radiolib-root "${RADIOLIB_SOURCE_DIR}" --output-module "${PATCHED_MODULE}"
  RESULT_VARIABLE PIN_RESULT)
if(NOT PIN_RESULT EQUAL 0)
  message(FATAL_ERROR "RadioLib pin verification/staging failed")
endif()
idf_component_register(SRCS "${PATCHED_MODULE}"
  "${RADIOLIB_SOURCE_DIR}/src/Hal.cpp"
  "${RADIOLIB_SOURCE_DIR}/src/utils/Utils.cpp"
  "${RADIOLIB_SOURCE_DIR}/src/protocols/PhysicalLayer/PhysicalLayer.cpp"
  "${RADIOLIB_SOURCE_DIR}/src/modules/CC1101/CC1101.cpp"
  INCLUDE_DIRS "${RADIOLIB_SOURCE_DIR}/src")
target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_20)
target_compile_definitions(${COMPONENT_LIB} PUBLIC RADIOLIB_STATIC_ONLY=1
  RADIOLIB_STATIC_ARRAY_SIZE=64 RADIOLIB_STATIC_SPI_ARRAY_SIZE=76 RADIOLIB_EXCLUDE_DIRECT_RECEIVE=1)
