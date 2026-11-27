// -CatnightPerf=<file.csv>: records every frame's timings for a while, logs a summary and quits.
//
//   -CatnightPerfWarmup=<s>    seconds before recording (default 8: shaders, first layout, lights)
//   -CatnightPerfSeconds=<s>   seconds to record (default 20)
//   -CatnightPerfUntilWin      record until the game ends instead (autoplay), at most 30 minutes
//   -CatnightPerfGpu           log one ProfileGPU pass breakdown halfway through
//   -CatnightPerfCapped        keep the Frame rate setting (with -CatnightFrameRate=0|1|2) instead of uncapping
//
// Columns are stat unit's numbers: frame, game thread, render thread, RHI thread and GPU ms, plus
// draw calls, triangles, the process's memory and the game's action count. Frame rate is uncapped
// (t.MaxFPS 0, r.VSync 0) so the numbers show the headroom, not the cap. The engine's own CSV
// profile is written beside it as <file>-engine.csv.
#pragma once

#include "CoreMinimal.h"
#include "Containers/Ticker.h"

class FCatnightMatch;

namespace CatnightPerf
{
	/** Starts the probe if the command line asks for it; returns an invalid handle otherwise. */
	FTSTicker::FDelegateHandle StartFromCommandLine(UWorld* World, TSharedRef<FCatnightMatch> Match);
}
