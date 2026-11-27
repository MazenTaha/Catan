// Catnight rules tests: unit checks, then every golden game recorded from the TypeScript
// engine (native/golden/export.ts) replayed step by step through the C++ rules.
//
//   catnight_tests [--golden <dir>] [--only <name-prefix>] [--max-failures <n>]
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "CatnightRules/Bots.h"
#include "CatnightRules/Rules.h"
#include "CatnightRules/Serialize.h"

using namespace catnight;
namespace fs = std::filesystem;

namespace {

int gChecks = 0;
int gFailures = 0;

void Check(bool ok, const std::string& what) {
  gChecks++;
  if (!ok) {
    gFailures++;
    std::printf("  FAIL %s\n", what.c_str());
  }
}

std::string ReadFile(const fs::path& p) {
  std::ifstream f(p, std::ios::binary);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

void WriteFile(const fs::path& p, const std::string& text) {
  fs::create_directories(p.parent_path());
  std::ofstream f(p, std::ios::binary);
  f << text;
}

std::string FirstDifference(const std::string& a, const std::string& b) {
  size_t i = 0;
  while (i < a.size() && i < b.size() && a[i] == b[i]) i++;
  const size_t from = i > 60 ? i - 60 : 0;
  return "at char " + std::to_string(i) + "\n    cpp: ..." + a.substr(from, 140) + "\n    ts:  ..." + b.substr(from, 140);
}

// ------------------------------------------------------------------ unit tests

void UnitTests() {
  std::printf("unit tests\n");
  const Topology& t = GetTopology();
  Check(t.hexes.size() == 19, "19 hexes");
  Check(t.VertexCount() == 54, "54 vertices");
  Check(t.EdgeCount() == 72, "72 edges");
  Check(t.coastalEdges.size() == 30, "30 coastal edges");
  Check(GoldenHash("") == "811c9dc59747b28c", "hash of empty string");

  // Seeded boards are valid in every layout mode.
  int bad = 0;
  for (int i = 0; i < 300; i++) {
    for (LayoutMode m : {LayoutMode::Balanced, LayoutMode::Random, LayoutMode::Beginner}) {
      const Board b = GenerateBoard("board-" + std::to_string(i), m);
      if (!ValidateBoard(b).ok) bad++;
    }
  }
  Check(bad == 0, "900 generated boards validate");

  // Mulberry32 stays in [0, 1) and dice in 1..6.
  Rng rng(12345);
  bool inRange = true;
  for (int i = 0; i < 100000; i++) {
    const double v = rng.Next();
    if (v < 0 || v >= 1) inRange = false;
    const int d = rng.Die();
    if (d < 1 || d > 6) inRange = false;
  }
  Check(inRange, "rng range");
  GameConfig meleeConfig;
  std::string configError;
  Check(ConfigFromJson(Json::Parse(R"JSON({"seed":"retired-weapon","targetVp":10,"layout":"balanced","firstPlayer":0,"privacy":false,"arms":true,"pvp":true,"seats":[{"name":"A","kind":"human","color":"crimson","sigil":"skull"},{"name":"B","kind":"human","color":"frost","sigil":"moon"},{"name":"C","kind":"bot","color":"bone","sigil":"eye"}]})JSON"), meleeConfig, &configError), "melee config");
  auto meleeState = CreateGame(meleeConfig);
  meleeState.arms->armed[0] = true;
  Action fire; fire.type = ActionType::Fire; fire.player = 0;
  Action gun; gun.type = ActionType::Strike; gun.player = 0; gun.victim = 1; gun.weapon = Weapon::Revolver;
  Check(!ApplyAction(meleeState, fire).ok && !ApplyAction(meleeState, gun).ok, "retired firearm commands rejected live");
  auto archivedShot = ApplyRecordedAction(meleeState, fire);
  Check(archivedShot.ok && archivedShot.state.arms->bullets[0] == 4, "archive shot still replays");
  auto archivedHit = ApplyRecordedAction(archivedShot.state, gun);
  Check(archivedHit.ok && archivedHit.state.arms->health[1] == 50, "archive damage still replays");
  Check(!ApplyAction(archivedHit.state, fire).ok, "archive restore does not re-enable firearm");

}

// ------------------------------------------------------------------ golden replay

struct GoldenStats {
  int games = 0;
  int failedGames = 0;
  long steps = 0;
  long botChecks = 0;
  long probes = 0;
  long errors = 0;
  std::set<std::string> events;
};

std::string Canon(const Json& j) { return j.Canonical(); }

std::string DecisionText(const std::optional<Action>& a) {
  return a ? Canon(ActionToJson(*a)) : std::string("<none>");
}

std::string RecordedDecision(const Json& j) { return j.Has("error") ? std::string("<none>") : Canon(j); }

void NoteEvents(const std::vector<GameEvent>& events, std::set<std::string>& seen) {
  for (const Json& e : events) {
    const std::string type = e.Get("type")->AsStr();
    seen.insert(type);
    if (type == "OmenPlayed") seen.insert("play:" + e.Get("omen")->AsStr());
    if (type == "OmenBought" && e.Get("omen")->AsStr() == "relic") seen.insert("relic");
    if (type == "BankTraded") seen.insert("bank:" + std::to_string(e.Get("rate")->AsInt()));
    if (type == "ProductionShortage") seen.insert(e.Get("paid")->IsNull() ? "shortage:none" : "shortage:one");
    if (type == "LongestCausewayChanged" && !e.Get("previous")->IsNull() && !e.Get("holder")->IsNull())
      seen.insert("longest:transfer");
    if (type == "GreatestHostChanged" && !e.Get("previous")->IsNull()) seen.insert("host:transfer");
    if (type == "DiscardRequired") seen.insert("discard");
  }
}

/** Replays one golden game; returns false at the first difference (details printed). */
bool ReplayGame(const fs::path& file, const fs::path& outDir, GoldenStats& st) {
  std::string err;
  const Json g = Json::Parse(ReadFile(file), &err);
  const std::string name = file.stem().string();
  if (g.IsNull()) {
    std::printf("  FAIL %s: cannot parse (%s)\n", name.c_str(), err.c_str());
    return false;
  }
  GameConfig config;
  if (!ConfigFromJson(*g.Get("config"), config, &err)) {
    std::printf("  FAIL %s: config %s\n", name.c_str(), err.c_str());
    return false;
  }
  if (auto bad = ValidateConfig(config)) {
    std::printf("  FAIL %s: config rejected: %s\n", name.c_str(), bad->c_str());
    return false;
  }
  GameState s = CreateGame(config);
  const std::string initial = Canon(StateToJson(s));
  if (initial != g.Get("initialJson")->AsStr()) {
    std::printf("  FAIL %s: initial state differs %s\n", name.c_str(),
                FirstDifference(initial, g.Get("initialJson")->AsStr()).c_str());
    return false;
  }
  const auto& steps = g.Get("steps")->Items();
  for (size_t i = 0; i < steps.size(); i++) {
    const Json& step = steps[i];
    Action action;
    if (!ActionFromJson(*step.Get("action"), action, &err)) {
      std::printf("  FAIL %s step %zu: action %s\n", name.c_str(), i, err.c_str());
      return false;
    }
    const std::string recorded = Canon(*step.Get("action"));
    if (const Json* by = step.Get("by"); by && by->AsStr() == "bot") {
      st.botChecks++;
      const std::string mine = DecisionText(DecideAction(s));
      if (mine != recorded) {
        std::printf("  FAIL %s step %zu: bot chose %s\n    ts chose %s\n", name.c_str(), i, mine.c_str(), recorded.c_str());
        return false;
      }
    }
    if (const Json* probes = step.Get("probes")) {
      for (BotLevel lvl : {BotLevel::Wanderer, BotLevel::Warlord, BotLevel::Archdemon}) {
        st.probes++;
        const std::string mine = DecisionText(DecideAction(s, lvl, "probe"));
        const std::string theirs = RecordedDecision(*probes->Get(Name(lvl)));
        if (mine != theirs) {
          std::printf("  FAIL %s step %zu: %s probe %s\n    ts %s\n", name.c_str(), i, std::string(Name(lvl)).c_str(),
                      mine.c_str(), theirs.c_str());
          return false;
        }
      }
    }
    if (Canon(ActionToJson(action)) != recorded) {
      std::printf("  FAIL %s step %zu: action round trip %s vs %s\n", name.c_str(), i,
                  Canon(ActionToJson(action)).c_str(), recorded.c_str());
      return false;
    }
    ActionOutcome out = ApplyAction(s, action);
    const bool ok = step.Get("ok")->AsBool();
    st.steps++;
    if (out.ok != ok) {
      std::printf("  FAIL %s step %zu (%s): cpp %s, ts %s\n", name.c_str(), i, recorded.c_str(),
                  out.ok ? "accepted" : (out.error.code + " " + out.error.message).c_str(),
                  ok ? "accepted" : (step.Get("code")->AsStr() + " " + step.Get("message")->AsStr()).c_str());
      return false;
    }
    if (!ok) {
      st.errors++;
      if (out.error.code != step.Get("code")->AsStr() || out.error.message != step.Get("message")->AsStr()) {
        std::printf("  FAIL %s step %zu (%s): error %s '%s', ts %s '%s'\n", name.c_str(), i, recorded.c_str(),
                    out.error.code.c_str(), out.error.message.c_str(), step.Get("code")->AsStr().c_str(),
                    step.Get("message")->AsStr().c_str());
        return false;
      }
      continue;
    }
    s = std::move(out.state);
    NoteEvents(out.events, st.events);
    const std::string stateText = Canon(StateToJson(s));
    Json events = Json::Array();
    for (const auto& e : out.events) events.Push(e);
    const std::string eventsText = Canon(events);
    const bool sameState = GoldenHash(stateText) == step.Get("state")->AsStr();
    const bool sameEvents = GoldenHash(eventsText) == step.Get("events")->AsStr();
    if (!sameState || !sameEvents) {
      const std::string base = name + "-" + std::to_string(i);
      WriteFile(outDir / (base + "-cpp-state.json"), stateText);
      WriteFile(outDir / (base + "-cpp-events.json"), eventsText);
      std::printf("  FAIL %s step %zu (%s): %s differ\n    wrote native/golden/out/%s-cpp-*.json; compare with: pnpm golden --dump %s %zu\n",
                  name.c_str(), i, recorded.c_str(), !sameState ? (sameEvents ? "state" : "state and events") : "events",
                  base.c_str(), name.c_str(), i);
      return false;
    }
  }
  if (GoldenHash(Canon(StateToJson(s))) != g.Get("final")->AsStr()) {
    std::printf("  FAIL %s: final state differs\n", name.c_str());
    return false;
  }
  return true;
}

void GoldenTests(const fs::path& dir, const std::string& only, int maxFailures) {
  std::printf("golden games (%s)\n", dir.string().c_str());
  if (!fs::exists(dir)) {
    std::printf("  FAIL no golden data: run `pnpm golden` first\n");
    gFailures++;
    return;
  }
  std::vector<fs::path> files;
  for (const auto& e : fs::directory_iterator(dir))
    if (e.path().extension() == ".json" && e.path().stem().string().rfind(only, 0) == 0) files.push_back(e.path());
  std::sort(files.begin(), files.end());
  const fs::path outDir = dir.parent_path() / "out";
  GoldenStats st;
  const auto t0 = std::chrono::steady_clock::now();
  for (const auto& f : files) {
    st.games++;
    gChecks++;
    if (!ReplayGame(f, outDir, st)) {
      st.failedGames++;
      gFailures++;
      if (st.failedGames >= maxFailures) {
        std::printf("  stopping after %d failing games\n", st.failedGames);
        break;
      }
    }
  }
  const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  std::printf("  %d games, %d matched; %ld actions (%ld rejected as in TypeScript), %ld bot moves, %ld bot probes; %.1f s\n",
              st.games, st.games - st.failedGames, st.steps, st.errors, st.botChecks, st.probes, secs);
  if (only.empty() && st.failedGames == 0) {
    const char* required[] = {"play:warden", "play:decree", "play:harvest", "play:tithe", "play:manup", "relic",
                              "bank:4", "bank:3", "bank:2", "TradeCompleted", "TradeProposed", "TradeCountered",
                              "discard", "Stolen", "StealSkipped", "ProductionShortage", "CitadelBuilt",
                              "longest:transfer", "host:transfer", "GameWon", "Struck", "Slain", "DuelEnded",
                              "ChestOpened", "DevicePassed"};
    std::string missing;
    for (const char* r : required)
      if (!st.events.count(r)) missing += std::string(" ") + r;
    Check(missing.empty(), "rule coverage in golden games, missing:" + missing);
    std::printf("  rule coverage: %s\n", missing.empty() ? "complete" : missing.c_str());
  }
}

}  // namespace

int main(int argc, char** argv) {
  fs::path golden = fs::path("native") / "golden" / "data";
  std::string only;
  int maxFailures = 5;
  for (int i = 1; i < argc; i++) {
    const std::string a = argv[i];
    if (a == "--golden" && i + 1 < argc) golden = argv[++i];
    else if (a == "--only" && i + 1 < argc) only = argv[++i];
    else if (a == "--max-failures" && i + 1 < argc) maxFailures = std::atoi(argv[++i]);
  }
  UnitTests();
  GoldenTests(golden, only, maxFailures);
  std::printf("%s: %d checks, %d failures\n", gFailures ? "FAILED" : "PASSED", gChecks, gFailures);
  return gFailures ? 1 : 0;
}
