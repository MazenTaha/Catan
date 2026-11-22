// Hall & Chart for Unreal (docs/CATNIGHT_UI_PLAN.md §4): colour tokens, the OFL fonts and every
// image brush. Images and fonts are files under Content/Slate (made by Tools/render_ui.mjs and
// Tools/fonts.py), loaded by path, so the whole UI is rebuilt from text and scripts.
#pragma once

#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"
#include "Styling/SlateBrush.h"
#include "CatnightRules/Keys.h"

namespace Hall
{
	// Colour tokens (plan §4.1).
	namespace Color
	{
		extern const FLinearColor StoneMortar, Stone1, Stone2;
		extern const FLinearColor OnDark, OnDarkMuted, OnDarkOk, OnDarkWarn;
		extern const FLinearColor Ink, MapInk, MapInkMuted, Rubric, RubricDark, OkInk;
		extern const FLinearColor Vellum, Parchment, PaperCard;
		extern const FLinearColor Gold, GoldLight, GoldDark, Brass, Iron;
		extern const FLinearColor Oak, OakEdge, OakDeep;
		extern const FLinearColor Wax, WaxDark, WaxLight;
		extern const FLinearColor Gules, Azure, Vert, Sable;
		FLinearColor Player(catnight::PlayerColor C);
	}

	/** Loads fonts and brushes once (safe to call again). */
	void Init();

	// Fonts (sizes in reference pixels at 1080p; converted to Slate points).
	FSlateFontInfo Title(float Px);   // UnifrakturCook: titles and score numerals only
	FSlateFontInfo Label(float Px);   // IM Fell English SC: buttons, tabs, ribbons, heads
	FSlateFontInfo Body(float Px);    // IM Fell DW Pica: text and numbers
	FSlateFontInfo Italic(float Px);  // short glosses only
	FSlateFontInfo BodySC(float Px);  // small caps body

	/** An image under Content/Slate/HallKit, e.g. "banners/player-crimson", drawn at its natural size. */
	const FSlateBrush* Image(const FString& Name);
	/** The same image as a 9-slice box (margins as fractions of the image). */
	const FSlateBrush* Box(const FString& Name, const FMargin& Margin);
	/** A tiling texture ("textures/parchment"), tinted. */
	const FSlateBrush* Tile(const FString& Name, const FLinearColor& Tint = FLinearColor::White);
	/** The natural size of an image in reference pixels (the PNG is rendered at 2x or 3x). */
	FVector2D ImageSize(const FString& Name);

	FString ArmsName(catnight::PlayerColor C, catnight::Sigil S);
	FString CardName(catnight::Resource R);
	FString OmenCardName(catnight::OmenType O);
	FString PlayerBannerName(catnight::PlayerColor C);

	/** Reduce motion (settings): widgets skip sway, flicker and travel. */
	extern bool bReduceMotion;
	/** The last input came from a gamepad (prompts show pad glyphs), else mouse and keys. */
	extern bool bGamepad;

	/** What a button prompt stands for; HallKit::Prompt shows the glyph for the device in use. */
	enum class EPrompt : uint8 { Confirm, Back, Primary, Cycle, Menu, Undo, Log, Turn, Zoom };
	/** The glyph image names for a prompt on the current device (one or two images). */
	TArray<FString> PromptGlyphs(EPrompt P);
}
