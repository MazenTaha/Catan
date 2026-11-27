#include "Ui/HallStyle.h"

#include "Brushes/SlateBoxBrush.h"
#include "Brushes/SlateImageBrush.h"
#include "Fonts/CompositeFont.h"
#include "Framework/Application/IInputProcessor.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

using namespace catnight;

namespace Hall
{
	bool bReduceMotion = false;

	namespace Color
	{
		static FLinearColor H(uint32 Rgb) { return FLinearColor(FColor((Rgb >> 16) & 255, (Rgb >> 8) & 255, Rgb & 255)); }
		const FLinearColor StoneMortar = H(0x16120f), Stone1 = H(0x29241f), Stone2 = H(0x2e2823);
		const FLinearColor OnDark = H(0xf1e3c2), OnDarkMuted = H(0xcdb98e), OnDarkOk = H(0xbfe8a0), OnDarkWarn = H(0xffc08a);
		const FLinearColor Ink = H(0x1a120b), MapInk = H(0x3a2614), MapInkMuted = H(0x6b4e2e), Rubric = H(0xa8281e), RubricDark = H(0x7a1912), OkInk = H(0x2f5a46);
		const FLinearColor Vellum = H(0xe9d5a8), Parchment = H(0xead6ad), PaperCard = H(0xf1e4c4);
		const FLinearColor Gold = H(0xd9a93f), GoldLight = H(0xf3d27a), GoldDark = H(0x8a6018), Brass = H(0xb48a3a), Iron = H(0x2a2a2e);
		const FLinearColor Oak = H(0x3a2414), OakEdge = H(0x5a3a20), OakDeep = H(0x120a05);
		const FLinearColor Wax = H(0x8e1a14), WaxDark = H(0x5c0f0b), WaxLight = H(0xc2452f);
		const FLinearColor Gules = H(0x8a1a16), Azure = H(0x1f3a7a), Vert = H(0x24543a), Sable = H(0x1f1b18);

		FLinearColor Player(PlayerColor C)
		{
			switch (C)
			{
			case PlayerColor::Crimson: return H(0xc4302b);
			case PlayerColor::Frost: return H(0x3f7fd4);
			case PlayerColor::Bone: return H(0xe8e2d0);
			case PlayerColor::Violet: return H(0xe8842c);
			}
			return FLinearColor::White;
		}
	}

	namespace
	{
		/** A brush the renderer loads from its file on first use (dynamically loaded): brushes outside a
		 *  registered style set are otherwise never loaded and draw as white. */
		struct FHallBrush : public FSlateBrush
		{
			FHallBrush(ESlateBrushDrawType::Type Draw, const FString& Path, const FMargin& Margin, ESlateBrushTileType::Type Tiling, const FVector2D& Size, const FLinearColor& Tint)
				: FSlateBrush(Draw, FName(*Path), Margin, Tiling, ESlateBrushImageType::FullColor, Size, Tint, nullptr, true)
			{
			}
		};

		TMap<FString, TSharedPtr<FSlateBrush>> Brushes;
		TMap<FString, FVector2D> Sizes;

		FString Root() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectContentDir() / TEXT("Slate")); }
		FString PathOf(const FString& Name) { return Root() / TEXT("HallKit") / (Name + TEXT(".png")); }

		/** The PNG's pixel size, from its IHDR chunk. */
		FIntPoint PngPixels(const FString& Path)
		{
			TArray<uint8> Head;
			TUniquePtr<FArchive> Reader(IFileManager::Get().CreateFileReader(*Path));
			if (!Reader || Reader->TotalSize() < 24) return FIntPoint(64, 64);
			Head.SetNum(24);
			Reader->Serialize(Head.GetData(), 24);
			auto Be = [&](int32 At) { return (Head[At] << 24) | (Head[At + 1] << 16) | (Head[At + 2] << 8) | Head[At + 3]; };
			return FIntPoint(Be(16), Be(20));
		}

		float RenderScale(const FString& Name)
		{
			if (Name.StartsWith(TEXT("banners/menu-"))) return 3.f;  // also the title's menu-cloth-*
			if (Name.StartsWith(TEXT("cards/")) || Name.StartsWith(TEXT("textures/"))) return 1.f;
			return 2.f;
		}

		FSlateFontInfo Font(const TCHAR* File, float Px, float MinPx = 1.f)
		{
			Px = FMath::Max(Px, MinPx);
			static TMap<FString, TSharedPtr<const FCompositeFont>> Faces;
			TSharedPtr<const FCompositeFont>& Face = Faces.FindOrAdd(File);
			if (!Face)
			{
				Face = MakeShared<FStandaloneCompositeFont>(NAME_None, Root() / TEXT("Fonts") / File, EFontHinting::Default, EFontLoadingPolicy::LazyLoad);
			}
			// Slate sizes are points at 96 DPI: 1 pt = 4/3 px.
			return FSlateFontInfo(Face, FMath::Max(1.f, Px * 0.75f));
		}
	}

	namespace
	{
		/** Watches every input to tell whether a gamepad or the mouse and keys are in use. */
		class FDeviceSniffer : public IInputProcessor
		{
		public:
			virtual void Tick(const float, FSlateApplication&, TSharedRef<ICursor>) override {}
			virtual bool HandleKeyDownEvent(FSlateApplication&, const FKeyEvent& E) override
			{
				Set(E.GetKey().IsGamepadKey());
				return false;
			}
			virtual bool HandleAnalogInputEvent(FSlateApplication&, const FAnalogInputEvent& E) override
			{
				if (E.GetKey().IsGamepadKey() && FMath::Abs(E.GetAnalogValue()) > 0.35f) Set(true);
				return false;
			}
			virtual bool HandleMouseMoveEvent(FSlateApplication&, const FPointerEvent& E) override
			{
				if (E.GetCursorDelta().SizeSquared() > 9.f) Set(false);
				return false;
			}
			virtual bool HandleMouseButtonDownEvent(FSlateApplication&, const FPointerEvent&) override
			{
				Set(false);
				return false;
			}
			virtual const TCHAR* GetDebugName() const override { return TEXT("CatnightDeviceSniffer"); }

		private:
		public:
			/** -CatnightGamepad (screenshots): stay on pad prompts whatever the mouse does. */
			static inline bool bLocked = false;

		private:
			static void Set(bool bPad)
			{
				if (bGamepad == bPad || bLocked) return;
				bGamepad = bPad;
				// Show the cursor only for the mouse.
				if (FSlateApplication::IsInitialized()) FSlateApplication::Get().SetPlatformCursorVisibility(!bPad);
			}
		};
	}

	bool bGamepad = false;

	void Init()
	{
		// Brushes are created on demand; the device sniffer is registered once.
		static bool bDone = false;
		if (bDone || !FSlateApplication::IsInitialized()) return;
		bDone = true;
		bGamepad = FDeviceSniffer::bLocked = FParse::Param(FCommandLine::Get(), TEXT("CatnightGamepad"));
		FSlateApplication::Get().RegisterInputPreProcessor(MakeShared<FDeviceSniffer>());
	}

	TArray<FString> PromptGlyphs(EPrompt P)
	{
		const bool Pad = bGamepad;
		switch (P)
		{
		case EPrompt::Confirm: return {Pad ? TEXT("glyphs/pad-a") : TEXT("glyphs/key-enter")};
		case EPrompt::Back: return {Pad ? TEXT("glyphs/pad-b") : TEXT("glyphs/key-esc")};
		case EPrompt::Primary: return {Pad ? TEXT("glyphs/pad-y") : TEXT("glyphs/key-space")};
		case EPrompt::Cycle: return Pad ? TArray<FString>{TEXT("glyphs/pad-lb"), TEXT("glyphs/pad-rb")} : TArray<FString>{TEXT("glyphs/key-arrows")};
		case EPrompt::Menu: return {Pad ? TEXT("glyphs/pad-menu") : TEXT("glyphs/key-esc")};
		case EPrompt::Undo: return {Pad ? TEXT("glyphs/pad-x") : TEXT("glyphs/key-ctrlz")};
		case EPrompt::Log: return {Pad ? TEXT("glyphs/pad-view") : TEXT("glyphs/key-l")};
		case EPrompt::Turn: return {Pad ? TEXT("glyphs/pad-rs") : TEXT("glyphs/mouse-right")};
		case EPrompt::Zoom: return Pad ? TArray<FString>{TEXT("glyphs/pad-lt"), TEXT("glyphs/pad-rt")} : TArray<FString>{TEXT("glyphs/mouse-wheel")};
		}
		return {};
	}

	FVector2D ImageSize(const FString& Name)
	{
		if (const FVector2D* Found = Sizes.Find(Name)) return *Found;
		const FIntPoint Px = PngPixels(PathOf(Name));
		const FVector2D Size = FVector2D(Px.X, Px.Y) / RenderScale(Name);
		Sizes.Add(Name, Size);
		return Size;
	}

	const FSlateBrush* Image(const FString& Name)
	{
		const FString Key = TEXT("img:") + Name;
		if (TSharedPtr<FSlateBrush>* Found = Brushes.Find(Key)) return Found->Get();
		TSharedPtr<FSlateBrush> B = MakeShared<FHallBrush>(ESlateBrushDrawType::Image, PathOf(Name), FMargin(0), ESlateBrushTileType::NoTile, ImageSize(Name), FLinearColor::White);
		Brushes.Add(Key, B);
		return B.Get();
	}

	const FSlateBrush* Box(const FString& Name, const FMargin& Margin)
	{
		const FString Key = FString::Printf(TEXT("box:%s:%.3f,%.3f,%.3f,%.3f"), *Name, Margin.Left, Margin.Top, Margin.Right, Margin.Bottom);
		if (TSharedPtr<FSlateBrush>* Found = Brushes.Find(Key)) return Found->Get();
		TSharedPtr<FSlateBrush> B = MakeShared<FHallBrush>(ESlateBrushDrawType::Box, PathOf(Name), Margin, ESlateBrushTileType::NoTile, ImageSize(Name), FLinearColor::White);
		Brushes.Add(Key, B);
		return B.Get();
	}

	const FSlateBrush* Tile(const FString& Name, const FLinearColor& Tint)
	{
		const FString Key = TEXT("tile:") + Name + Tint.ToString();
		if (TSharedPtr<FSlateBrush>* Found = Brushes.Find(Key)) return Found->Get();
		TSharedPtr<FSlateBrush> B = MakeShared<FHallBrush>(ESlateBrushDrawType::Image, PathOf(Name), FMargin(0), ESlateBrushTileType::Both, ImageSize(Name), Tint);
		Brushes.Add(Key, B);
		return B.Get();
	}

	// Floors (plan §4.2): nothing a player reads is smaller than this at 1080p, whatever a call asks.
	FSlateFontInfo Title(float Px) { return Font(TEXT("UnifrakturCook-Bold.ttf"), Px); }
	FSlateFontInfo Label(float Px) { return Font(TEXT("IMFellEnglishSC-Regular.ttf"), Px, 17.f); }
	FSlateFontInfo Body(float Px) { return Font(TEXT("IMFellDWPica-Regular.ttf"), Px, 16.f); }
	FSlateFontInfo Italic(float Px) { return Font(TEXT("IMFellDWPica-Italic.ttf"), Px, 16.f); }
	FSlateFontInfo BodySC(float Px) { return Font(TEXT("IMFellDWPicaSC-Regular.ttf"), Px, 16.f); }

	FString ArmsName(PlayerColor C, Sigil S)
	{
		static const TCHAR* Colors[] = {TEXT("crimson"), TEXT("frost"), TEXT("bone"), TEXT("violet")};
		static const TCHAR* Sigils[] = {TEXT("skull"), TEXT("moon"), TEXT("eye"), TEXT("thorn")};
		return FString::Printf(TEXT("arms/%s-%s"), Colors[static_cast<int>(C)], Sigils[static_cast<int>(S)]);
	}

	FString PlayerBannerName(PlayerColor C)
	{
		static const TCHAR* Colors[] = {TEXT("crimson"), TEXT("frost"), TEXT("bone"), TEXT("violet")};
		return FString::Printf(TEXT("banners/player-%s"), Colors[static_cast<int>(C)]);
	}

	FString CardName(Resource R)
	{
		static const TCHAR* Names[] = {TEXT("wood"), TEXT("clay"), TEXT("wool"), TEXT("grain"), TEXT("ore")};
		return FString::Printf(TEXT("cards/%s"), Names[static_cast<int>(R)]);
	}

	FString OmenCardName(OmenType O)
	{
		static const TCHAR* Names[] = {TEXT("warden"), TEXT("relic"), TEXT("decree"), TEXT("harvest"), TEXT("tithe"), TEXT("manup")};
		return FString::Printf(TEXT("cards/%s"), Names[static_cast<int>(O)]);
	}
}
