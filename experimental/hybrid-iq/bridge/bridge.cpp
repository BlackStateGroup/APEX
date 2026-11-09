#include "bridge.h"
#include "../src/kernel.h"
#include <cstring>
#include <vector>
#include <exception>
namespace {
uint32_t u32(const uint8_t* b, size_t at) { uint32_t x=0; for(size_t k=0;k<4;k++) x |= static_cast<uint32_t>(b[at+k]) << (8*k); return x; }
double f64(const uint8_t* b,size_t at) { uint64_t x=0; for(size_t k=0;k<8;k++) x |= static_cast<uint64_t>(b[at+k]) << (8*k); double d; std::memcpy(&d,&x,8); return d; }
void put32(std::vector<uint8_t>& b,size_t at,uint32_t x) { for(size_t k=0;k<4;k++) b[at+k]=static_cast<uint8_t>(x>>(8*k)); }
void put64(std::vector<uint8_t>& b,size_t at,double d) { uint64_t x; std::memcpy(&x,&d,8); for(size_t k=0;k<8;k++) b[at+k]=static_cast<uint8_t>(x>>(8*k)); }
}
extern "C" int apex_iq_bridge_v1(const uint8_t* b,size_t size,uint8_t* response,size_t capacity,size_t* written,int (*cancelled)(void*),void* context) {
  if (!written) return 1;
  *written=0;
  if (!b || !response || size<48 || size>48+262144+(3*4096-2)*8 || capacity>262176 || std::memcmp(b,"AXIB\1\0\1\0",8)!=0) return 1;
  const uint32_t session=u32(b,8), request=u32(b,12), length=u32(b,16), n=u32(b,20), start=u32(b,24), hop=u32(b,28), count=u32(b,32);
  if (!session || !request || u32(b,36) || u32(b,40) || u32(b,44) || length<4 || length>262144 || length%4 ||
      !(n==256 || n==512 || n==1024 || n==2048 || n==4096) || start>65535 || hop<1 || hop>65536 || count<1 || count>64 || n*count>16384 ||
      static_cast<uint64_t>(start)+static_cast<uint64_t>(count-1)*hop+n>length/4 || size!=48+length+(3*n-2)*8 || capacity<32+count*n*16) return 1;
  try {
    const auto stop=[&] { return cancelled && cancelled(context); };
    if (stop()) return 4;
    std::vector<double> hann(n), cosine(n-1), sine(n-1), output(2*n*count);
    size_t at=48+length;
    for(auto* values:{&hann,&cosine,&sine}) for(auto& value:*values) { value=f64(b,at); at+=8; }
    for(uint32_t frame=0;frame<count;frame++) {
      if(stop()) return 4;
      const apex_iq_windows_v1 window{n,start+frame*hop,hop,1};
      if(apex_iq_fft_v1(b+48,length,window,hann.data(),hann.size(),cosine.data(),sine.data(),cosine.size(),output.data()+2*n*frame,2*n)!=APEX_IQ_OK) return 2;
    }
    std::vector<uint8_t> result(32+count*n*16);
    std::memcpy(result.data(),"AXOB\1\0\0\0",8);
    put32(result,8,session); put32(result,12,request); put32(result,16,n); put32(result,20,count); put32(result,24,count*n*16);
    at=32; for(double value:output) { put64(result,at,value); at+=8; }
    if(stop()) return 4;
    std::memcpy(response,result.data(),result.size()); *written=result.size(); return 0;
  } catch (const std::exception&) { return 3; } catch (...) { return 3; }
}
