#include "Ui/HallSound.h"

#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"
#include "Sound/SoundWaveProcedural.h"
#include "Ui/HallSettings.h"

namespace
{
	struct FClip
	{
		TArray<uint8> Pcm;  // 16-bit mono
		int32 Rate = 48000;
	};

	/** Reads a 16-bit PCM WAV (as render_sfx.mjs writes it). */
	bool ReadWav(const TArray<uint8>& Bytes, FClip& Out)
	{
		if (Bytes.Num() < 44 || FMemory::Memcmp(Bytes.GetData(), "RIFF", 4) || FMemory::Memcmp(Bytes.GetData() + 8, "WAVE", 4)) return false;
		int32 At = 12;
		int16 Channels = 0, Bits = 0;
		while (At + 8 <= Bytes.Num())
		{
			const uint8* Chunk = Bytes.GetData() + At;
			const int32 Size = *reinterpret_cast<const int32*>(Chunk + 4);
			if (!FMemory::Memcmp(Chunk, "fmt ", 4))
			{
				Channels = *reinterpret_cast<const int16*>(Chunk + 10);
				Out.Rate = *reinterpret_cast<const int32*>(Chunk + 12);
				Bits = *reinterpret_cast<const int16*>(Chunk + 22);
			}
			else if (!FMemory::Memcmp(Chunk, "data", 4))
			{
				if (Channels != 1 || Bits != 16 || At + 8 + Size > Bytes.Num()) return false;
				Out.Pcm.Append(Chunk + 8, Size);
				return true;
			}
			At += 8 + Size + (Size & 1);
		}
		return false;
	}

	TMap<FString, FClip>& Clips()
	{
		static TMap<FString, FClip> Map;
		static bool bLoaded = false;
		if (!bLoaded)
		{
			bLoaded = true;
			const FString Dir = FPaths::ProjectContentDir() / TEXT("Slate/Sounds");
			TArray<FString> Files;
			IFileManager::Get().FindFiles(Files, *(Dir / TEXT("*.wav")), true, false);
			for (const FString& File : Files)
			{
				TArray<uint8> Bytes;
				FClip Clip;
				if (FFileHelper::LoadFileToArray(Bytes, *(Dir / File)) && ReadWav(Bytes, Clip)) Map.Add(FPaths::GetBaseFilename(File), MoveTemp(Clip));
				else UE_LOG(LogTemp, Warning, TEXT("Catnight: cannot read sound %s"), *File);
			}
			if (!Map.Num()) UE_LOG(LogTemp, Warning, TEXT("Catnight: no sounds in %s (node apps/catnight/Tools/render_sfx.mjs)"), *Dir);
		}
		return Map;
	}

	UWorld* World()
	{
		if (GEngine && GEngine->GameViewport) return GEngine->GameViewport->GetWorld();
		return nullptr;
	}

	FString Str(const catnight::GameEvent& E, const char* Key)
	{
		const catnight::Json* J = E.Get(Key);
		return J && J->IsStr() ? FString(UTF8_TO_TCHAR(J->AsStr().c_str())) : FString();
	}
}

namespace HallSound
{
	void Play(const FString& Name, float Volume)
	{
		const FHallSettings& Settings = FHallSettings::Get();
		const float Gain = Volume * Settings.Volume / 10.f;
		// Automation runs stay quiet unless asked (-CatnightSound).
		if (Gain <= 0.f || (FApp::IsUnattended() && !FParse::Param(FCommandLine::Get(), TEXT("CatnightSound")))) return;
		const FClip* Clip = Clips().Find(Name);
		UWorld* W = World();
		if (!Clip || !W) return;
		// A procedural wave plays what is queued once; one per play keeps overlapping sounds simple.
		USoundWaveProcedural* Wave = NewObject<USoundWaveProcedural>();
		Wave->SetSampleRate(Clip->Rate);
		Wave->NumChannels = 1;
		Wave->Duration = Clip->Pcm.Num() / 2.f / Clip->Rate;
		Wave->SoundGroup = SOUNDGROUP_Effects;
		Wave->bLooping = false;
		Wave->QueueAudio(Clip->Pcm.GetData(), Clip->Pcm.Num());
		UGameplayStatics::PlaySound2D(W, Wave, Gain);
	}

	void PlayEvents(const std::vector<catnight::GameEvent>& Events, int32 Viewer, bool bViewerIsHuman)
	{
		static const TMap<FString, FString> SoundFor = {
			{TEXT("DiceRolled"), TEXT("dice")}, {TEXT("CausewayBuilt"), TEXT("causeway")}, {TEXT("OutpostBuilt"), TEXT("outpost")},
			{TEXT("SetupOutpostPlaced"), TEXT("outpost")}, {TEXT("CitadelBuilt"), TEXT("citadel")}, {TEXT("WraithMoved"), TEXT("wraith")},
			{TEXT("Stolen"), TEXT("steal")}, {TEXT("TradeCompleted"), TEXT("trade")}, {TEXT("BankTraded"), TEXT("trade")},
			{TEXT("OmenBought"), TEXT("omen")}, {TEXT("Discarded"), TEXT("discard")}, {TEXT("GameWon"), TEXT("victory")},
			{TEXT("TradeProposed"), TEXT("card")}, {TEXT("DuelStarted"), TEXT("duel")}};
		TSet<FString> Played;  // one of each per action, as several events can share a sound
		auto Once = [&Played](const FString& Name, float Volume = 1.f)
		{
			if (Played.Contains(Name)) return;
			Played.Add(Name);
			Play(Name, Volume);
		};
		for (const catnight::GameEvent& E : Events)
		{
			const FString Type = Str(E, "type");
			if (Type == TEXT("OmenPlayed"))
			{
				const FString Omen = Str(E, "omen");
				Once(Omen == TEXT("warden") ? TEXT("warden") : Omen == TEXT("tithe") ? TEXT("tithe") : TEXT("omen"));
			}
			else if (Type == TEXT("ResourcesProduced"))
			{
				bool bAny = false;
				if (const catnight::Json* Gains = E.Get("gains"))
					for (const catnight::Json& G : Gains->Items())
						for (const auto& [Key, Value] : G.Fields()) bAny |= Value.IsInt() && Value.AsInt() > 0;
				if (bAny) Once(TEXT("collect"));
			}
			else if (Type == TEXT("TurnStarted"))
			{
				// Your own turn gets the horn; everyone else's the small bell.
				const catnight::Json* P = E.Get("player");
				const bool bMine = bViewerIsHuman && P && P->IsInt() && P->AsInt() == Viewer;
				Once(bMine ? TEXT("ui-horn") : TEXT("turn"), bMine ? 1.f : 0.7f);
			}
			else if (const FString* Name = SoundFor.Find(Type))
			{
				Once(*Name);
			}
		}
	}

	TArray<FString> Loaded()
	{
		TArray<FString> Names;
		Clips().GetKeys(Names);
		Names.Sort();
		return Names;
	}
}
