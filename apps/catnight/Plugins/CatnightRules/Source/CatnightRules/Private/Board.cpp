#include "CatnightRules/Board.h"

#include <algorithm>
#include <cmath>
#include <set>

namespace catnight {

namespace {

constexpr int kCorner[6][2] = {{0, -2}, {1, -1}, {1, 1}, {0, 2}, {-1, 1}, {-1, -1}};
constexpr int kDir[6][2] = {{1, 0}, {1, -1}, {0, -1}, {-1, 0}, {-1, 1}, {0, 1}};

std::string VertexId(int x, int y) { return std::to_string(x) + "," + std::to_string(y); }

std::pair<int, int> ParseVertex(const std::string& id) {
  size_t comma = id.find(',');
  return {std::stoi(id.substr(0, comma)), std::stoi(id.substr(comma + 1))};
}

bool CompareVertex(const std::string& a, const std::string& b) {
  auto [ax, ay] = ParseVertex(a);
  auto [bx, by] = ParseVertex(b);
  if (ay != by) return ay < by;
  return ax < bx;
}

std::string EdgeId(const std::string& a, const std::string& b) { return a < b ? a + "|" + b : b + "|" + a; }

Topology Build() {
  Topology t;
  for (int r = -2; r <= 2; r++)
    for (int q = -2; q <= 2; q++)
      if (std::abs(q + r) <= 2) t.hexes.push_back({q, r});
  const int nh = static_cast<int>(t.hexes.size());

  // First pass with string ids, exactly as the TypeScript build.
  std::vector<std::array<std::string, 6>> hexV(nh);
  std::vector<std::array<std::string, 6>> hexE(nh);
  std::vector<std::string> vertexOrder, edgeOrder;  // insertion order
  std::unordered_map<std::string, std::vector<int>> vHexes, eHexes;
  std::unordered_map<std::string, std::pair<double, double>> vPos;
  std::unordered_map<std::string, std::array<std::string, 2>> eVerts;
  const double sqrt3 = std::sqrt(3.0);
  for (int i = 0; i < nh; i++) {
    const int cx = 2 * t.hexes[i].q + t.hexes[i].r;
    const int cy = 3 * t.hexes[i].r;
    for (int k = 0; k < 6; k++) {
      const int x = cx + kCorner[k][0];
      const int y = cy + kCorner[k][1];
      hexV[i][k] = VertexId(x, y);
      vPos[hexV[i][k]] = {(x * sqrt3 * 1) / 2, (y * 1.0) / 2};
    }
    for (int k = 0; k < 6; k++) {
      const std::string& a = hexV[i][k];
      const std::string& b = hexV[i][(k + 1) % 6];
      std::string e = EdgeId(a, b);
      hexE[i][k] = e;
      if (!eVerts.count(e)) {
        eVerts[e] = a < b ? std::array<std::string, 2>{a, b} : std::array<std::string, 2>{b, a};
        edgeOrder.push_back(e);
      }
      eHexes[e].push_back(i);
    }
    for (const auto& v : hexV[i]) {
      if (!vHexes.count(v)) vertexOrder.push_back(v);
      vHexes[v].push_back(i);
    }
  }

  t.vertexIds = vertexOrder;
  std::stable_sort(t.vertexIds.begin(), t.vertexIds.end(), CompareVertex);
  t.edgeIds = edgeOrder;
  std::stable_sort(t.edgeIds.begin(), t.edgeIds.end());
  for (int i = 0; i < static_cast<int>(t.vertexIds.size()); i++) t.vertexIndex[t.vertexIds[i]] = i;
  for (int i = 0; i < static_cast<int>(t.edgeIds.size()); i++) t.edgeIndex[t.edgeIds[i]] = i;

  const int nv = t.VertexCount();
  const int ne = t.EdgeCount();
  t.hexVertices.resize(nh);
  t.hexEdges.resize(nh);
  for (int i = 0; i < nh; i++)
    for (int k = 0; k < 6; k++) {
      t.hexVertices[i][k] = t.vertexIndex[hexV[i][k]];
      t.hexEdges[i][k] = t.edgeIndex[hexE[i][k]];
    }
  t.vertexHexes.resize(nv);
  for (int v = 0; v < nv; v++) t.vertexHexes[v] = vHexes[t.vertexIds[v]];
  t.edgeVertices.resize(ne);
  t.edgeHexes.resize(ne);
  for (int e = 0; e < ne; e++) {
    const auto& ab = eVerts[t.edgeIds[e]];
    t.edgeVertices[e] = {t.vertexIndex[ab[0]], t.vertexIndex[ab[1]]};
    t.edgeHexes[e] = eHexes[t.edgeIds[e]];
  }
  t.vertexEdges.resize(nv);
  t.vertexNeighbors.resize(nv);
  for (int e = 0; e < ne; e++) {
    const int a = t.edgeVertices[e][0];
    const int b = t.edgeVertices[e][1];
    t.vertexEdges[a].push_back(e);
    t.vertexEdges[b].push_back(e);
    t.vertexNeighbors[a].push_back(b);
    t.vertexNeighbors[b].push_back(a);
  }
  for (int v = 0; v < nv; v++) {
    std::stable_sort(t.vertexNeighbors[v].begin(), t.vertexNeighbors[v].end());
    std::stable_sort(t.vertexEdges[v].begin(), t.vertexEdges[v].end());
  }
  t.hexNeighbors.resize(nh);
  for (int i = 0; i < nh; i++)
    for (const auto& d : kDir)
      for (int j = 0; j < nh; j++)
        if (t.hexes[j].q == t.hexes[i].q + d[0] && t.hexes[j].r == t.hexes[i].r + d[1]) t.hexNeighbors[i].push_back(j);

  struct Coast {
    int e;
    double ang;
  };
  std::vector<Coast> coast;
  for (int e = 0; e < ne; e++) {
    if (t.edgeHexes[e].size() != 1) continue;
    const auto& pa = vPos[t.vertexIds[t.edgeVertices[e][0]]];
    const auto& pb = vPos[t.vertexIds[t.edgeVertices[e][1]]];
    const double mx = (pa.first + pb.first) / 2;
    const double my = (pa.second + pb.second) / 2;
    double ang = std::atan2(mx, -my);
    if (ang < 0) ang += 3.141592653589793 * 2;
    coast.push_back({e, ang});
  }
  std::stable_sort(coast.begin(), coast.end(), [](const Coast& x, const Coast& y) { return x.ang < y.ang; });
  for (const auto& c : coast) t.coastalEdges.push_back(c.e);
  return t;
}

std::vector<Terrain> TerrainBag() {
  std::vector<Terrain> bag;
  for (Terrain t : kTerrains)
    for (int i = 0; i < TerrainCount(t); i++) bag.push_back(t);
  return bag;
}

std::vector<int> Tokens() { return std::vector<int>(kNumberTokens.begin(), kNumberTokens.end()); }

std::vector<HexTile> Assemble(const std::vector<Terrain>& terrains, const std::vector<int>& tokens) {
  const Topology& t = GetTopology();
  std::vector<HexTile> out;
  size_t k = 0;
  for (int i = 0; i < static_cast<int>(t.hexes.size()); i++) {
    HexTile h;
    h.id = i;
    h.q = t.hexes[i].q;
    h.r = t.hexes[i].r;
    h.terrain = terrains[i];
    h.token = terrains[i] == Terrain::Waste ? 0 : tokens[k++];
    out.push_back(h);
  }
  return out;
}

std::vector<HexTile> BalancedHexes(Rng& rng, const std::vector<Terrain>* fixed) {
  const std::vector<Terrain> bag = TerrainBag();
  const std::vector<int> tokens = Tokens();
  std::optional<std::vector<HexTile>> fallback;
  for (int i = 0; i < 20000; i++) {
    std::vector<Terrain> terrains = fixed ? *fixed : rng.Shuffle(bag);
    std::vector<HexTile> hexes = Assemble(terrains, rng.Shuffle(tokens));
    if (HasRedAdjacency(hexes)) continue;
    if (!HasIdenticalAdjacency(hexes)) return hexes;
    if (!fallback) fallback = hexes;
  }
  return fallback ? *fallback : std::vector<HexTile>{};
}

}  // namespace

int Topology::VertexIndex(std::string_view id) const {
  auto it = vertexIndex.find(std::string(id));
  return it == vertexIndex.end() ? -1 : it->second;
}

int Topology::EdgeIndex(std::string_view id) const {
  auto it = edgeIndex.find(std::string(id));
  return it == edgeIndex.end() ? -1 : it->second;
}

const Topology& GetTopology() {
  static const Topology t = Build();
  return t;
}

bool HasRedAdjacency(const std::vector<HexTile>& hexes) {
  const Topology& t = GetTopology();
  auto red = [](int n) { return n == 6 || n == 8; };
  for (const auto& h : hexes) {
    if (!red(h.token)) continue;
    for (int n : t.hexNeighbors[h.id])
      if (n > h.id && red(hexes[n].token)) return true;
  }
  return false;
}

bool HasIdenticalAdjacency(const std::vector<HexTile>& hexes) {
  const Topology& t = GetTopology();
  for (const auto& h : hexes) {
    if (h.token == 0) continue;
    for (int n : t.hexNeighbors[h.id])
      if (n > h.id && hexes[n].token == h.token) return true;
  }
  return false;
}

std::vector<Harbor> GenerateHarbors(Rng& rng) {
  static constexpr int kSpacing[9] = {3, 3, 4, 3, 3, 4, 3, 3, 4};
  const Topology& t = GetTopology();
  const auto& coast = t.coastalEdges;
  std::vector<std::optional<Resource>> kinds = {std::nullopt, std::nullopt, std::nullopt, std::nullopt};
  for (Resource r : kResources) kinds.push_back(r);
  kinds = rng.Shuffle(kinds);
  const int offset = rng.Int(static_cast<int>(coast.size()));
  std::vector<Harbor> harbors;
  int idx = offset;
  for (int i = 0; i < 9; i++) {
    const int edge = coast[idx % coast.size()];
    Harbor h;
    h.id = i;
    h.kind = kinds[i];
    h.edge = edge;
    h.vertices = t.edgeVertices[edge];
    h.hex = t.edgeHexes[edge][0];
    harbors.push_back(h);
    idx += kSpacing[i];
  }
  return harbors;
}

Board GenerateBoard(const std::string& seed, LayoutMode mode) {
  static const std::vector<Terrain> kBeginner = {
      Terrain::Peaks,  Terrain::Moors,     Terrain::Witchwood, Terrain::Fields,    Terrain::Ashen,
      Terrain::Moors,  Terrain::Ashen,     Terrain::Fields,    Terrain::Witchwood, Terrain::Waste,
      Terrain::Witchwood, Terrain::Peaks,  Terrain::Witchwood, Terrain::Peaks,     Terrain::Fields,
      Terrain::Moors,  Terrain::Ashen,     Terrain::Fields,    Terrain::Moors,
  };
  Board b;
  b.seed = seed;
  b.mode = mode;
  if (mode == LayoutMode::Beginner) {
    Rng rng = Rng::FromSeed("hexfall:beginner");
    b.hexes = BalancedHexes(rng, &kBeginner);
    b.harbors = GenerateHarbors(rng);
  } else {
    Rng rng = Rng::FromSeed(seed + ":isle");
    if (mode == LayoutMode::Balanced) {
      b.hexes = BalancedHexes(rng, nullptr);
    } else {
      std::vector<Terrain> terrains = rng.Shuffle(TerrainBag());
      std::vector<int> tokens = rng.Shuffle(Tokens());
      b.hexes = Assemble(terrains, tokens);
    }
    b.harbors = GenerateHarbors(rng);
  }
  return b;
}

ValidationReport ValidateBoard(const Board& board) {
  ValidationReport rep;
  const Topology& t = GetTopology();
  if (board.hexes.size() != t.hexes.size()) rep.issues.push_back("wrong hex count");
  for (Terrain terrain : kTerrains) {
    int n = 0;
    for (const auto& h : board.hexes) n += h.terrain == terrain;
    if (n != TerrainCount(terrain)) rep.issues.push_back("terrain " + std::string(Name(terrain)) + ": " + std::to_string(n));
  }
  std::vector<int> tokens;
  for (const auto& h : board.hexes)
    if (h.token) tokens.push_back(h.token);
  std::sort(tokens.begin(), tokens.end());
  if (tokens != Tokens()) rep.issues.push_back("wrong number tokens");
  for (const auto& h : board.hexes)
    if ((h.terrain == Terrain::Waste) != (h.token == 0)) rep.issues.push_back("hex " + std::to_string(h.id) + " token mismatch");
  if (board.harbors.size() != 9) rep.issues.push_back("wrong harbor count");
  int generic = 0;
  for (const auto& h : board.harbors) generic += !h.kind.has_value();
  if (generic != 4) rep.issues.push_back("wrong generic harbor count");
  std::set<int> used;
  for (const auto& hb : board.harbors) {
    if (std::find(t.coastalEdges.begin(), t.coastalEdges.end(), hb.edge) == t.coastalEdges.end())
      rep.issues.push_back("harbor " + std::to_string(hb.id) + " not coastal");
    for (int v : hb.vertices) {
      if (used.count(v)) rep.issues.push_back("harbor vertex " + t.vertexIds[v] + " shared");
      used.insert(v);
    }
  }
  if (board.mode != LayoutMode::Random && HasRedAdjacency(board.hexes)) rep.issues.push_back("adjacent 6/8");
  if (HasIdenticalAdjacency(board.hexes)) rep.warnings.push_back("identical adjacent numbers");
  rep.ok = rep.issues.empty();
  return rep;
}

}  // namespace catnight
