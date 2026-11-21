// Seeded, serializable RNG (mirrors packages/engine/src/rng.ts bit for bit).
#pragma once

#include <cstdint>
#include <string_view>
#include <utility>
#include <vector>

namespace catnight {

/** cyrb53-style string hash folded to uint32 (over the string's bytes; seeds are ASCII). */
uint32_t HashSeed(std::string_view seed);

/** One mulberry32 step: the next state and a float in [0, 1). */
std::pair<uint32_t, double> Mulberry32(uint32_t state);

class Rng {
 public:
  explicit Rng(uint32_t state) : state(state) {}
  static Rng FromSeed(std::string_view seed) { return Rng(HashSeed(seed)); }

  double Next();
  /** Integer in [0, n). */
  int Int(int n);
  /** Integer in [min, max] inclusive. */
  int Range(int min, int max) { return min + Int(max - min + 1); }
  int Die() { return Range(1, 6); }
  /** Index of a random element of a list of `size` (size > 0). */
  int PickIndex(int size) { return Int(size); }

  /** Fisher-Yates; returns a new vector. */
  template <typename T>
  std::vector<T> Shuffle(const std::vector<T>& items) {
    std::vector<T> out = items;
    for (int i = static_cast<int>(out.size()) - 1; i > 0; i--) {
      int j = Int(i + 1);
      std::swap(out[i], out[j]);
    }
    return out;
  }

  uint32_t state;
};

}  // namespace catnight
