cmake_minimum_required(VERSION 3.22.1)
project(apex_iq LANGUAGES CXX)

# Keep a single reviewed kernel/binary contract, not a separate mobile copy.
get_filename_component(APEX_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../.." ABSOLUTE)
add_library(apex_iq SHARED
  apex_iq_jni.cpp
  "${APEX_ROOT}/experimental/hybrid-iq/bridge/bridge.cpp"
  "${APEX_ROOT}/experimental/hybrid-iq/src/kernel.cpp"
)
target_include_directories(apex_iq PRIVATE "${APEX_ROOT}/experimental/hybrid-iq/bridge")
target_compile_features(apex_iq PRIVATE cxx_std_17)
target_compile_options(apex_iq PRIVATE
  -Wall -Wextra -Werror -fexceptions -fno-fast-math -ffp-contract=off
)
# Compatible with Android devices using 16 KiB memory pages.
target_link_options(apex_iq PRIVATE "-Wl,-z,max-page-size=16384")
