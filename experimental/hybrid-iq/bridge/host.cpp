// Test harness only. No timing/warmup/benchmark or platform integration.
#include "bridge.h"
#include <iostream>
#include <vector>
int main(int argc,char**) {
  if(argc!=1) return 2;
  std::vector<uint8_t> input; char ch; constexpr size_t limit=48+262144+(3*4096-2)*8;
  while(input.size()<=limit && std::cin.get(ch)) input.push_back(static_cast<uint8_t>(static_cast<unsigned char>(ch)));
  if(std::cin.bad()) return 2;
  std::vector<uint8_t> output(262176); size_t written=0;
  const int status=apex_iq_bridge_v1(input.data(),input.size(),output.data(),output.size(),&written,nullptr,nullptr);
  if(status) return status;
  std::cout.write(reinterpret_cast<const char*>(output.data()),static_cast<std::streamsize>(written)); return std::cout?0:3;
}
