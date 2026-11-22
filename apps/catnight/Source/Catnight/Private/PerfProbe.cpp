#include "PerfProbe.h"

#include "CatnightMatch.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformMemory.h"
#include "HAL/PlatformMisc.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "ProfilingDebugging/CsvProfiler.h"
#include "RHI.h"
#include "RenderCore.h"
#include "Ui/HallSettings.h"

namespace CatnightPerf
{
	namespace
	{
		struct FSample
		{
			float Frame, Game, Render, Rhi, Gpu;
			int32 Draws, Tris;
			float MemMB;
			int32 Actions;
		};

		float Ms(uint32 Cycles) { return static_cast<float>(FPlatformTime::ToMilliseconds(Cycles)); }

		float CVar(const TCHAR* Name)
		{
			IConsoleVariable* V = IConsoleManager::Get().FindConsoleVariable(Name);
			return V ? V->GetFloat() : -1.f;
		}

		FString Stats(const TCHAR* Name, TArray<float> Values)
		{
			if (Values.IsEmpty()) return FString::Printf(TEXT("%s: none"), Name);
			double Sum = 0;
			for (float V : Values) Sum += V;
			Values.Sort();
			auto At = [&Values](float P) { return Values[FMath::Clamp(FMath::FloorToInt32(P * (Values.Num() - 1)), 0, Values.Num() - 1)]; };
			return FString::Printf(TEXT("%-7s avg %6.2f  p50 %6.2f  p95 %6.2f  p99 %6.2f  max %7.2f"), Name, Sum / Values.Num(), At(0.5f), At(0.95f), At(0.99f), Values.Last());
		}
	}

	FTSTicker::FDelegateHandle StartFromCommandLine(UWorld* World, TSharedRef<FCatnightMatch> Match)
	{
		const TCHAR* Cmd = FCommandLine::Get();
		FString File;
		if (!FParse::Value(Cmd, TEXT("CatnightPerf="), File)) return FTSTicker::FDelegateHandle();
		float Warmup = 8.f, Seconds = 20.f;
		FParse::Value(Cmd, TEXT("CatnightPerfWarmup="), Warmup);
		FParse::Value(Cmd, TEXT("CatnightPerfSeconds="), Seconds);
		const bool bUntilWin = FParse::Param(Cmd, TEXT("CatnightPerfUntilWin"));
		const bool bGpu = FParse::Param(Cmd, TEXT("CatnightPerfGpu"));
		// -CatnightPerfCapped measures with the player's frame-rate setting in force.
		const bool bCapped = FParse::Param(Cmd, TEXT("CatnightPerfCapped"));
		FHallSettings::bProfiling = !bCapped;
		if (GEngine && !bCapped)
		{
			GEngine->Exec(World, TEXT("t.MaxFPS 0"));
			GEngine->Exec(World, TEXT("r.VSync 0"));
		}

		TSharedRef<TArray<FSample>> Samples = MakeShared<TArray<FSample>>();
		Samples->Reserve(1 << 16);
		const double Start = FPlatformTime::Seconds() + Warmup;
		TWeakObjectPtr<UWorld> WeakWorld = World;
		bool bGpuDone = false, bCsvStarted = false;
		double ExitAt = 0;
		return FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightPerf"), 0.f, [=](float) mutable
		{
			const double Now = FPlatformTime::Seconds();
			if (Now < Start) return true;
			if (ExitAt > 0)
			{
				// The engine's CSV writes on a worker; quit once it is on disk.
#if CSV_PROFILER
				if (FCsvProfiler::Get()->IsWritingFile() && Now < ExitAt + 20.0) return true;
#endif
				FPlatformMisc::RequestExit(false, TEXT("CatnightPerf"));
				return false;
			}
#if CSV_PROFILER
			// The engine's own CSV (Saved/Profiling/CSV) alongside ours: its thread and GPU times and
			// draw counts are taken at the right point in the frame.
			if (!bCsvStarted)
			{
				FCsvProfiler::Get()->BeginCapture(-1, FPaths::GetPath(File), FPaths::GetBaseFilename(File) + TEXT("-engine.csv"));
				bCsvStarted = true;
			}
#endif
			FSample S;
			S.Frame = static_cast<float>(FApp::GetDeltaTime() * 1000.0);
			S.Game = Ms(GGameThreadTime);
			S.Render = Ms(GRenderThreadTime);
			S.Rhi = Ms(GRHIThreadTime);
			S.Gpu = Ms(RHIGetGPUFrameCycles(0));
			S.Draws = GNumDrawCallsRHI[0];
			S.Tris = GNumPrimitivesDrawnRHI[0];
			S.MemMB = static_cast<float>(FPlatformMemory::GetStats().UsedPhysical / (1024.0 * 1024.0));
			S.Actions = Match->ActionCount();
			Samples->Add(S);

			if (bGpu && !bGpuDone && Now - Start > Seconds * 0.5 && GEngine && WeakWorld.IsValid())
			{
				GEngine->Exec(WeakWorld.Get(), TEXT("ProfileGPU"));
				bGpuDone = true;
			}
			const bool bDone = bUntilWin ? (Match->IsEnded() || Now - Start > 1800.0) : Now - Start >= Seconds;
			if (!bDone) return true;

			FString Csv = TEXT("frame_ms,game_ms,render_ms,rhi_ms,gpu_ms,draws,tris,mem_mb,actions\n");
			TArray<float> Frame, Game, Render, Rhi, Gpu, Draws, Tris;
			float PeakMem = 0, FirstMem = Samples->Num() ? (*Samples)[0].MemMB : 0.f;
			int32 Over16 = 0, Over33 = 0, Hitches = 0;
			for (const FSample& X : *Samples)
			{
				Csv += FString::Printf(TEXT("%.3f,%.3f,%.3f,%.3f,%.3f,%d,%d,%.1f,%d\n"), X.Frame, X.Game, X.Render, X.Rhi, X.Gpu, X.Draws, X.Tris, X.MemMB, X.Actions);
				Frame.Add(X.Frame); Game.Add(X.Game); Render.Add(X.Render); Rhi.Add(X.Rhi); Gpu.Add(X.Gpu);
				Draws.Add(static_cast<float>(X.Draws)); Tris.Add(X.Tris / 1000.f);
				PeakMem = FMath::Max(PeakMem, X.MemMB);
				Over16 += X.Frame > 16.7f;
				Over33 += X.Frame > 33.4f;
				Hitches += X.Frame > 50.f;
			}
			FFileHelper::SaveStringToFile(Csv, *File);
			FIntPoint Size(0, 0);
			if (WeakWorld.IsValid() && WeakWorld->GetGameViewport() && WeakWorld->GetGameViewport()->Viewport) Size = WeakWorld->GetGameViewport()->Viewport->GetSizeXY();
			const double Span = Now - Start;
			UE_LOG(LogTemp, Display, TEXT("CATNIGHT PERF %d frames in %.1f s (%.1f fps), viewport %dx%d, screen %% %.0f, RHI %s, actions %d"),
				Samples->Num(), Span, Samples->Num() / FMath::Max(0.001, Span), Size.X, Size.Y, CVar(TEXT("r.ScreenPercentage")), GDynamicRHI ? GDynamicRHI->GetName() : TEXT("?"), Match->ActionCount());
			for (const FString& Line : {Stats(TEXT("frame"), Frame), Stats(TEXT("game"), Game), Stats(TEXT("render"), Render), Stats(TEXT("rhi"), Rhi), Stats(TEXT("gpu"), Gpu), Stats(TEXT("draws"), Draws), Stats(TEXT("ktris"), Tris)})
			{
				UE_LOG(LogTemp, Display, TEXT("CATNIGHT PERF %s"), *Line);
			}
			UE_LOG(LogTemp, Display, TEXT("CATNIGHT PERF frames over 16.7 ms: %d (%.1f%%), over 33.4 ms: %d, over 50 ms: %d; memory %.0f -> %.0f MB (peak %.0f)"),
				Over16, 100.0 * Over16 / FMath::Max(1, Samples->Num()), Over33, Hitches, FirstMem, Samples->Num() ? Samples->Last().MemMB : 0.f, PeakMem);
#if CSV_PROFILER
			if (bCsvStarted) FCsvProfiler::Get()->EndCapture();
#endif
			ExitAt = Now;
			return true;
		});
	}
}
