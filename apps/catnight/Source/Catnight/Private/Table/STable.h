// The playable table, drawn in Slate from code (phase 2: plain, readable, every action reachable).
// The Hall & Chart look replaces it in phase 4; the match logic stays in FCatnightMatch.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/SLeafWidget.h"
#include "CatnightMatch.h"

/** What a board click places, and where it may go. Owned by STable, read by SCatnightBoard. */
struct FBoardTargets
{
	enum class EKind : uint8 { None, Vertex, Edge, Hex };
	EKind Kind = EKind::None;
	TArray<int32> Legal;
};

DECLARE_DELEGATE_TwoParams(FOnBoardPick, FBoardTargets::EKind, int32);

class SCatnightBoard : public SLeafWidget
{
public:
	SLATE_BEGIN_ARGS(SCatnightBoard) {}
		SLATE_ARGUMENT(TSharedPtr<FCatnightMatch>, Match)
		SLATE_ARGUMENT(TSharedPtr<FBoardTargets>, Targets)
		SLATE_EVENT(FOnBoardPick, OnPick)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual int32 OnPaint(const FPaintArgs& Args, const FGeometry& AllottedGeometry, const FSlateRect& MyCullingRect,
		FSlateWindowElementList& OutDrawElements, int32 LayerId, const FWidgetStyle& InWidgetStyle, bool bParentEnabled) const override;
	virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D(800, 700); }
	virtual FReply OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseMove(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual void OnMouseLeave(const FPointerEvent& MouseEvent) override;

private:
	struct FLayout
	{
		FVector2f Center;
		float R = 1.f;  // hex circumradius in pixels
		FVector2f Lattice(float X, float Y) const { return Center + FVector2f(X * 0.8660254f * R, Y * 0.5f * R); }
	};
	FLayout Layout(const FGeometry& G) const;
	FVector2f VertexPos(const FLayout& L, int32 V) const;
	FVector2f HexPos(const FLayout& L, int32 H) const;
	int32 HitTarget(const FLayout& L, FVector2f Local) const;

	TSharedPtr<FCatnightMatch> Match;
	TSharedPtr<FBoardTargets> Targets;
	FOnBoardPick OnPick;
	TArray<FVector2f> VertexLattice;  // per vertex index, from its id
	FVector2f Mouse = FVector2f(-1e6f, -1e6f);
};

class STable : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(STable) {}
		SLATE_ARGUMENT(TSharedPtr<FCatnightMatch>, Match)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual ~STable() override;
	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	enum class EBuild : uint8 { None, Road, Settlement, City };

	void Refresh();
	void UpdateTargets();
	void OnPick(FBoardTargets::EKind Kind, int32 Index);
	FReply Do(const catnight::Action& A);
	TSharedRef<SWidget> BuildPanel();
	TSharedRef<SWidget> PlayersBox();
	TSharedRef<SWidget> HandBox();
	TSharedRef<SWidget> ActionsBox();
	TSharedRef<SWidget> LogBox();
	FString Instruction() const;

	TSharedPtr<FCatnightMatch> Match;
	TSharedPtr<FBoardTargets> Targets;
	TSharedPtr<class SBox> PanelSlot;
	TSharedPtr<SCatnightBoard> Board;
	FDelegateHandle ChangedHandle;
	/** Set by the match's change event; the panel is rebuilt on the next tick (never inside a click). */
	bool bDirty = true;

	EBuild Build = EBuild::None;
	catnight::Counts DiscardPick;
	TArray<catnight::Resource> PlentyPick;
	bool bChoosingPlenty = false;
	bool bChoosingMonopoly = false;
	catnight::Resource BankGive = catnight::Resource::Wood;
	catnight::Resource BankGet = catnight::Resource::Ore;
	catnight::Resource OfferGive = catnight::Resource::Wood;
	catnight::Resource OfferWant = catnight::Resource::Ore;
};
