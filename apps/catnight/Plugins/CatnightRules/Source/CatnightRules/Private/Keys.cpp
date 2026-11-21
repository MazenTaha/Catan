#include "CatnightRules/Keys.h"

#include <cstdlib>

namespace catnight {

namespace {
constexpr std::string_view kResourceNames[] = {"wood", "clay", "wool", "grain", "ore"};
constexpr std::string_view kTerrainNames[] = {"witchwood", "ashen", "moors", "fields", "peaks", "waste"};
constexpr std::string_view kOmenNames[] = {"warden", "relic", "decree", "harvest", "tithe", "manup"};
constexpr std::string_view kWeaponNames[] = {"fist", "sword", "revolver"};
constexpr std::string_view kColorNames[] = {"crimson", "frost", "bone", "violet"};
constexpr std::string_view kSigilNames[] = {"skull", "moon", "eye", "thorn"};
constexpr std::string_view kSeatNames[] = {"human", "bot"};
constexpr std::string_view kBotNames[] = {"wanderer", "warlord", "archdemon"};
constexpr std::string_view kLayoutNames[] = {"balanced", "random", "beginner"};

template <typename E, size_t N>
bool ParseIn(std::string_view s, const std::string_view (&names)[N], E& out) {
  for (size_t i = 0; i < N; i++) {
    if (names[i] == s) {
      out = static_cast<E>(i);
      return true;
    }
  }
  return false;
}
}  // namespace

std::string_view Name(Resource r) { return kResourceNames[static_cast<int>(r)]; }
std::string_view Name(Terrain t) { return kTerrainNames[static_cast<int>(t)]; }
std::string_view Name(OmenType o) { return kOmenNames[static_cast<int>(o)]; }
std::string_view Name(Weapon w) { return kWeaponNames[static_cast<int>(w)]; }
std::string_view Name(PlayerColor c) { return kColorNames[static_cast<int>(c)]; }
std::string_view Name(Sigil s) { return kSigilNames[static_cast<int>(s)]; }
std::string_view Name(SeatKind k) { return kSeatNames[static_cast<int>(k)]; }
std::string_view Name(BotLevel b) { return kBotNames[static_cast<int>(b)]; }
std::string_view Name(LayoutMode m) { return kLayoutNames[static_cast<int>(m)]; }

bool Parse(std::string_view s, Resource& out) { return ParseIn(s, kResourceNames, out); }
bool Parse(std::string_view s, Terrain& out) { return ParseIn(s, kTerrainNames, out); }
bool Parse(std::string_view s, OmenType& out) { return ParseIn(s, kOmenNames, out); }
bool Parse(std::string_view s, Weapon& out) { return ParseIn(s, kWeaponNames, out); }
bool Parse(std::string_view s, PlayerColor& out) { return ParseIn(s, kColorNames, out); }
bool Parse(std::string_view s, Sigil& out) { return ParseIn(s, kSigilNames, out); }
bool Parse(std::string_view s, SeatKind& out) { return ParseIn(s, kSeatNames, out); }
bool Parse(std::string_view s, BotLevel& out) { return ParseIn(s, kBotNames, out); }
bool Parse(std::string_view s, LayoutMode& out) { return ParseIn(s, kLayoutNames, out); }

std::optional<Resource> TerrainResource(Terrain t) {
  switch (t) {
    case Terrain::Witchwood: return Resource::Wood;
    case Terrain::Ashen: return Resource::Clay;
    case Terrain::Moors: return Resource::Wool;
    case Terrain::Fields: return Resource::Grain;
    case Terrain::Peaks: return Resource::Ore;
    case Terrain::Waste: return std::nullopt;
  }
  return std::nullopt;
}

int TerrainCount(Terrain t) {
  switch (t) {
    case Terrain::Witchwood: return 4;
    case Terrain::Moors: return 4;
    case Terrain::Fields: return 4;
    case Terrain::Ashen: return 3;
    case Terrain::Peaks: return 3;
    case Terrain::Waste: return 1;
  }
  return 0;
}

int OmenDeckCount(OmenType o) {
  switch (o) {
    case OmenType::Warden: return 14;
    case OmenType::Relic: return 5;
    case OmenType::Decree: return 2;
    case OmenType::Harvest: return 2;
    case OmenType::Tithe: return 2;
    case OmenType::Manup: return 0;  // live-combat games add kManupCards
  }
  return 0;
}

int Damage(Weapon w) {
  switch (w) {
    case Weapon::Fist: return 10;
    case Weapon::Sword: return 25;
    case Weapon::Revolver: return 50;
  }
  return 0;
}

Counts PartialCounts::ToCounts() const {
  Counts c;
  for (Resource r : kResources) c[r] = Get(r);
  return c;
}

int PartialCounts::Total() const {
  int t = 0;
  for (Resource r : kResources) t += Get(r);
  return t;
}

PartialCounts PartialCounts::From(const Counts& c) {
  PartialCounts p;
  for (Resource r : kResources) p.Set(r, c[r]);
  return p;
}

namespace {
std::array<PartialCounts, 4> MakeCosts() {
  std::array<PartialCounts, 4> c;
  c[0].Set(Resource::Wood, 1);  // causeway
  c[0].Set(Resource::Clay, 1);
  c[1].Set(Resource::Wood, 1);  // outpost
  c[1].Set(Resource::Clay, 1);
  c[1].Set(Resource::Wool, 1);
  c[1].Set(Resource::Grain, 1);
  c[2].Set(Resource::Grain, 2);  // citadel
  c[2].Set(Resource::Ore, 3);
  c[3].Set(Resource::Wool, 1);  // omen
  c[3].Set(Resource::Grain, 1);
  c[3].Set(Resource::Ore, 1);
  return c;
}
}  // namespace

const PartialCounts& Cost(CostKey k) {
  static const std::array<PartialCounts, 4> kCosts = MakeCosts();
  return kCosts[static_cast<int>(k)];
}

bool HasAtLeast(const Counts& have, const PartialCounts& need) {
  for (Resource r : kResources)
    if (have[r] < need.Get(r)) return false;
  return true;
}

bool HasAtLeast(const Counts& have, const Counts& need) {
  for (Resource r : kResources)
    if (have[r] < need[r]) return false;
  return true;
}

Counts AddCounts(const Counts& a, const PartialCounts& b, int sign) {
  Counts out = a;
  for (Resource r : kResources) out[r] += sign * b.Get(r);
  return out;
}

int Pips(int token) {
  if (token == 0 || token == 7) return 0;
  return 6 - std::abs(7 - token);
}

}  // namespace catnight
