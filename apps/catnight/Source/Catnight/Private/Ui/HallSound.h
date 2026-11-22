// Sounds for the table and the Hall & Chart UI: the web game's synthesized effects and the UI
// foley, rendered to WAV by Tools/render_sfx.mjs (Content/Slate/Sounds, staged with Slate) and
// played as procedural waves, so no imported sound assets are needed.
#pragma once

#include "CoreMinimal.h"
#include "CatnightRules/State.h"

namespace HallSound
{
	/** Plays a sound by name (e.g. "dice", "ui-brass") at Volume × the Effects setting. */
	void Play(const FString& Name, float Volume = 1.f);
	/** The sounds for the events of one action, as the web's SOUND_FOR / soundsFor. */
	void PlayEvents(const std::vector<catnight::GameEvent>& Events, int32 Viewer, bool bViewerIsHuman);
	/** Names of every sound that loaded (for the gallery and tests). */
	TArray<FString> Loaded();
}
