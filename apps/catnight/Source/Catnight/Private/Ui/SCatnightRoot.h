// The game's screens: title, new game, and the table. Switches between them and keeps
// keyboard/gamepad focus on something useful after every switch.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "CatnightMatch.h"

class SBox;
class STable;

class SCatnightRoot : public SCompoundWidget
{
public:
	enum class EScreen : uint8 { Title, NewGame, Table };

	SLATE_BEGIN_ARGS(SCatnightRoot) {}
		SLATE_ARGUMENT(TSharedPtr<FCatnightMatch>, Match)
		SLATE_ARGUMENT(EScreen, Screen)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

	void Show(EScreen Screen);
	EScreen Current() const { return Screen; }
	/** Where keyboard and gamepad focus should go now. */
	TSharedPtr<SWidget> FocusTarget() const;

private:
	void ApplyShow(EScreen Screen);
	TSharedRef<SWidget> BuildTitle();
	TSharedRef<SWidget> BuildNewGame();
	void FocusLater() { bFocusPending = true; }

	TSharedPtr<FCatnightMatch> Match;
	TSharedPtr<SBox> Content;
	TSharedPtr<STable> Table;
	TSharedPtr<SWidget> Primary;
	EScreen Screen = EScreen::Title;
	TOptional<EScreen> Pending;
	bool bFocusPending = false;
	bool bRebuildNewGame = false;

	FCatnightMatchSetup Draft;
	FString StartError;
	FString TitleError;
};
