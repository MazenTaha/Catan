// Catnight rules core: neutral keys and constants (mirrors packages/engine/src/lexicon-keys.ts).
// Plain C++20, no Unreal types and no exceptions, so it builds inside Unreal and in native/.
#pragma once

#include "CatnightRules/Api.h"

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace catnight {

enum class Resource : uint8_t { Wood, Clay, Wool, Grain, Ore };
inline constexpr int kResourceCount = 5;
inline constexpr std::array<Resource, 5> kResources = {Resource::Wood, Resource::Clay, Resource::Wool,
                                                       Resource::Grain, Resource::Ore};

enum class Terrain : uint8_t { Witchwood, Ashen, Moors, Fields, Peaks, Waste };
inline constexpr std::array<Terrain, 6> kTerrains = {Terrain::Witchwood, Terrain::Ashen, Terrain::Moors,
                                                     Terrain::Fields,    Terrain::Peaks, Terrain::Waste};

enum class OmenType : uint8_t { Warden, Relic, Decree, Harvest, Tithe, Manup };
inline constexpr std::array<OmenType, 6> kOmenTypes = {OmenType::Warden,  OmenType::Relic, OmenType::Decree,
                                                       OmenType::Harvest, OmenType::Tithe, OmenType::Manup};

enum class Weapon : uint8_t { Fist, Sword, Revolver };
enum class PlayerColor : uint8_t { Crimson, Frost, Bone, Violet };
enum class Sigil : uint8_t { Skull, Moon, Eye, Thorn };
enum class SeatKind : uint8_t { Human, Bot };
enum class BotLevel : uint8_t { Wanderer, Warlord, Archdemon };
enum class LayoutMode : uint8_t { Balanced, Random, Beginner };
enum class CostKey : uint8_t { Causeway, Outpost, Citadel, Omen };

// Names exactly as the TypeScript engine writes them (saves, records, golden files).
CATNIGHTRULES_API std::string_view Name(Resource r);
CATNIGHTRULES_API std::string_view Name(Terrain t);
CATNIGHTRULES_API std::string_view Name(OmenType o);
CATNIGHTRULES_API std::string_view Name(Weapon w);
CATNIGHTRULES_API std::string_view Name(PlayerColor c);
CATNIGHTRULES_API std::string_view Name(Sigil s);
CATNIGHTRULES_API std::string_view Name(SeatKind k);
CATNIGHTRULES_API std::string_view Name(BotLevel b);
CATNIGHTRULES_API std::string_view Name(LayoutMode m);

CATNIGHTRULES_API bool Parse(std::string_view s, Resource& out);
CATNIGHTRULES_API bool Parse(std::string_view s, Terrain& out);
CATNIGHTRULES_API bool Parse(std::string_view s, OmenType& out);
CATNIGHTRULES_API bool Parse(std::string_view s, Weapon& out);
CATNIGHTRULES_API bool Parse(std::string_view s, PlayerColor& out);
CATNIGHTRULES_API bool Parse(std::string_view s, Sigil& out);
CATNIGHTRULES_API bool Parse(std::string_view s, SeatKind& out);
CATNIGHTRULES_API bool Parse(std::string_view s, BotLevel& out);
CATNIGHTRULES_API bool Parse(std::string_view s, LayoutMode& out);

/** Production of a terrain, or nullopt for the desert. */
CATNIGHTRULES_API std::optional<Resource> TerrainResource(Terrain t);
CATNIGHTRULES_API int TerrainCount(Terrain t);
CATNIGHTRULES_API int OmenDeckCount(OmenType o);

inline constexpr std::array<int, 18> kNumberTokens = {2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12};
inline constexpr int kManupCards = 6;
inline constexpr int kMaxHealth = 100;
inline constexpr int kBullets = 5;
CATNIGHTRULES_API int Damage(Weapon w);

inline constexpr int kBankStart = 19;
inline constexpr int kSupplyCauseways = 15;
inline constexpr int kSupplyOutposts = 5;
inline constexpr int kSupplyCitadels = 4;
inline constexpr int kLongestMin = 5;
inline constexpr int kHostMin = 3;
inline constexpr int kBonusVp = 2;
inline constexpr int kHandLimit = 7;

/** A full resource count (ResourceCounts). */
struct Counts {
  std::array<int, 5> v{};
  int& operator[](Resource r) { return v[static_cast<int>(r)]; }
  int operator[](Resource r) const { return v[static_cast<int>(r)]; }
  int Total() const { return v[0] + v[1] + v[2] + v[3] + v[4]; }
  bool operator==(const Counts&) const = default;
  static Counts Full(int n) { return Counts{{n, n, n, n, n}}; }
};

/**
 * Partial<ResourceCounts> as it appears in actions: which keys are present matters for
 * serialization (a bot's `{ wool: 1 }` is not `{ wood: 0, ..., wool: 1 }`). `invalid` marks a
 * value the TypeScript `validCounts` would reject (unknown key, non-integer).
 */
struct CATNIGHTRULES_API PartialCounts {
  std::array<int, 5> v{};
  std::array<bool, 5> has{};
  bool invalid = false;
  int Get(Resource r) const { return has[static_cast<int>(r)] ? v[static_cast<int>(r)] : 0; }
  void Set(Resource r, int n) {
    v[static_cast<int>(r)] = n;
    has[static_cast<int>(r)] = true;
  }
  void Add(Resource r, int n) { Set(r, Get(r) + n); }
  Counts ToCounts() const;
  int Total() const;
  static PartialCounts From(const Counts& c);
  bool operator==(const PartialCounts&) const = default;
};

CATNIGHTRULES_API const PartialCounts& Cost(CostKey k);
CATNIGHTRULES_API bool HasAtLeast(const Counts& have, const PartialCounts& need);
CATNIGHTRULES_API bool HasAtLeast(const Counts& have, const Counts& need);
CATNIGHTRULES_API Counts AddCounts(const Counts& a, const PartialCounts& b, int sign = 1);
/** Pips: the ways to roll `n` with two dice (0 for none, 7 or the desert). */
CATNIGHTRULES_API int Pips(int token);

}  // namespace catnight
