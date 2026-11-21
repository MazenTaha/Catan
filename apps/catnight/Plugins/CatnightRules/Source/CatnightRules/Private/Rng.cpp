#include "CatnightRules/Rng.h"

#include <cmath>

namespace catnight {

// JavaScript's Math.imul and `>>> 0` are 32-bit wrapping arithmetic: uint32_t matches them.
uint32_t HashSeed(std::string_view seed) {
  const uint32_t len = static_cast<uint32_t>(seed.size());
  uint32_t h1 = 0xdeadbeefu ^ len;
  uint32_t h2 = 0x41c6ce57u ^ len;
  for (unsigned char ch : seed) {
    h1 = (h1 ^ ch) * 2654435761u;
    h2 = (h2 ^ ch) * 1597334677u;
  }
  h1 = ((h1 ^ (h1 >> 16)) * 2246822507u) ^ ((h2 ^ (h2 >> 13)) * 3266489909u);
  h2 = ((h2 ^ (h2 >> 16)) * 2246822507u) ^ ((h1 ^ (h1 >> 13)) * 3266489909u);
  return h1 ^ h2;
}

std::pair<uint32_t, double> Mulberry32(uint32_t state) {
  const uint32_t next = state + 0x6d2b79f5u;
  uint32_t t = next;
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + (t ^ (t >> 7)) * (t | 61u);
  const double value = static_cast<double>(t ^ (t >> 14)) / 4294967296.0;
  return {next, value};
}

double Rng::Next() {
  auto [next, value] = Mulberry32(state);
  state = next;
  return value;
}

int Rng::Int(int n) { return static_cast<int>(std::floor(Next() * n)); }

}  // namespace catnight
