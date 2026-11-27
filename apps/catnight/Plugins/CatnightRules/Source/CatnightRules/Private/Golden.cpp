#include "CatnightRules/Golden.h"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <system_error>

#include "CatnightRules/Bots.h"
#include "CatnightRules/Rules.h"
#include "CatnightRules/Serialize.h"

namespace catnight {

namespace {

namespace fs = std::filesystem;

std::string ReadFile(const fs::path& p) {
  std::ifstream f(p, std::ios::binary);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

void WriteFile(const fs::path& p, const std::string& text) {
  std::error_code ec;
  fs::create_directories(p.parent_path(), ec);
  std::ofstream f(p, std::ios::binary);
  f << text;
}

std::string FirstDifference(const std::string& a, const std::string& b) {
  size_t i = 0;
  while (i < a.size() && i < b.size() && a[i] == b[i]) i++;
  const size_t from = i > 60 ? i - 60 : 0;
  return "at char " + std::to_string(i) + "\n    cpp: ..." + a.substr(from, 140) + "\n    ts:  ..." + b.substr(from, 140);
}

std::string Canon(const Json& j) { return j.Canonical(); }

std::string DecisionText(const std::optional<Action>& a) { return a ? Canon(ActionToJson(*a)) : std::string("<none>"); }

std::string RecordedDecision(const Json& j) { return j.Has("error") ? std::string("<none>") : Canon(j); }

std::string Str(const Json* j) { return j && j->IsStr() ? j->AsStr() : std::string(); }

void NoteEvents(const std::vector<GameEvent>& events, std::set<std::string>& seen) {
  for (const Json& e : events) {
    const std::string type = Str(e.Get("type"));
    seen.insert(type);
    if (type == "OmenPlayed") seen.insert("play:" + Str(e.Get("omen")));
    if (type == "OmenBought" && Str(e.Get("omen")) == "relic") seen.insert("relic");
    if (type == "BankTraded") seen.insert("bank:" + std::to_string(e.Get("rate")->AsInt()));
    if (type == "ProductionShortage") seen.insert(e.Get("paid")->IsNull() ? "shortage:none" : "shortage:one");
    if (type == "LongestCausewayChanged" && !e.Get("previous")->IsNull() && !e.Get("holder")->IsNull())
      seen.insert("longest:transfer");
    if (type == "GreatestHostChanged" && !e.Get("previous")->IsNull()) seen.insert("host:transfer");
    if (type == "DiscardRequired") seen.insert("discard");
  }
}

struct Run {
  GoldenSummary& sum;
  std::set<std::string> events;
  fs::path outDir;
};

/** Replays one game; on the first difference returns its description. */
std::string ReplayGame(const fs::path& file, Run& run) {
  GoldenSummary& st = run.sum;
  std::string err;
  const std::string name = file.stem().string();
  const Json g = Json::Parse(ReadFile(file), &err);
  if (g.IsNull()) return name + ": cannot parse (" + err + ")";
  GameConfig config;
  if (!ConfigFromJson(*g.Get("config"), config, &err)) return name + ": config " + err;
  if (auto bad = ValidateConfig(config)) return name + ": config rejected: " + *bad;
  GameState s = CreateGame(config);
  const std::string initial = Canon(StateToJson(s));
  if (initial != Str(g.Get("initialJson"))) {
    return name + ": initial state differs " + FirstDifference(initial, Str(g.Get("initialJson")));
  }
  const auto& steps = g.Get("steps")->Items();
  for (size_t i = 0; i < steps.size(); i++) {
    const Json& step = steps[i];
    const std::string at = name + " step " + std::to_string(i);
    Action action;
    if (!ActionFromJson(*step.Get("action"), action, &err)) return at + ": action " + err;
    const std::string recorded = Canon(*step.Get("action"));
    if (Str(step.Get("by")) == "bot") {
      st.botChecks++;
      const std::string mine = DecisionText(DecideAction(s));
      if (mine != recorded) return at + ": bot chose " + mine + "\n    ts chose " + recorded;
    }
    if (const Json* probes = step.Get("probes")) {
      for (BotLevel lvl : {BotLevel::Wanderer, BotLevel::Warlord, BotLevel::Archdemon}) {
        st.probes++;
        const std::string mine = DecisionText(DecideAction(s, lvl, "probe"));
        const std::string theirs = RecordedDecision(*probes->Get(Name(lvl)));
        if (mine != theirs) return at + ": " + std::string(Name(lvl)) + " probe " + mine + "\n    ts " + theirs;
      }
    }
    if (Canon(ActionToJson(action)) != recorded) return at + ": action round trip " + Canon(ActionToJson(action));
    ActionOutcome out = ApplyAction(s, action);
    const bool ok = step.Get("ok")->AsBool();
    st.steps++;
    if (out.ok != ok) {
      return at + " (" + recorded + "): cpp " + (out.ok ? "accepted" : out.error.code + " " + out.error.message) +
             ", ts " + (ok ? "accepted" : Str(step.Get("code")) + " " + Str(step.Get("message")));
    }
    if (!ok) {
      st.errors++;
      if (out.error.code != Str(step.Get("code")) || out.error.message != Str(step.Get("message"))) {
        return at + " (" + recorded + "): error " + out.error.code + " '" + out.error.message + "', ts " +
               Str(step.Get("code")) + " '" + Str(step.Get("message")) + "'";
      }
      continue;
    }
    s = std::move(out.state);
    NoteEvents(out.events, run.events);
    const std::string stateText = Canon(StateToJson(s));
    Json events = Json::Array();
    for (const auto& e : out.events) events.Push(e);
    const std::string eventsText = Canon(events);
    const bool sameState = GoldenHash(stateText) == Str(step.Get("state"));
    const bool sameEvents = GoldenHash(eventsText) == Str(step.Get("events"));
    if (!sameState || !sameEvents) {
      std::string msg = at + " (" + recorded + "): " + (!sameState ? (sameEvents ? "state" : "state and events") : "events") +
                        " differ";
      if (!run.outDir.empty()) {
        const std::string base = name + "-" + std::to_string(i);
        WriteFile(run.outDir / (base + "-cpp-state.json"), stateText);
        WriteFile(run.outDir / (base + "-cpp-events.json"), eventsText);
        msg += "\n    wrote " + base + "-cpp-*.json; compare with: pnpm golden --dump " + name + " " + std::to_string(i);
      }
      return msg;
    }
  }
  if (GoldenHash(Canon(StateToJson(s))) != Str(g.Get("final"))) return name + ": final state differs";
  return {};
}

}  // namespace

GoldenSummary ReplayGoldenDir(const std::string& dir, const GoldenOptions& options) {
  GoldenSummary sum;
  std::error_code ec;
  if (!fs::exists(dir, ec)) {
    sum.failures.push_back("no golden data in " + dir + ": run `pnpm golden` first");
    return sum;
  }
  std::vector<fs::path> files;
  for (fs::directory_iterator it(dir, ec), end; !ec && it != end; it.increment(ec)) {
    const fs::path& p = it->path();
    if (p.extension() == ".json" && p.stem().string().rfind(options.only, 0) == 0) files.push_back(p);
  }
  std::sort(files.begin(), files.end());
  Run run{sum, {}, options.outDir.empty() ? fs::path() : fs::path(options.outDir)};
  for (const auto& f : files) {
    sum.games++;
    std::string failure = ReplayGame(f, run);
    if (failure.empty()) {
      sum.matched++;
    } else {
      sum.failures.push_back(std::move(failure));
      if (static_cast<int>(sum.failures.size()) >= options.maxFailures) break;
    }
  }
  if (options.only.empty() && sum.failures.empty()) {
    static const char* kRequired[] = {"play:warden", "play:decree", "play:harvest", "play:tithe", "play:manup", "relic",
                                      "bank:4", "bank:3", "bank:2", "TradeCompleted", "TradeProposed", "TradeCountered",
                                      "discard", "Stolen", "StealSkipped", "ProductionShortage", "CitadelBuilt",
                                      "longest:transfer", "host:transfer", "GameWon", "Struck", "Slain", "DuelEnded",
                                      "ChestOpened", "DevicePassed"};
    for (const char* r : kRequired)
      if (!run.events.count(r)) sum.missingRules.push_back(r);
  }
  return sum;
}

}  // namespace catnight
