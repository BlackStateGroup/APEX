#include "bridge.h"
#include <cassert>
#include <algorithm>
#include <cstring>
#include <vector>
#include <cfenv>
#include <limits>
#include <iostream>
namespace {
void put(std::vector<uint8_t>& b,size_t at,uint32_t x) { for(size_t k=0;k<4;k++) b[at+k]=static_cast<uint8_t>(x>>(8*k)); }
void number(std::vector<uint8_t>& b,size_t at,double d) { uint64_t x;std::memcpy(&x,&d,8);for(size_t k=0;k<8;k++) b[at+k]=static_cast<uint8_t>(x>>(8*k)); }
struct Cancellation { int calls=0; int at=0; };
int cancel(void* opaque) { auto* c=static_cast<Cancellation*>(opaque);return ++c->calls==c->at; }
}
int main() {
  const uint32_t n=256,count=8,length=n*count*4;
  std::vector<uint8_t> request(48+length+(3*n-2)*8);std::memcpy(request.data(),"AXIB\1\0\1\0",8);
  put(request,8,123);put(request,12,456);put(request,16,length);put(request,20,n);put(request,28,n);put(request,32,count);
  for(size_t at=48+length;at<request.size();at+=8)number(request,at,1);
  std::vector<uint8_t> out(262176,0xa5);size_t written=999;
  auto call=[&](const std::vector<uint8_t>& input,size_t capacity,int(*fn)(void*)=nullptr,void* context=nullptr) { std::fill(out.begin(),out.end(),0xa5);written=999;return apex_iq_bridge_v1(input.data(),input.size(),out.data(),capacity,&written,fn,context); };
  auto untouched=[&] { assert(written==0);assert(std::all_of(out.begin(),out.end(),[](uint8_t b){return b==0xa5;})); };
  for(int boundary=1;boundary<=static_cast<int>(count)+2;boundary++) {Cancellation c{0,boundary};assert(call(request,out.size(),cancel,&c)==4);untouched();assert(c.calls==boundary);}
  Cancellation noCancel;assert(call(request,out.size(),cancel,&noCancel)==0);assert(noCancel.calls==static_cast<int>(count)+2);assert(written==32+n*count*16);
  assert(std::all_of(out.begin()+static_cast<long>(written),out.end(),[](uint8_t b){return b==0xa5;}));
  assert(call(request,32+n*count*16-1)==1);untouched();
  assert(call(request,out.size()+1)==1);untouched();
  for(size_t offset:{size_t(0),size_t(4),size_t(6),size_t(36),size_t(40),size_t(44)}) {auto bad=request;bad[offset]^=2;assert(call(bad,out.size())==1);untouched();}
  for(size_t offset:{size_t(8),size_t(12),size_t(16),size_t(20),size_t(28),size_t(32)}) {auto bad=request;put(bad,offset,0);assert(call(bad,out.size())==1);untouched();}
  for(size_t offset:{size_t(48+length),size_t(48+length+n*8),request.size()-8}) {auto bad=request;number(bad,offset,std::numeric_limits<double>::quiet_NaN());assert(call(bad,out.size())==2);untouched();}
  std::fesetround(FE_UPWARD);assert(call(request,out.size())==2);untouched();std::fesetround(FE_TONEAREST);
  assert(apex_iq_bridge_v1(request.data(),request.size(),out.data(),out.size(),nullptr,nullptr,nullptr)==1);
  std::cout<<"PASS: cancellation at all 10 checkpoints, bounded requests, atomic failure, exact output span, rounding rejection\n";
}
