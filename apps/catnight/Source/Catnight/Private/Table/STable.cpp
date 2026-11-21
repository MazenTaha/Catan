#include "Table/STable.h"

#include "CatnightRules/Rules.h"
#include "Fonts/FontMeasure.h"
#include "Framework/Application/SlateApplication.h"
#include "Lexicon.h"
#include "Rendering/DrawElements.h"
#include "Rendering/SlateRenderer.h"
#include "Ui/CatnightUi.h"
#include "Ui/HallKit.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/SNullWidget.h"

using namespace catnight;
using namespace CatnightUi;

namespace
{
	FLinearColor TerrainTint(Terrain T)
	{
		switch (T)
		{
		case Terrain::Witchwood: return Srgb(58, 112, 52);
		case Terrain::Ashen: return Srgb(186, 96, 58);
		case Terrain::Moors: return Srgb(142, 192, 86);
		case Terrain::Fields: return Srgb(230, 190, 76);
		case Terrain::Peaks: return Srgb(132, 138, 146);
		case Terrain::Waste: return Srgb(218, 194, 140);
		}
		return FLinearColor::Gray;
	}

	const FLinearColor Sea = Srgb(34, 86, 112);

	void Fill(FSlateWindowElementList& Out, int32 Layer, const FGeometry& G, const TArray<FVector2f>& Poly, const FLinearColor& Color)
	{
		const FSlateRenderTransform& RT = G.GetAccumulatedRenderTransform();
		const FColor C = Color.ToFColor(true);
		FVector2f Mid(0, 0);
		for (const FVector2f& P : Poly) Mid += P;
		Mid /= static_cast<float>(Poly.Num());
		TArray<FSlateVertex> Verts;
		TArray<SlateIndex> Index;
		Verts.Add(FSlateVertex::Make(RT, Mid, FVector2f(0.5f, 0.5f), C));
		for (const FVector2f& P : Poly) Verts.Add(FSlateVertex::Make(RT, P, FVector2f(0.5f, 0.5f), C));
		for (int32 K = 0; K < Poly.Num(); K++)
		{
			Index.Add(0);
			Index.Add(static_cast<SlateIndex>(1 + K));
			Index.Add(static_cast<SlateIndex>(1 + (K + 1) % Poly.Num()));
		}
		const FSlateResourceHandle Handle = FSlateApplication::Get().GetRenderer()->GetResourceHandle(*WhiteBox());
		FSlateDrawElement::MakeCustomVerts(Out, Layer, Handle, Verts, Index, nullptr, 0, 0);
	}

	TArray<FVector2f> Circle(FVector2f C, float Radius, int32 Segments = 20)
	{
		TArray<FVector2f> P;
		for (int32 I = 0; I < Segments; I++)
		{
			const float A = 2.f * PI * I / Segments;
			P.Add(C + FVector2f(FMath::Cos(A), FMath::Sin(A)) * Radius);
		}
		return P;
	}

	void Outline(FSlateWindowElementList& Out, int32 Layer, const FGeometry& G, TArray<FVector2f> Poly, const FLinearColor& Color, float Thickness)
	{
		const FVector2f First = Poly[0];  // TArray::Add must not take a reference into itself
		Poly.Add(First);
		FSlateDrawElement::MakeLines(Out, Layer, G.ToPaintGeometry(), MoveTemp(Poly), ESlateDrawEffect::None, Color, true, Thickness);
	}

	void Line(FSlateWindowElementList& Out, int32 Layer, const FGeometry& G, FVector2f A, FVector2f B, const FLinearColor& Color, float Thickness)
	{
		FSlateDrawElement::MakeLines(Out, Layer, G.ToPaintGeometry(), TArray<FVector2f>{A, B}, ESlateDrawEffect::None, Color, true, Thickness);
	}

	void Label(FSlateWindowElementList& Out, int32 Layer, const FGeometry& G, const FString& Str, FVector2f Center, const FSlateFontInfo& F, const FLinearColor& Color)
	{
		const FVector2f Size = FSlateApplication::Get().GetRenderer()->GetFontMeasureService()->Measure(Str, F);
		FSlateDrawElement::MakeText(Out, Layer, G.ToPaintGeometry(Size, FSlateLayoutTransform(Center - Size * 0.5f)), Str, F, ESlateDrawEffect::None, Color);
	}

	TArray<FVector2f> House(FVector2f V, float S)
	{
		return {V + FVector2f(-S, 0.75f * S), V + FVector2f(-S, -0.25f * S), V + FVector2f(0, -S), V + FVector2f(S, -0.25f * S), V + FVector2f(S, 0.75f * S)};
	}

	TArray<FVector2f> RectPoly(FVector2f Min, FVector2f Max)
	{
		return {Min, FVector2f(Max.X, Min.Y), Max, FVector2f(Min.X, Max.Y)};
	}

	Resource NextResource(Resource R) { return static_cast<Resource>((static_cast<int>(R) + 1) % kResourceCount); }

	PartialCounts Partial(const Counts& C)
	{
		PartialCounts P;
		for (Resource R : kResources)
			if (C[R] > 0) P.Set(R, C[R]);
		return P;
	}

	bool IsAccept(const FKey& K) { return K == EKeys::Enter || K == EKeys::SpaceBar || K == EKeys::Gamepad_FaceButton_Bottom; }
}

// ================================================================== board

void SCatnightBoard::Construct(const FArguments& InArgs)
{
	Match = InArgs._Match;
	View = InArgs._View;
	Targets = &View->Targets;
	OnPick = InArgs._OnPick;
	const Topology& T = GetTopology();
	for (const std::string& Id : T.vertexIds)
	{
		const size_t Comma = Id.find(',');
		VertexLattice.Add(FVector2f(static_cast<float>(std::stoi(Id.substr(0, Comma))), static_cast<float>(std::stoi(Id.substr(Comma + 1)))));
	}
}

SCatnightBoard::FLayout SCatnightBoard::Layout(const FGeometry& G) const
{
	const FVector2f Size = G.GetLocalSize();
	FLayout L;
	L.Center = Size * 0.5f;
	L.R = FMath::Max(8.f, FMath::Min(Size.X / 11.3f, Size.Y / 10.6f));
	return L;
}

FVector2f SCatnightBoard::VertexPos(const FLayout& L, int32 V) const
{
	return L.Lattice(VertexLattice[V].X, VertexLattice[V].Y);
}

FVector2f SCatnightBoard::HexPos(const FLayout& L, int32 H) const
{
	const Axial& A = GetTopology().hexes[H];
	return L.Lattice(static_cast<float>(2 * A.q + A.r), static_cast<float>(3 * A.r));
}

FVector2f SCatnightBoard::TargetPos(const FLayout& L, int32 I) const
{
	const Topology& T = GetTopology();
	switch (Targets->Kind)
	{
	case FBoardTargets::EKind::Vertex: return VertexPos(L, I);
	case FBoardTargets::EKind::Edge: return (VertexPos(L, T.edgeVertices[I][0]) + VertexPos(L, T.edgeVertices[I][1])) * 0.5f;
	case FBoardTargets::EKind::Hex: return HexPos(L, I);
	default: return FVector2f::ZeroVector;
	}
}

int32 SCatnightBoard::HitTarget(const FLayout& L, FVector2f Local) const
{
	if (!Targets || Targets->Kind == FBoardTargets::EKind::None) return INDEX_NONE;
	const float Reach = (Targets->Kind == FBoardTargets::EKind::Vertex ? 0.32f : Targets->Kind == FBoardTargets::EKind::Edge ? 0.36f : 0.8f) * L.R;
	int32 Best = INDEX_NONE;
	float BestDist = TNumericLimits<float>::Max();
	for (int32 I : Targets->Legal)
	{
		const float D = FVector2f::Distance(TargetPos(L, I), Local);
		if (D < Reach && D < BestDist)
		{
			BestDist = D;
			Best = I;
		}
	}
	return Best;
}

void SCatnightBoard::CycleFocus(int32 Step)
{
	if (!Targets || Targets->Legal.IsEmpty()) return;
	// Reading order: top to bottom, then left to right (a unit layout is enough to sort).
	FLayout Unit;
	Unit.Center = FVector2f::ZeroVector;
	Unit.R = 1.f;
	TArray<int32> Order = Targets->Legal;
	Order.Sort([&](int32 A, int32 B)
	{
		const FVector2f PA = TargetPos(Unit, A), PB = TargetPos(Unit, B);
		return FMath::Abs(PA.Y - PB.Y) > 0.1f ? PA.Y < PB.Y : PA.X < PB.X;
	});
	const int32 At = Order.Find(Targets->Focus);
	const int32 Next = At == INDEX_NONE ? (Step > 0 ? 0 : Order.Num() - 1) : (At + Step + Order.Num()) % Order.Num();
	Targets->Focus = Order[Next];
	View->Revision++;
	Invalidate(EInvalidateWidgetReason::Paint);
}

int32 SCatnightBoard::OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& MyCullingRect,
	FSlateWindowElementList& Out, int32 LayerId, const FWidgetStyle& InWidgetStyle, bool bParentEnabled) const
{
	if (View->b3D) return LayerId;  // the 3D table shows through; this widget only takes input
	FSlateDrawElement::MakeBox(Out, LayerId, G.ToPaintGeometry(), WhiteBox(), ESlateDrawEffect::None, Sea);
	if (!Match || !Match->HasGame()) return LayerId + 1;
	const GameState& S = Match->State();
	const Topology& T = GetTopology();
	const FLayout L = Layout(G);
	const float R = L.R;

	// Island backing and hexes.
	for (int32 H = 0; H < static_cast<int32>(S.board.hexes.size()); H++)
	{
		const FVector2f C = HexPos(L, H);
		TArray<FVector2f> Ring, Inner;
		for (int32 V : T.hexVertices[H])
		{
			const FVector2f P = VertexPos(L, V);
			Ring.Add(C + (P - C) * 1.08f);
			Inner.Add(C + (P - C) * 0.95f);
		}
		Fill(Out, LayerId + 1, G, Ring, Srgb(222, 204, 160));
		Fill(Out, LayerId + 2, G, Inner, TerrainTint(S.board.hexes[H].terrain));
		Outline(Out, LayerId + 3, G, Inner, Srgb(40, 36, 30, 120), 1.5f);
	}

	// Harbors.
	const FSlateFontInfo SmallFont = Font(FMath::Max(7.f, 0.17f * R), true);
	for (const Harbor& Hb : S.board.harbors)
	{
		const FVector2f A = VertexPos(L, Hb.vertices[0]);
		const FVector2f B = VertexPos(L, Hb.vertices[1]);
		const FVector2f M = (A + B) * 0.5f;
		const FVector2f Dir = (M - HexPos(L, Hb.hex)).GetSafeNormal();
		const FVector2f P = M + Dir * 0.62f * R;
		Line(Out, LayerId + 3, G, A, P, Srgb(120, 88, 56), 3.f);
		Line(Out, LayerId + 3, G, B, P, Srgb(120, 88, 56), 3.f);
		Fill(Out, LayerId + 4, G, Circle(P, 0.3f * R), Ivory);
		const FString Rate = Hb.kind ? FString::Printf(TEXT("2:1 %s"), *CatnightText::ResourceShort(*Hb.kind)) : FString(TEXT("3:1"));
		Label(Out, LayerId + 5, G, Rate, P, SmallFont, Ink);
	}

	// Number tokens.
	const FSlateFontInfo TokenFont = Font(FMath::Max(8.f, 0.27f * R), true);
	const FSlateFontInfo PipFont = Font(FMath::Max(6.f, 0.12f * R), true);
	for (const HexTile& Hex : S.board.hexes)
	{
		if (!Hex.token) continue;
		const FVector2f C = HexPos(L, Hex.id);
		Fill(Out, LayerId + 4, G, Circle(C, 0.31f * R), Ivory);
		const bool bRed = Hex.token == 6 || Hex.token == 8;
		const FLinearColor NumColor = bRed ? Srgb(176, 30, 30) : Ink;
		Label(Out, LayerId + 5, G, FString::FromInt(Hex.token), C - FVector2f(0, 0.04f * R), TokenFont, NumColor);
		Label(Out, LayerId + 5, G, FString::ChrN(Pips(Hex.token), TEXT('.')), C + FVector2f(0, 0.17f * R), PipFont, NumColor);
	}

	// Roads.
	for (int32 E : S.causeways.order)
	{
		const FVector2f A = VertexPos(L, T.edgeVertices[E][0]);
		const FVector2f B = VertexPos(L, T.edgeVertices[E][1]);
		const FVector2f A2 = A + (B - A) * 0.17f;
		const FVector2f B2 = B - (B - A) * 0.17f;
		Line(Out, LayerId + 6, G, A2, B2, Ink, 0.17f * R + 3.f);
		Line(Out, LayerId + 7, G, A2, B2, PlayerTint(S.players[*S.causeways.at[E]].color), 0.17f * R);
	}

	// Buildings.
	for (int32 V : S.buildings.order)
	{
		const Building& Bd = *S.buildings.at[V];
		const FVector2f P = VertexPos(L, V);
		const FLinearColor Tint = PlayerTint(S.players[Bd.owner].color);
		if (Bd.kind == BuildingKind::Outpost)
		{
			const TArray<FVector2f> Shape = House(P, 0.17f * R);
			Fill(Out, LayerId + 8, G, Shape, Tint);
			Outline(Out, LayerId + 9, G, Shape, Ink, 2.f);
		}
		else
		{
			const float Sz = 0.21f * R;
			const TArray<FVector2f> Body = RectPoly(P + FVector2f(-1.1f * Sz, -0.1f * Sz), P + FVector2f(1.1f * Sz, 0.85f * Sz));
			const TArray<FVector2f> Tower = House(P + FVector2f(-0.45f * Sz, -0.35f * Sz), 0.65f * Sz);
			Fill(Out, LayerId + 8, G, Body, Tint);
			Fill(Out, LayerId + 8, G, Tower, Tint);
			Outline(Out, LayerId + 9, G, Body, Ink, 2.f);
			Outline(Out, LayerId + 9, G, Tower, Ink, 2.f);
		}
	}

	// The robber.
	{
		const FVector2f C = HexPos(L, S.wraithHex);
		const bool bDesert = S.board.hexes[S.wraithHex].token == 0;
		const FVector2f P = bDesert ? C : C + FVector2f(-0.5f * R, 0.1f * R);
		Fill(Out, LayerId + 10, G, Circle(P + FVector2f(0, 0.06f * R), 0.17f * R), Srgb(30, 30, 34));
		Fill(Out, LayerId + 10, G, Circle(P - FVector2f(0, 0.16f * R), 0.1f * R), Srgb(30, 30, 34));
		Outline(Out, LayerId + 11, G, Circle(P + FVector2f(0, 0.06f * R), 0.17f * R), Srgb(200, 200, 200), 1.5f);
	}

	// Legal targets; the one under the mouse or chosen with keys stands out.
	if (Targets && Targets->Kind != FBoardTargets::EKind::None)
	{
		const int32 Hover = HitTarget(L, Mouse);
		for (int32 I : Targets->Legal)
		{
			const bool bHover = I == Hover || I == Targets->Focus;
			const FLinearColor Glow(1.f, 1.f, 1.f, bHover ? 0.95f : 0.45f);
			switch (Targets->Kind)
			{
			case FBoardTargets::EKind::Vertex:
				Fill(Out, LayerId + 12, G, Circle(VertexPos(L, I), (bHover ? 0.17f : 0.12f) * R), Glow);
				Outline(Out, LayerId + 13, G, Circle(VertexPos(L, I), (bHover ? 0.17f : 0.12f) * R), Ink, 1.5f);
				break;
			case FBoardTargets::EKind::Edge:
			{
				const FVector2f A = VertexPos(L, T.edgeVertices[I][0]);
				const FVector2f B = VertexPos(L, T.edgeVertices[I][1]);
				Line(Out, LayerId + 12, G, A + (B - A) * 0.2f, B - (B - A) * 0.2f, Glow, (bHover ? 0.16f : 0.1f) * R);
				break;
			}
			case FBoardTargets::EKind::Hex:
				Outline(Out, LayerId + 12, G, Circle(HexPos(L, I), 0.55f * R, 30), FLinearColor(1.f, 0.85f, 0.2f, bHover ? 1.f : 0.55f), bHover ? 5.f : 3.f);
				break;
			default: break;
			}
		}
		if (Targets->Focus != INDEX_NONE && Targets->Legal.Contains(Targets->Focus))
		{
			Outline(Out, LayerId + 13, G, Circle(TargetPos(L, Targets->Focus), 0.3f * R, 28), Srgb(255, 214, 90), 3.f);
		}
	}
	return LayerId + 14;
}

FReply SCatnightBoard::OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (View->b3D && (MouseEvent.GetEffectingButton() == EKeys::RightMouseButton || MouseEvent.GetEffectingButton() == EKeys::MiddleMouseButton))
	{
		// Turn the table: drag with the right (or middle) button.
		bDragging = true;
		DragFrom = MouseEvent.GetScreenSpacePosition();
		return FReply::Handled().CaptureMouse(SharedThis(this));
	}
	if (MouseEvent.GetEffectingButton() != EKeys::LeftMouseButton || !Targets) return FReply::Unhandled();
	int32 Hit = INDEX_NONE;
	if (View->b3D) Hit = View->PickUnderMouse ? View->PickUnderMouse() : INDEX_NONE;
	else Hit = HitTarget(Layout(MyGeometry), MyGeometry.AbsoluteToLocal(MouseEvent.GetScreenSpacePosition()));
	if (Hit != INDEX_NONE) OnPick.ExecuteIfBound(Targets->Kind, Hit);
	return FReply::Handled();
}

FReply SCatnightBoard::OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (bDragging && (MouseEvent.GetEffectingButton() == EKeys::RightMouseButton || MouseEvent.GetEffectingButton() == EKeys::MiddleMouseButton))
	{
		bDragging = false;
		return FReply::Handled().ReleaseMouseCapture();
	}
	return FReply::Unhandled();
}

FReply SCatnightBoard::OnMouseWheel(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (!View->b3D || !View->MoveCamera) return FReply::Unhandled();
	View->MoveCamera(0.f, 0.f, MouseEvent.GetWheelDelta() > 0 ? 0.88f : 1.12f);
	return FReply::Handled();
}

FReply SCatnightBoard::OnMouseMove(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (View->b3D)
	{
		if (bDragging && View->MoveCamera)
		{
			const FVector2D Delta = MouseEvent.GetScreenSpacePosition() - DragFrom;
			DragFrom = MouseEvent.GetScreenSpacePosition();
			View->MoveCamera(static_cast<float>(Delta.X) * 0.3f, static_cast<float>(-Delta.Y) * 0.2f, 1.f);
			return FReply::Handled();
		}
		const int32 Hover = View->PickUnderMouse ? View->PickUnderMouse() : INDEX_NONE;
		if (Hover != Targets->Hover)
		{
			Targets->Hover = Hover;
			View->Revision++;
		}
		return FReply::Unhandled();
	}
	Mouse = MyGeometry.AbsoluteToLocal(MouseEvent.GetScreenSpacePosition());
	Invalidate(EInvalidateWidgetReason::Paint);
	return FReply::Unhandled();
}

void SCatnightBoard::OnMouseLeave(const FPointerEvent& MouseEvent)
{
	Mouse = FVector2f(-1e6f, -1e6f);
	if (Targets->Hover != INDEX_NONE)
	{
		Targets->Hover = INDEX_NONE;
		View->Revision++;
	}
	Invalidate(EInvalidateWidgetReason::Paint);
}

FReply SCatnightBoard::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	if (!Targets || Targets->Kind == FBoardTargets::EKind::None) return FReply::Unhandled();
	const FKey K = InKeyEvent.GetKey();
	if (K == EKeys::Left || K == EKeys::Gamepad_DPad_Left || K == EKeys::Gamepad_LeftShoulder)
	{
		CycleFocus(-1);
		return FReply::Handled();
	}
	if (K == EKeys::Right || K == EKeys::Gamepad_DPad_Right || K == EKeys::Gamepad_RightShoulder)
	{
		CycleFocus(1);
		return FReply::Handled();
	}
	if (IsAccept(K) && Targets->Legal.Contains(Targets->Focus))
	{
		OnPick.ExecuteIfBound(Targets->Kind, Targets->Focus);
		return FReply::Handled();
	}
	return FReply::Unhandled();
}

// ================================================================== table

void STable::Construct(const FArguments& InArgs)
{
	Match = InArgs._Match;
	OnMainMenu = InArgs._OnMainMenu;
	OnNewGame = InArgs._OnNewGame;
	View = InArgs._View ? InArgs._View : MakeShared<FCatnightBoardView>();
	if (!InArgs._View) View->b3D = false;  // no 3D board behind this table
	Targets = &View->Targets;
	ChangedHandle = Match->OnChanged.AddLambda([this] { bDirty = true; });
	// The island fills the left; its HUD floats over it (see-through, so the board still takes the
	// mouse). The right column is a strip of the hall wall, as wide as the 3D board's camera leaves free.
	ChildSlot
	[
		SNew(SOverlay)
		+ SOverlay::Slot()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)
			[
				SNew(SOverlay)
				+ SOverlay::Slot()
				[
					SAssignNew(Board, SCatnightBoard)
					.Match(Match)
					.View(View)
					.OnPick(FOnBoardPick::CreateSP(this, &STable::OnPick))
				]
				+ SOverlay::Slot()
				[
					SAssignNew(HudSlot, SBox).Visibility(EVisibility::SelfHitTestInvisible)
				]
			]
			+ SHorizontalBox::Slot().AutoWidth()
			[
				SNew(SBox)
				.WidthOverride(420.f)
				[
					SNew(SOverlay)
					+ SOverlay::Slot()[HallKit::StoneWall()]
					+ SOverlay::Slot()
					[
						SNew(SScrollBox)
						+ SScrollBox::Slot().Padding(FMargin(20, 16, 20, 16))
						[
							SAssignNew(PanelSlot, SBox)
						]
					]
				]
			]
		]
		+ SOverlay::Slot()
		[
			SAssignNew(OverlaySlot, SBox)
		]
	];
	Refresh();
}

STable::~STable()
{
	if (Match) Match->OnChanged.Remove(ChangedHandle);
}

void STable::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	if (bDirty)
	{
		bDirty = false;
		Refresh();
	}
}

TSharedPtr<SWidget> STable::FirstFocus() const
{
	if (Primary) return Primary;
	if (Targets->Kind != FBoardTargets::EKind::None) return Board;
	return ConstCastSharedRef<STable>(SharedThis(this));
}

void STable::Refresh()
{
	const bool bBoardFocus = Board && Board->HasKeyboardFocus();
	const bool bHadFocus = HasKeyboardFocus() || (PanelSlot && PanelSlot->HasFocusedDescendants()) || (OverlaySlot && OverlaySlot->HasFocusedDescendants());
	UpdateTargets();
	View->Revision++;
	Primary.Reset();
	if (PanelSlot)
	{
		PanelSlot->SetContent(BuildPanel());
		// Measure the new widgets now, so the frame after a rebuild never shows them unsized.
		PanelSlot->SlatePrepass(FSlateApplication::Get().GetApplicationScale());
	}
	if (HudSlot)
	{
		HudSlot->SetContent(BuildHud());
		HudSlot->SlatePrepass(FSlateApplication::Get().GetApplicationScale());
	}
	bool bOverlay = false;
	if (OverlaySlot)
	{
		const TSharedPtr<SWidget> PanelPrimary = Primary;
		Primary.Reset();
		TSharedRef<SWidget> Over = BuildOverlay();
		bOverlay = Over != SNullWidget::NullWidget;
		if (!bOverlay) Primary = PanelPrimary;
		OverlaySlot->SetContent(Over);
		OverlaySlot->SetVisibility(bOverlay ? EVisibility::Visible : EVisibility::SelfHitTestInvisible);
		// Full-screen decisions (curtain, leave, victory) stand alone: the island's HUD steps back.
		if (HudSlot) HudSlot->SetVisibility(bOverlay ? EVisibility::Collapsed : EVisibility::SelfHitTestInvisible);
	}
	if (Board) Board->Invalidate(EInvalidateWidgetReason::Paint);
	// Keys and gamepads: the focused button was rebuilt, so hand focus to the new main one.
	const bool bKeepBoard = bBoardFocus && Targets->Kind != FBoardTargets::EKind::None && !bOverlay;
	if ((bHadFocus || bBoardFocus) && !bKeepBoard && FSlateApplication::IsInitialized())
	{
		// Only a button shows a focus ring; the board shows its chosen spot itself.
		if (TSharedPtr<SWidget> F = FirstFocus()) FSlateApplication::Get().SetAllUserFocus(F, F == Primary ? EFocusCause::Navigation : EFocusCause::SetDirectly);
	}
}

void STable::UpdateTargets()
{
	const int32 OldFocus = Targets->Focus;
	const FBoardTargets::EKind OldKind = Targets->Kind;
	Targets->Kind = FBoardTargets::EKind::None;
	Targets->Legal.Reset();
	Targets->Focus = INDEX_NONE;
	Targets->Hover = INDEX_NONE;
	if (!Match->HasGame() || !Match->IsHumanToAct() || Match->State().handoff || bLeaving) return;
	const GameState& S = Match->State();
	const int32 P = Me();
	auto Set = [&](FBoardTargets::EKind Kind, const std::vector<int>& List)
	{
		Targets->Kind = Kind;
		for (int I : List) Targets->Legal.Add(I);
	};
	switch (S.phase.kind)
	{
	case PhaseKind::Setup:
		if (S.phase.stepCauseway) Set(FBoardTargets::EKind::Edge, LegalCausewaySpots(S, P));
		else Set(FBoardTargets::EKind::Vertex, LegalOutpostSpots(S, P));
		break;
	case PhaseKind::MoveWraith:
	{
		std::vector<int> Hexes;
		for (const HexTile& H : S.board.hexes)
			if (H.id != S.wraithHex) Hexes.push_back(H.id);
		Set(FBoardTargets::EKind::Hex, Hexes);
		break;
	}
	case PhaseKind::Decree:
		Set(FBoardTargets::EKind::Edge, LegalCausewaySpots(S, P));
		break;
	case PhaseKind::Main:
	{
		const PlayerState& Pl = S.players[P];
		if (Build == EBuild::Road && CanAfford(Pl.hand, CostKey::Causeway) && Pl.supply.causeways > 0)
			Set(FBoardTargets::EKind::Edge, LegalCausewaySpots(S, P));
		if (Build == EBuild::Settlement && CanAfford(Pl.hand, CostKey::Outpost) && Pl.supply.outposts > 0)
			Set(FBoardTargets::EKind::Vertex, LegalOutpostSpots(S, P));
		if (Build == EBuild::City && CanAfford(Pl.hand, CostKey::Citadel) && Pl.supply.citadels > 0)
			Set(FBoardTargets::EKind::Vertex, LegalCitadelSpots(S, P));
		break;
	}
	default: break;
	}
	if (Targets->Kind == OldKind && Targets->Legal.Contains(OldFocus)) Targets->Focus = OldFocus;
}

void STable::OnPick(FBoardTargets::EKind Kind, int32 Index)
{
	const GameState& S = Match->State();
	const Topology& T = GetTopology();
	Action A;
	A.player = Me();
	switch (S.phase.kind)
	{
	case PhaseKind::Setup:
		A.type = S.phase.stepCauseway ? ActionType::PlaceSetupCauseway : ActionType::PlaceSetupOutpost;
		break;
	case PhaseKind::MoveWraith:
		A.type = ActionType::MoveWraith;
		break;
	case PhaseKind::Decree:
		A.type = ActionType::BuildCauseway;
		break;
	case PhaseKind::Main:
		A.type = Build == EBuild::Road ? ActionType::BuildCauseway : Build == EBuild::Settlement ? ActionType::BuildOutpost : ActionType::BuildCitadel;
		Build = EBuild::None;
		break;
	default: return;
	}
	if (Kind == FBoardTargets::EKind::Vertex) A.vertex = T.vertexIds[Index];
	if (Kind == FBoardTargets::EKind::Edge) A.edge = T.edgeIds[Index];
	if (Kind == FBoardTargets::EKind::Hex) A.hex = Index;
	Do(A);
}

FReply STable::Do(const Action& A)
{
	Match->Apply(A);
	bDirty = true;
	return FReply::Handled();
}

FReply STable::Redraw()
{
	bDirty = true;
	return FReply::Handled();
}

FReply STable::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	const FKey K = InKeyEvent.GetKey();
	if (!Match->HasGame()) return FReply::Unhandled();
	if (K == EKeys::Escape || K == EKeys::Gamepad_Special_Right)
	{
		if (Build != EBuild::None || bChoosingPlenty || bChoosingMonopoly || bCountering)
		{
			Build = EBuild::None;
			bChoosingPlenty = bChoosingMonopoly = bCountering = false;
		}
		else
		{
			bLeaving = !bLeaving;
		}
		return Redraw();
	}
	if (K == EKeys::Z && InKeyEvent.IsControlDown())
	{
		Match->Undo();
		return Redraw();
	}
	// Shoulders reach the board from anywhere when there is something to place.
	const bool bNext = K == EKeys::Gamepad_RightShoulder || K == EKeys::Right;
	const bool bPrev = K == EKeys::Gamepad_LeftShoulder || K == EKeys::Left;
	if ((bNext || bPrev) && Targets->Kind != FBoardTargets::EKind::None && Board)
	{
		Board->CycleFocus(bNext ? 1 : -1);
		return FReply::Handled().SetUserFocus(Board.ToSharedRef(), EFocusCause::Navigation);
	}
	// Space rolls or ends the turn, as on the web board.
	if (K == EKeys::SpaceBar && Match->IsHumanToAct() && !Match->NeedsHandoff() && !bLeaving)
	{
		const GameState& S = Match->State();
		if (S.phase.kind == PhaseKind::Roll && S.currentPlayer == Me()) return Do(Action::Make(ActionType::RollDice, Me()));
		if (S.phase.kind == PhaseKind::Main && S.currentPlayer == Me() && Build == EBuild::None) return Do(Action::Make(ActionType::EndTurn, Me()));
	}
	return FReply::Unhandled();
}

FReply STable::OnAnalogValueChanged(const FGeometry& MyGeometry, const FAnalogInputEvent& InAnalogInputEvent)
{
	// The right stick turns and tilts the 3D table.
	const FKey K = InAnalogInputEvent.GetKey();
	const float Value = InAnalogInputEvent.GetAnalogValue();
	if (View->b3D && View->MoveCamera && FMath::Abs(Value) > 0.2f)
	{
		if (K == EKeys::Gamepad_RightX)
		{
			View->MoveCamera(Value * 2.5f, 0.f, 1.f);
			return FReply::Handled();
		}
		if (K == EKeys::Gamepad_RightY)
		{
			View->MoveCamera(0.f, Value * 1.5f, 1.f);
			return FReply::Handled();
		}
	}
	return SCompoundWidget::OnAnalogValueChanged(MyGeometry, InAnalogInputEvent);
}

// The Hall & Chart presentation (panel, HUD, decrees, overlays) is in STableHud.cpp.
