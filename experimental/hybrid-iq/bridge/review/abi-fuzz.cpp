// Independent seeded ABI review probe, not the default CI gate.
#include "bridge.h"
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <vector>

static uint32_t state = 0x9e3779b9;
static uint32_t next() {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return state;
}
static void put(std::vector<uint8_t>& b, size_t p, uint32_t v) {
  for (size_t k = 0; k < 4; k++) b[p + k] = static_cast<uint8_t>(v >> (k * 8));
}
static void number(std::vector<uint8_t>& b, size_t p, double v) {
  uint64_t u;
  std::memcpy(&u, &v, 8);
  for (size_t k = 0; k < 8; k++) b[p + k] = static_cast<uint8_t>(u >> (k * 8));
}
static std::vector<uint8_t> valid(uint32_t n, uint32_t count, uint32_t length) {
  std::vector<uint8_t> b(48 + length + (3 * n - 2) * 8);
  std::memcpy(b.data(), "AXIB\1\0\1\0", 8);
  put(b, 8, 1);
  put(b, 12, 2);
  put(b, 16, length);
  put(b, 20, n);
  put(b, 28, n);
  put(b, 32, count);
  for (size_t k = 48; k < 48 + length; k++) b[k] = static_cast<uint8_t>(next());
  for (size_t p = 48 + length; p < b.size(); p += 8) number(b, p, 0.5);
  return b;
}
// Deliberately violate the documented nonthrowing callback precondition solely
// to check the boundary's defensive catch-all. Real callbacks must not throw.
int throws(void*) { throw 42; }

int main() {
  auto seed = valid(256, 1, 1024);
  std::vector<uint8_t> out(262176 + 32, 0xa5);
  size_t successes = 0, rejections = 0;
  for (size_t i = 0; i < 12000; i++) {
    auto b = seed;
    if (i % 4 == 0) {
      b.resize(next() % (seed.size() + 100));
    } else if (i % 4 == 1) {
      for (size_t j = 0; j < 1 + next() % 12; j++) b[next() % 48] = static_cast<uint8_t>(next());
    } else if (i % 4 == 2) {
      for (size_t j = 0; j < 1 + next() % 8; j++) b[next() % b.size()] = static_cast<uint8_t>(next());
    } else {
      const uint32_t n = 256u << (next() % 5);
      const uint32_t count = 1 + next() % (16384 / n);
      b = valid(n, count, n * count * 4);
    }
    std::fill(out.begin(), out.end(), 0xa5);
    size_t written = 99;
    const size_t capacity = i % 3 == 0 ? next() % 262208 : 262176;
    const int r = apex_iq_bridge_v1(b.data(), b.size(), out.data() + 16, capacity, &written, nullptr, nullptr);
    assert(r >= 0 && r <= 4);
    assert(std::all_of(out.begin(), out.begin() + 16, [](uint8_t x) { return x == 0xa5; }));
    if (r) {
      rejections++;
      assert(written == 0);
      assert(std::all_of(out.begin(), out.end(), [](uint8_t x) { return x == 0xa5; }));
    } else {
      successes++;
      assert(written >= 32 && written <= capacity);
      assert(std::all_of(out.begin() + 16 + static_cast<long>(written), out.end(), [](uint8_t x) { return x == 0xa5; }));
    }
  }
  auto max = valid(4096, 4, 262144);
  size_t written = 0;
  assert(apex_iq_bridge_v1(max.data(), max.size(), out.data(), 262176, &written, nullptr, nullptr) == 0);
  assert(written == 262176);
  std::fill(out.begin(), out.end(), 0xa5);
  assert(apex_iq_bridge_v1(seed.data(), seed.size(), out.data(), 262176, &written, throws, nullptr) == 3);
  assert(written == 0);
  assert(std::all_of(out.begin(), out.end(), [](uint8_t x) { return x == 0xa5; }));
  std::cout << "PASS 12000 independent randomized ABI cases: " << successes << " success, " << rejections
            << " rejection; max request/output; exception containment\n";
}
