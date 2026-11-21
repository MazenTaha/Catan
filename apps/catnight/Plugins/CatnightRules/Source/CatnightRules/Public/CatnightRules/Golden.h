// Golden replay: games recorded from the TypeScript engine (native/golden/export.ts) replayed
// through the C++ rules, comparing state, events, errors and bot choices after every action.
// Shared by native/tests and the Unreal automation test, so both builds prove the same thing.
#pragma once

#include "CatnightRules/Api.h"

#include <set>
#include <string>
#include <vector>

namespace catnight {

struct GoldenOptions {
  std::string only;        // replay only games whose name starts with this
  int maxFailures = 5;     // stop after this many failing games
  std::string outDir;      // where to write the C++ state of a first difference ("" = none)
};

struct GoldenSummary {
  int games = 0;
  int matched = 0;
  long steps = 0;
  long errors = 0;      // actions rejected, with the same code and message as TypeScript
  long botChecks = 0;   // recorded bot moves re-decided in C++
  long probes = 0;      // extra decisions of all three levels
  std::vector<std::string> failures;
  std::vector<std::string> missingRules;  // rule events never seen (only for a full run)
  bool Passed() const { return games > 0 && matched == games && missingRules.empty(); }
};

CATNIGHTRULES_API GoldenSummary ReplayGoldenDir(const std::string& dir, const GoldenOptions& options);

}  // namespace catnight
