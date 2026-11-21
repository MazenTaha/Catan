// Board topology and generation (mirrors packages/engine/src/board/*).
//
// Vertices and edges keep the TypeScript ids ("3,-5", "1,-1|2,-2") for records and saves;
// inside the rules they are indices. Vertex index order is the TypeScript `vertices` order
// (sorted by Y then X), edge index order is the `edges` order (string sort), so iterating
// indices in ascending order matches iterating those lists.
#pragma once

#include <array>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "CatnightRules/Keys.h"
#include "CatnightRules/Rng.h"

namespace catnight {

struct Axial {
  int q = 0;
  int r = 0;
};

struct Topology {
  std::vector<Axial> hexes;
  std::vector<std::string> vertexIds;
  std::vector<std::string> edgeIds;
  std::unordered_map<std::string, int> vertexIndex;
  std::unordered_map<std::string, int> edgeIndex;
  std::vector<std::array<int, 6>> hexVertices;  // corner order, clockwise from the top
  std::vector<std::array<int, 6>> hexEdges;
  std::vector<std::vector<int>> hexNeighbors;
  std::vector<std::vector<int>> vertexHexes;     // ascending hex
  std::vector<std::vector<int>> vertexNeighbors;  // ascending vertex index
  std::vector<std::vector<int>> vertexEdges;      // ascending edge index
  std::vector<std::array<int, 2>> edgeVertices;   // [a, b] with id(a) < id(b)
  std::vector<std::vector<int>> edgeHexes;
  std::vector<int> coastalEdges;                  // clockwise from the top

  int VertexIndex(std::string_view id) const;  // -1 if unknown
  int EdgeIndex(std::string_view id) const;    // -1 if unknown
  int VertexCount() const { return static_cast<int>(vertexIds.size()); }
  int EdgeCount() const { return static_cast<int>(edgeIds.size()); }
};

/** The standard 19-hex island (built once). */
const Topology& GetTopology();

struct HexTile {
  int id = 0;
  int q = 0;
  int r = 0;
  Terrain terrain = Terrain::Waste;
  int token = 0;  // 0 for the desert (null in JSON)
};

struct Harbor {
  int id = 0;
  std::optional<Resource> kind;  // nullopt: 'any' (3:1)
  int edge = 0;
  std::array<int, 2> vertices{};
  int hex = 0;
};

struct Board {
  std::string seed;
  LayoutMode mode = LayoutMode::Balanced;
  std::vector<HexTile> hexes;
  std::vector<Harbor> harbors;
};

Board GenerateBoard(const std::string& seed, LayoutMode mode);
std::vector<Harbor> GenerateHarbors(Rng& rng);
bool HasRedAdjacency(const std::vector<HexTile>& hexes);
bool HasIdenticalAdjacency(const std::vector<HexTile>& hexes);

struct ValidationReport {
  bool ok = true;
  std::vector<std::string> issues;
  std::vector<std::string> warnings;
};
ValidationReport ValidateBoard(const Board& board);

}  // namespace catnight
