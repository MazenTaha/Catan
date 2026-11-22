#include "Table/STable.h"

#include "CatnightRules/Rules.h"
#include "Board/CatnightBoardActor.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Table/SCardFlights.h"
#include "Table/UiDriver.h"
#include "Widgets/Images/SImage.h"
#include "Ui/HallSound.h"
#include "UnrealClient.h"
#include "Widgets/SViewport.h"
#include "Fonts/FontMeasure.h"
#include "Framework/Application/SlateApplication.h"
#include "Lexicon.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
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

TOptional<FVector2D> SCatnightBoard::ScreenOf(FBoardTargets::EKind Kind, int32 Index) const
{
	const Topology& T = GetTopology();
	FVector2f Lattice;
	switch (Kind)
	{
	case FBoardTargets::EKind::Vertex: Lattice = VertexLattice[Index]; break;
	case FBoardTargets::EKind::Edge: Lattice = (VertexLattice[T.edgeVertices[Index][0]] + VertexLattice[T.edgeVertices[Index][1]]) * 0.5f; break;
	case FBoardTargets::EKind::Hex:
	{
		const Axial& A = T.hexes[Index];
		Lattice = FVector2f(static_cast<float>(2 * A.q + A.r), static_cast<float>(3 * A.r));
		break;
	}
	default: return {};
	}
	if (!View->b3D)
	{
		const FGeometry& G = GetCachedGeometry();
		return FVector2D(G.LocalToAbsolute(Layout(G).Lattice(Lattice.X, Lattice.Y)));
	}
	// The 3D table: the same lattice in world space (ACatnightBoardActor::LatticeToWorld, actor at
	// the origin), projected by the player's camera into the game viewport.
	const float R = ACatnightBoardActor::R;
	const FVector World(-Lattice.Y * 0.5f * R, Lattice.X * 0.8660254f * R, 0.f);
	UGameViewportClient* Client = GEngine ? GEngine->GameViewport : nullptr;
	APlayerController* PC = Client && Client->GetWorld() ? Client->GetWorld()->GetFirstPlayerController() : nullptr;
	FVector2D Pixel;
	if (!PC || !Client->Viewport || !UGameplayStatics::ProjectWorldToScreen(PC, World, Pixel, false)) return {};
	const TSharedPtr<SViewport> Widget = Client->GetGameViewportWidget();
	if (!Widget) return {};
	const FGeometry& VG = Widget->GetCachedGeometry();
	const FIntPoint Px = Client->Viewport->GetSizeXY();
	if (Px.X <= 0 || Px.Y <= 0) return {};
	return FVector2D(VG.GetAbsolutePosition()) + Pixel * (FVector2D(VG.GetAbsoluteSize()) / FVector2D(Px));
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
	if (Targets->Kind == FBoardTargets::EKind::Hex) InspectHex(Targets->Focus);
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
		InspectHex(INDEX_NONE);
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
	// 12 % a notch; a trackpad's fractional steps zoom by as much as they scroll.
	View->MoveCamera(0.f, 0.f, FMath::Pow(0.88f, FMath::Clamp(MouseEvent.GetWheelDelta(), -3.f, 3.f)));
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
		InspectHex(View->InspectUnderMouse ? View->InspectUnderMouse() : INDEX_NONE);
		if (Hover != Targets->Hover)
		{
			Targets->Hover = Hover;
			View->Revision++;
		}
		return FReply::Unhandled();
	}
	Mouse = MyGeometry.AbsoluteToLocal(MouseEvent.GetScreenSpacePosition());
	const FLayout L = Layout(MyGeometry);
	int32 Hex = INDEX_NONE;
	if (Match->HasGame()) for (const HexTile& H : Match->State().board.hexes)
	{
		const FVector2f P = Mouse - HexPos(L, H.id);
		if (FMath::Abs(P.X) <= 0.8660254f * L.R && FMath::Abs(P.Y) + FMath::Abs(P.X) / 1.7320508f <= L.R) { Hex = H.id; break; }
	}
	InspectHex(Hex);
	Invalidate(EInvalidateWidgetReason::Paint);
	return FReply::Unhandled();
}

void SCatnightBoard::OnMouseLeave(const FPointerEvent& MouseEvent)
{
	InspectHex(INDEX_NONE);
	Mouse = FVector2f(-1e6f, -1e6f);
	if (Targets->Hover != INDEX_NONE)
	{
		Targets->Hover = INDEX_NONE;
		View->Revision++;
	}
	Invalidate(EInvalidateWidgetReason::Paint);
}

void SCatnightBoard::InspectHex(int32 Hex)
{
	if (View->InspectedHex == Hex) return;
	View->InspectedHex = Hex;
	View->InspectionRevision++;
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
				+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Center).Padding(20)
				[
					SNew(SBox).WidthOverride(300.f).Visibility(EVisibility::HitTestInvisible)
					[
						SAssignNew(InspectionSlot, SBox).Visibility(EVisibility::Collapsed)
					]
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
						SAssignNew(PanelScroll, SScrollBox)
						+ SScrollBox::Slot().Padding(FMargin(20, 16, 20, 16))
						[
							SAssignNew(PanelSlot, SBox)
						]
					]
					// Torchlight on the column (plan §4.4): a warm, flickering pool from a torch above
					// that brass, oak and parchment catch, falling off into shade at the foot.
					+ SOverlay::Slot().VAlign(VAlign_Top).Padding(FMargin(-260, -420, -260, 0))
					[
						SNew(SBox).HeightOverride(1100).Visibility(EVisibility::HitTestInvisible)
						[
							SNew(HallKit::SGlow).Seed(4.2f).Strength(0.2f).Color(FLinearColor(1.f, 0.66f, 0.32f))
						]
					]
					+ SOverlay::Slot().VAlign(VAlign_Bottom)
					[
						SNew(SBox).HeightOverride(320).Visibility(EVisibility::HitTestInvisible)
						[
							SNew(SImage).Image(Hall::Image(TEXT("fx/shade-foot"))).ColorAndOpacity(FLinearColor(1, 1, 1, 0.75f))
						]
					]
				]
			]
		]
		+ SOverlay::Slot()
		[
			SAssignNew(OverlaySlot, SBox)
		]
		+ SOverlay::Slot()
		[
			SAssignNew(Flights, SCardFlights)
		]
	];
	SeenSerial = Match->EventSerial;
	bPadShown = Hall::bGamepad;
	// Screenshot switches (validation/ui): -CatnightTab=build|cards|trade, -CatnightFullLog, -CatnightLeave.
	FString TabName;
	if (FParse::Value(FCommandLine::Get(), TEXT("CatnightTab="), TabName))
	{
		Tab = TabName == TEXT("cards") ? ETab::Cards : TabName == TEXT("trade") ? ETab::Trade : ETab::Build;
	}
	bFullLog = FParse::Param(FCommandLine::Get(), TEXT("CatnightFullLog"));
	bLeaving = FParse::Param(FCommandLine::Get(), TEXT("CatnightLeave"));
	Refresh();
	CatnightUiDriver::AttachIfRequested(SharedThis(this));
}

void STable::Present()
{
	SeenSerial = Match->EventSerial;
	const GameState& S = Match->State();
	const int32 Viewer = Me();
	const bool bHumanViewer = S.players[Viewer].kind == SeatKind::Human;
	HallSound::PlayEvents(Match->LastEvents, Viewer, bHumanViewer);
	// No flights under a curtain or across the victory sheet.
	if (!Flights || Match->NeedsHandoff() || Match->IsEnded()) return;
	const Topology& T = GetTopology();
	for (const GameEvent& E : Match->LastEvents)
	{
		const Json* Type = E.Get("type");
		const Json* Roll = E.Get("roll");
		if (!Type || !Type->IsStr() || Type->AsStr() != "ResourcesProduced" || !Roll || !Roll->IsInt()) continue;
		// Each of the viewer's buildings on a producing tile sends its cards from that tile.
		float Delay = 0.f;
		for (const HexTile& H : S.board.hexes)
		{
			if (H.token != Roll->AsInt() || H.id == S.wraithHex) continue;
			const std::optional<Resource> Res = TerrainResource(H.terrain);
			if (!Res) continue;
			int32 Count = 0;
			for (int32 V : T.hexVertices[H.id])
				if (const std::optional<Building>& B = S.buildings.at[V]; B && B->owner == Viewer) Count += B->kind == BuildingKind::Citadel ? 2 : 1;
			const TSharedPtr<SWidget>& Card = HandCards[static_cast<int32>(*Res)];
			const TOptional<FVector2D> From = Board ? Board->ScreenOf(FBoardTargets::EKind::Hex, H.id) : TOptional<FVector2D>();
			if (!Count || !Card || !From) continue;
			const FGeometry& CG = Card->GetCachedGeometry();
			const FVector2D To = CG.GetAbsolutePosition() + CG.GetAbsoluteSize() * 0.5f;
			for (int32 I = 0; I < Count; I++)
			{
				Flights->Launch(Hall::CardName(*Res), *From + FVector2D(I * 10.f, -I * 6.f), To, Delay + 0.35f);
				Delay += 0.09f;
			}
		}
	}
}

STable::~STable()
{
	if (Match) Match->OnChanged.Remove(ChangedHandle);
}

void STable::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	if (Match->EventSerial != SeenSerial) Present();
	// Held camera input, by time: 120°/s turning, 60°/s tilting, zoom ×2 per second at full press.
	// Keys let go while the window was in the background never send their release: drop them.
	if (!FSlateApplication::Get().IsActive()) KeyTurn = 0;
	if (View->b3D && View->MoveCamera)
	{
		auto Dead = [](float V) { return FMath::Abs(V) < 0.2f ? 0.f : (V - FMath::Sign(V) * 0.2f) / 0.8f; };
		const float Dt = FMath::Min(InDeltaTime, 0.1f);
		const float Turn = Dead(StickTurn) + KeyTurn;
		const float Tilt = Dead(StickTilt);
		const float Zoom = Dead(TriggerOut) - Dead(TriggerIn);
		if (Turn != 0.f || Tilt != 0.f || Zoom != 0.f)
		{
			View->MoveCamera(Turn * 120.f * Dt, Tilt * 60.f * Dt, FMath::Pow(2.f, Zoom * Dt));
		}
	}
	// Prompts and hints follow the device in use.
	if (bPadShown != Hall::bGamepad)
	{
		bPadShown = Hall::bGamepad;
		bDirty = true;
	}
	if (bDirty)
	{
		bDirty = false;
		Refresh();
	}
	if (SeenInspection != View->InspectionRevision) UpdateInspection();
}

void STable::UpdateInspection()
{
	SeenInspection = View->InspectionRevision;
	if (!InspectionSlot || !Match->HasGame()) return;
	const bool bModal = OverlaySlot && OverlaySlot->GetVisibility() == EVisibility::Visible;
	const FString Note = bModal ? FString() : CatnightText::HexNote(Match->State(), View->InspectedHex);
	InspectionSlot->SetContent(Note.IsEmpty() ? SNullWidget::NullWidget : HallKit::Paper(HallKit::Ink(Note, 18), HallKit::EPaper::Vellum, FMargin(16, 12)));
	InspectionSlot->SetVisibility(Note.IsEmpty() ? EVisibility::Collapsed : EVisibility::HitTestInvisible);
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
		// Full-screen decisions (curtain, leave, victory) stand alone: the island's HUD steps back,
		// and no card still in the air crosses them.
		if (HudSlot) HudSlot->SetVisibility(bOverlay ? EVisibility::Collapsed : EVisibility::SelfHitTestInvisible);
		if (bOverlay && Flights) Flights->Clear();
	}
	if (Board) Board->Invalidate(EInvalidateWidgetReason::Paint);
	UpdateInspection();
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
	if (K == EKeys::I || K == EKeys::Gamepad_LeftThumbstick)
	{
		View->InspectedHex = (View->InspectedHex + 1) % static_cast<int32>(Match->State().board.hexes.size());
		View->InspectionRevision++;
		return FReply::Handled();
	}
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
	if ((K == EKeys::Z && InKeyEvent.IsControlDown()) || K == EKeys::Gamepad_FaceButton_Left)
	{
		if (Match->Undo()) HallSound::Play(TEXT("ui-brass"));
		return Redraw();
	}
	// The Herald: View on a pad, L on keys.
	if (K == EKeys::Gamepad_Special_Left || K == EKeys::L)
	{
		bFullLog = !bFullLog;
		HallSound::Play(TEXT("ui-parchment"));
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
	// The 3D table's camera from the keys: Q / E turn it while held; Home or a right-stick click
	// brings back the starting view.
	if (View->b3D && (K == EKeys::Q || K == EKeys::E) && !InKeyEvent.IsControlDown())
	{
		KeyTurn = K == EKeys::Q ? -1 : 1;
		return FReply::Handled();
	}
	if (View->b3D && View->MoveCamera && (K == EKeys::Home || K == EKeys::Gamepad_RightThumbstick))
	{
		View->MoveCamera(0.f, 0.f, 0.f);
		return FReply::Handled();
	}
	// Space (Y on a pad) rolls or ends the turn, as on the web board.
	if ((K == EKeys::SpaceBar || K == EKeys::Gamepad_FaceButton_Top) && Match->IsHumanToAct() && !Match->NeedsHandoff() && !bLeaving)
	{
		const GameState& S = Match->State();
		if (S.phase.kind == PhaseKind::Roll && S.currentPlayer == Me())
		{
			HallSound::Play(TEXT("ui-seal"));
			return Do(Action::Make(ActionType::RollDice, Me()));
		}
		if (S.phase.kind == PhaseKind::Main && S.currentPlayer == Me() && Build == EBuild::None)
		{
			HallSound::Play(TEXT("ui-seal"));
			return Do(Action::Make(ActionType::EndTurn, Me()));
		}
	}
	return FReply::Unhandled();
}

FReply STable::OnAnalogValueChanged(const FGeometry& MyGeometry, const FAnalogInputEvent& InAnalogInputEvent)
{
	// The right stick turns and tilts the 3D table, the triggers zoom (right in, left out). A pad
	// reports an axis only when it changes, so the value is kept and applied every frame by time
	// in Tick: holding the stick still keeps the table turning at a steady speed, at any frame rate.
	const FKey K = InAnalogInputEvent.GetKey();
	const float Value = InAnalogInputEvent.GetAnalogValue();
	if (K == EKeys::Gamepad_RightX) { StickTurn = Value; return FReply::Handled(); }
	if (K == EKeys::Gamepad_RightY) { StickTilt = Value; return FReply::Handled(); }
	if (K == EKeys::Gamepad_RightTriggerAxis) { TriggerIn = Value; return FReply::Handled(); }
	if (K == EKeys::Gamepad_LeftTriggerAxis) { TriggerOut = Value; return FReply::Handled(); }
	return SCompoundWidget::OnAnalogValueChanged(MyGeometry, InAnalogInputEvent);
}

FReply STable::OnKeyUp(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	const FKey K = InKeyEvent.GetKey();
	if ((K == EKeys::Q && KeyTurn < 0) || (K == EKeys::E && KeyTurn > 0))
	{
		KeyTurn = 0;
		return FReply::Handled();
	}
	return FReply::Unhandled();
}

// The Hall & Chart presentation (panel, HUD, decrees, overlays) is in STableHud.cpp.
