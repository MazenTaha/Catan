#include "Table/STable.h"

#include "CatnightRules/Rules.h"
#include "Fonts/FontMeasure.h"
#include "Framework/Application/SlateApplication.h"
#include "Lexicon.h"
#include "Rendering/DrawElements.h"
#include "Rendering/SlateRenderer.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"

using namespace catnight;

namespace
{
	FLinearColor Srgb(uint8 R, uint8 G, uint8 B, uint8 A = 255) { return FLinearColor(FColor(R, G, B, A)); }

	FLinearColor PlayerTint(PlayerColor C)
	{
		switch (C)
		{
		case PlayerColor::Crimson: return Srgb(196, 48, 43);
		case PlayerColor::Frost: return Srgb(46, 116, 214);
		case PlayerColor::Bone: return Srgb(240, 236, 226);
		case PlayerColor::Violet: return Srgb(236, 128, 32);
		}
		return FLinearColor::White;
	}

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

	const FLinearColor Ink = Srgb(26, 24, 22);
	const FLinearColor Ivory = Srgb(246, 238, 216);
	const FLinearColor Sea = Srgb(34, 86, 112);
	const FLinearColor PanelBg = Srgb(24, 26, 28);
	const FLinearColor Muted = Srgb(170, 172, 168);

	FSlateFontInfo Font(float Size, bool bBold = false)
	{
		return FCoreStyle::GetDefaultFontStyle(bBold ? TEXT("Bold") : TEXT("Regular"), Size);
	}

	const FSlateBrush* WhiteBox() { return FCoreStyle::Get().GetBrush("GenericWhiteBox"); }

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

	void Label(FSlateWindowElementList& Out, int32 Layer, const FGeometry& G, const FString& Text, FVector2f Center, const FSlateFontInfo& F, const FLinearColor& Color)
	{
		const FVector2f Size = FSlateApplication::Get().GetRenderer()->GetFontMeasureService()->Measure(Text, F);
		FSlateDrawElement::MakeText(Out, Layer, G.ToPaintGeometry(Size, FSlateLayoutTransform(Center - Size * 0.5f)), Text, F, ESlateDrawEffect::None, Color);
	}

	TArray<FVector2f> House(FVector2f V, float S)
	{
		return {V + FVector2f(-S, 0.75f * S), V + FVector2f(-S, -0.25f * S), V + FVector2f(0, -S), V + FVector2f(S, -0.25f * S), V + FVector2f(S, 0.75f * S)};
	}

	TArray<FVector2f> RectPoly(FVector2f Min, FVector2f Max)
	{
		return {Min, FVector2f(Max.X, Min.Y), Max, FVector2f(Min.X, Max.Y)};
	}

	TSharedRef<SWidget> Text(const FString& S, float Size = 11, const FLinearColor& Color = FLinearColor::White, bool bBold = false)
	{
		return SNew(STextBlock).Text(FText::FromString(S)).Font(Font(Size, bBold)).ColorAndOpacity(Color).AutoWrapText(true);
	}

	TSharedRef<SWidget> Button(const FString& Label, TFunction<FReply()> OnClick, bool bEnabled = true, bool bPrimary = false)
	{
		return SNew(SButton)
			.IsEnabled(bEnabled)
			.ContentPadding(FMargin(10, 5))
			.ButtonColorAndOpacity(bPrimary ? Srgb(176, 52, 52) : Srgb(70, 74, 78))
			.OnClicked_Lambda(MoveTemp(OnClick))
			[
				SNew(STextBlock).Text(FText::FromString(Label)).Font(Font(11, bPrimary)).ColorAndOpacity(FLinearColor::White)
			];
	}

	TSharedRef<SWidget> Section(const FString& Title, TSharedRef<SWidget> Body)
	{
		return SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 4)[Text(Title.ToUpper(), 10, Muted, true)]
			+ SVerticalBox::Slot().AutoHeight()[Body];
	}

	Resource NextResource(Resource R) { return static_cast<Resource>((static_cast<int>(R) + 1) % kResourceCount); }
}

// ================================================================== board

void SCatnightBoard::Construct(const FArguments& InArgs)
{
	Match = InArgs._Match;
	Targets = InArgs._Targets;
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

int32 SCatnightBoard::HitTarget(const FLayout& L, FVector2f Local) const
{
	if (!Targets || Targets->Kind == FBoardTargets::EKind::None) return INDEX_NONE;
	const Topology& T = GetTopology();
	int32 Best = INDEX_NONE;
	float BestDist = TNumericLimits<float>::Max();
	for (int32 I : Targets->Legal)
	{
		FVector2f P;
		float Reach = 0.f;
		switch (Targets->Kind)
		{
		case FBoardTargets::EKind::Vertex: P = VertexPos(L, I); Reach = 0.32f * L.R; break;
		case FBoardTargets::EKind::Edge: P = (VertexPos(L, T.edgeVertices[I][0]) + VertexPos(L, T.edgeVertices[I][1])) * 0.5f; Reach = 0.36f * L.R; break;
		case FBoardTargets::EKind::Hex: P = HexPos(L, I); Reach = 0.8f * L.R; break;
		default: break;
		}
		const float D = FVector2f::Distance(P, Local);
		if (D < Reach && D < BestDist)
		{
			BestDist = D;
			Best = I;
		}
	}
	return Best;
}

int32 SCatnightBoard::OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& MyCullingRect,
	FSlateWindowElementList& Out, int32 LayerId, const FWidgetStyle& InWidgetStyle, bool bParentEnabled) const
{
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

	// Legal targets and the one under the mouse.
	if (Targets && Targets->Kind != FBoardTargets::EKind::None)
	{
		const int32 Hover = HitTarget(L, Mouse);
		for (int32 I : Targets->Legal)
		{
			const bool bHover = I == Hover;
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
	}
	return LayerId + 14;
}

FReply SCatnightBoard::OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (MouseEvent.GetEffectingButton() != EKeys::LeftMouseButton || !Targets) return FReply::Unhandled();
	const FVector2f Local = MyGeometry.AbsoluteToLocal(MouseEvent.GetScreenSpacePosition());
	const int32 Hit = HitTarget(Layout(MyGeometry), Local);
	if (Hit != INDEX_NONE) OnPick.ExecuteIfBound(Targets->Kind, Hit);
	return FReply::Handled();
}

FReply SCatnightBoard::OnMouseMove(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	Mouse = MyGeometry.AbsoluteToLocal(MouseEvent.GetScreenSpacePosition());
	Invalidate(EInvalidateWidgetReason::Paint);
	return FReply::Unhandled();
}

void SCatnightBoard::OnMouseLeave(const FPointerEvent& MouseEvent)
{
	Mouse = FVector2f(-1e6f, -1e6f);
	Invalidate(EInvalidateWidgetReason::Paint);
}

// ================================================================== table

void STable::Construct(const FArguments& InArgs)
{
	Match = InArgs._Match;
	Targets = MakeShared<FBoardTargets>();
	ChangedHandle = Match->OnChanged.AddLambda([this] { bDirty = true; });
	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(WhiteBox())
		.BorderBackgroundColor(PanelBg)
		.Padding(0)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)
			[
				SAssignNew(Board, SCatnightBoard)
				.Match(Match)
				.Targets(Targets)
				.OnPick(FOnBoardPick::CreateSP(this, &STable::OnPick))
			]
			+ SHorizontalBox::Slot().AutoWidth()
			[
				SNew(SBox)
				.WidthOverride(400.f)
				[
					SNew(SScrollBox)
					+ SScrollBox::Slot().Padding(16, 12)
					[
						SAssignNew(PanelSlot, SBox)
					]
				]
			]
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

void STable::Refresh()
{
	UpdateTargets();
	if (PanelSlot) PanelSlot->SetContent(BuildPanel());
	if (Board) Board->Invalidate(EInvalidateWidgetReason::Paint);
}

void STable::UpdateTargets()
{
	Targets->Kind = FBoardTargets::EKind::None;
	Targets->Legal.Reset();
	if (!Match->HasGame() || !Match->IsHumanToAct() || Match->State().handoff) return;
	const GameState& S = Match->State();
	const int32 Me = Match->HumanSeat();
	auto Set = [&](FBoardTargets::EKind Kind, const std::vector<int>& List)
	{
		Targets->Kind = Kind;
		for (int I : List) Targets->Legal.Add(I);
	};
	switch (S.phase.kind)
	{
	case PhaseKind::Setup:
		if (S.phase.stepCauseway) Set(FBoardTargets::EKind::Edge, LegalCausewaySpots(S, Me));
		else Set(FBoardTargets::EKind::Vertex, LegalOutpostSpots(S, Me));
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
		Set(FBoardTargets::EKind::Edge, LegalCausewaySpots(S, Me));
		break;
	case PhaseKind::Main:
	{
		const PlayerState& P = S.players[Me];
		if (Build == EBuild::Road && CanAfford(P.hand, CostKey::Causeway) && P.supply.causeways > 0)
			Set(FBoardTargets::EKind::Edge, LegalCausewaySpots(S, Me));
		if (Build == EBuild::Settlement && CanAfford(P.hand, CostKey::Outpost) && P.supply.outposts > 0)
			Set(FBoardTargets::EKind::Vertex, LegalOutpostSpots(S, Me));
		if (Build == EBuild::City && CanAfford(P.hand, CostKey::Citadel) && P.supply.citadels > 0)
			Set(FBoardTargets::EKind::Vertex, LegalCitadelSpots(S, Me));
		break;
	}
	default: break;
	}
}

void STable::OnPick(FBoardTargets::EKind Kind, int32 Index)
{
	const GameState& S = Match->State();
	const Topology& T = GetTopology();
	const int32 Me = Match->HumanSeat();
	Action A;
	A.player = Me;
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

FString STable::Instruction() const
{
	const GameState& S = Match->State();
	if (Match->IsEnded()) return FString::Printf(TEXT("%s wins!"), *CatnightText::Player(S, *S.winner));
	if (!Match->IsHumanToAct()) return FString::Printf(TEXT("%s is playing..."), *CatnightText::Player(S, Match->Actor()));
	switch (S.phase.kind)
	{
	case PhaseKind::Setup: return S.phase.stepCauseway ? TEXT("Place a road next to your new settlement.") : TEXT("Place a settlement on a free corner.");
	case PhaseKind::Roll: return TEXT("Roll the dice.");
	case PhaseKind::Discard: return FString::Printf(TEXT("A 7: discard %d cards."), S.phase.pending[Match->HumanSeat()]);
	case PhaseKind::MoveWraith: return TEXT("Move the robber: click a hex.");
	case PhaseKind::Steal: return TEXT("Choose whom to rob.");
	case PhaseKind::Decree: return FString::Printf(TEXT("Place a free road (%d left)."), S.phase.remaining);
	case PhaseKind::Trade: return TEXT("You have an offer.");
	case PhaseKind::Main: return Build == EBuild::None ? TEXT("Build, trade, or end your turn.") : TEXT("Click a highlighted spot to build.");
	default: return FString();
	}
}

TSharedRef<SWidget> STable::BuildPanel()
{
	if (!Match->HasGame()) return Text(TEXT("No game"));
	const GameState& S = Match->State();
	const FString Round = S.round ? FString::Printf(TEXT("Round %d"), S.round) : FString(TEXT("Founding"));
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()[Text(TEXT("Catnight"), 22, Ivory, true)]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 2, 0, 0)[Text(FString::Printf(TEXT("%s  ·  first to %d points"), *Round, S.config.targetVp), 10, Muted)]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 0)
		[
			SNew(SBorder).BorderImage(WhiteBox()).BorderBackgroundColor(Srgb(48, 44, 36)).Padding(10)
			[
				Text(Instruction(), 13, Ivory, true)
			]
		];
	if (!Match->LastError.IsEmpty())
	{
		Box->AddSlot().AutoHeight().Padding(0, 6, 0, 0)[Text(Match->LastError, 11, Srgb(240, 120, 110))];
	}
	Box->AddSlot().AutoHeight()[ActionsBox()];
	Box->AddSlot().AutoHeight()[HandBox()];
	Box->AddSlot().AutoHeight()[PlayersBox()];
	Box->AddSlot().AutoHeight()[LogBox()];
	return Box;
}

TSharedRef<SWidget> STable::PlayersBox()
{
	const GameState& S = Match->State();
	TSharedRef<SVerticalBox> List = SNew(SVerticalBox);
	for (const PlayerState& P : S.players)
	{
		const bool bMe = P.id == Match->HumanSeat();
		const int32 Vp = VictoryPoints(S, P.id, bMe);
		FString Who = UTF8_TO_TCHAR(P.name.c_str());
		if (P.bot) Who += FString::Printf(TEXT(" (%s bot)"), *CatnightText::BotLevel(*P.bot));
		TArray<FString> Badges;
		if (S.longestHolder && *S.longestHolder == P.id) Badges.Add(TEXT("Longest Road"));
		if (S.hostHolder && *S.hostHolder == P.id) Badges.Add(TEXT("Largest Army"));
		const FString Stats = FString::Printf(TEXT("%d cards  ·  %d dev  ·  %d knights  ·  road %d%s"), HandTotal(P), static_cast<int32>(P.omens.size()),
			P.playedWardens, P.id < static_cast<int32>(S.longestLengths.size()) ? S.longestLengths[P.id] : 0,
			Badges.Num() ? *(TEXT("  ·  ") + FString::Join(Badges, TEXT(", "))) : TEXT(""));
		const bool bTurn = P.id == S.currentPlayer && !Match->IsEnded();
		List->AddSlot().AutoHeight().Padding(0, 3)
		[
			SNew(SBorder).BorderImage(WhiteBox()).BorderBackgroundColor(bTurn ? Srgb(58, 54, 44) : Srgb(34, 36, 38)).Padding(8)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)
				[
					SNew(SBox).WidthOverride(14).HeightOverride(14)
					[
						SNew(SBorder).BorderImage(WhiteBox()).BorderBackgroundColor(PlayerTint(P.color))
					]
				]
				+ SHorizontalBox::Slot().FillWidth(1.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[Text(Who, 12, FLinearColor::White, bTurn)]
					+ SVerticalBox::Slot().AutoHeight()[Text(Stats, 9, Muted)]
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					Text(FString::Printf(TEXT("%d"), Vp), 18, Ivory, true)
				]
			]
		];
	}
	return Section(TEXT("Players"), List);
}

TSharedRef<SWidget> STable::HandBox()
{
	const GameState& S = Match->State();
	const PlayerState& Me = S.players[Match->HumanSeat()];
	TSharedRef<SWrapBox> Cards = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
	for (Resource R : kResources)
	{
		Cards->AddSlot()
		[
			SNew(SBorder).BorderImage(WhiteBox()).BorderBackgroundColor(Srgb(52, 50, 46)).Padding(FMargin(10, 6))
			[
				Text(FString::Printf(TEXT("%s  %d"), *CatnightText::Resource(R), Me.hand[R]), 12, Ivory, Me.hand[R] > 0)
			]
		];
	}
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox) + SVerticalBox::Slot().AutoHeight()[Cards];

	// Development cards, with Play where allowed now.
	const bool bMyTurn = Match->IsHumanToAct() && S.currentPlayer == Match->HumanSeat() &&
		(S.phase.kind == PhaseKind::Roll || S.phase.kind == PhaseKind::Main) && !S.omenPlayedThisTurn;
	for (OmenType O : kOmenTypes)
	{
		int32 Count = 0, Ready = 0;
		for (const OwnedOmen& Own : Me.omens)
		{
			if (Own.type != O) continue;
			Count++;
			if (Own.boughtTurn < S.turn) Ready++;
		}
		if (!Count) continue;
		const bool bPlayable = bMyTurn && Ready > 0 && O != OmenType::Relic && O != OmenType::Manup &&
			(O != OmenType::Decree || (Me.supply.causeways > 0 && !LegalCausewaySpots(S, Me.id).empty()));
		TFunction<FReply()> Play = [this, O]() -> FReply
		{
			const int32 P = Match->HumanSeat();
			switch (O)
			{
			case OmenType::Warden: return Do(Action::Make(ActionType::PlayWarden, P));
			case OmenType::Decree: return Do(Action::Make(ActionType::PlayDecree, P));
			case OmenType::Harvest: bChoosingPlenty = true; PlentyPick.Reset(); bDirty = true; return FReply::Handled();
			case OmenType::Tithe: bChoosingMonopoly = true; bDirty = true; return FReply::Handled();
			default: return FReply::Handled();
			}
		};
		Box->AddSlot().AutoHeight().Padding(0, 6, 0, 0)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[Text(FString::Printf(TEXT("%s x%d"), *CatnightText::Omen(O), Count), 12, Ivory, true)]
				+ SVerticalBox::Slot().AutoHeight()[Text(CatnightText::OmenHelp(O), 9, Muted)]
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[O == OmenType::Relic ? Text(TEXT("")) : Button(TEXT("Play"), Play, bPlayable)]
		];
	}
	return Section(TEXT("Your hand"), Box);
}

TSharedRef<SWidget> STable::ActionsBox()
{
	const GameState& S = Match->State();
	const int32 MeId = Match->HumanSeat();
	const PlayerState& Me = S.players[MeId];
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox);
	auto Row = [&](TSharedRef<SWidget> W) { Box->AddSlot().AutoHeight().Padding(0, 6, 0, 0)[W]; };

	if (Match->IsEnded())
	{
		Row(Button(TEXT("New game"), [this]
		{
			FCatnightMatchSetup Setup;
			Setup.Seed = FString::Printf(TEXT("table-%d"), FMath::Rand());
			Match->Start(Setup);
			return FReply::Handled();
		}, true, true));
		return Box;
	}
	// My own open offer: others are answering, I can withdraw it.
	if (S.phase.kind == PhaseKind::Trade && S.currentPlayer == MeId && S.phase.offer.proposer == MeId && !Match->IsHumanToAct())
	{
		Row(Text(TEXT("Waiting for answers to your offer."), 11, Muted));
		Row(Button(TEXT("Withdraw offer"), [this, MeId] { return Do(Action::Make(ActionType::CancelTrade, MeId)); }));
		return Box;
	}
	if (!Match->IsHumanToAct()) return Box;

	if (bChoosingPlenty)
	{
		const int32 Need = FMath::Min(2, S.bank.Total());
		Row(Text(FString::Printf(TEXT("Year of Plenty: pick %d (%d picked)"), Need, PlentyPick.Num()), 11, Ivory));
		TSharedRef<SWrapBox> Picks = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
		for (Resource R : kResources)
		{
			Picks->AddSlot()[Button(CatnightText::Resource(R), [this, R, Need]
			{
				if (PlentyPick.Num() < Need) PlentyPick.Add(R);
				bDirty = true;
				return FReply::Handled();
			}, S.bank[R] > 0 && PlentyPick.Num() < Need)];
		}
		Row(Picks);
		Row(SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0)[Button(TEXT("Take them"), [this, MeId]
			{
				Action A = Action::Make(ActionType::PlayHarvestPact, MeId);
				for (Resource R : PlentyPick) A.resources.push_back(R);
				bChoosingPlenty = false;
				return Do(A);
			}, PlentyPick.Num() == Need, true)]
			+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("Cancel"), [this] { bChoosingPlenty = false; bDirty = true; return FReply::Handled(); })]);
		return Box;
	}
	if (bChoosingMonopoly)
	{
		Row(Text(TEXT("Monopoly: name a resource."), 11, Ivory));
		TSharedRef<SWrapBox> Picks = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
		for (Resource R : kResources)
		{
			Picks->AddSlot()[Button(CatnightText::Resource(R), [this, R, MeId]
			{
				bChoosingMonopoly = false;
				Action A = Action::Make(ActionType::PlayBloodTithe, MeId);
				A.resource = R;
				return Do(A);
			})];
		}
		Row(Picks);
		Row(Button(TEXT("Cancel"), [this] { bChoosingMonopoly = false; bDirty = true; return FReply::Handled(); }));
		return Box;
	}

	switch (S.phase.kind)
	{
	case PhaseKind::Roll:
		Row(Button(TEXT("Roll the dice"), [this, MeId] { return Do(Action::Make(ActionType::RollDice, MeId)); }, true, true));
		break;
	case PhaseKind::Discard:
	{
		const int32 Owed = S.phase.pending[MeId];
		for (Resource R : kResources)
		{
			DiscardPick[R] = FMath::Clamp(DiscardPick[R], 0, Me.hand[R]);
			Row(SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Text(FString::Printf(TEXT("%s: discard %d of %d"), *CatnightText::Resource(R), DiscardPick[R], Me.hand[R]), 11, Ivory)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(4, 0)[Button(TEXT("-"), [this, R] { DiscardPick[R]--; bDirty = true; return FReply::Handled(); }, DiscardPick[R] > 0)]
				+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("+"), [this, R] { DiscardPick[R]++; bDirty = true; return FReply::Handled(); }, DiscardPick[R] < Me.hand[R] && DiscardPick.Total() < Owed)]);
		}
		Row(Button(FString::Printf(TEXT("Discard %d cards"), Owed), [this, MeId]
		{
			Action A = Action::Make(ActionType::Discard, MeId);
			A.cards = PartialCounts::From(DiscardPick);
			DiscardPick = Counts{};
			return Do(A);
		}, DiscardPick.Total() == Owed, true));
		break;
	}
	case PhaseKind::Steal:
		for (int Victim : S.phase.candidates)
		{
			Row(Button(FString::Printf(TEXT("Rob %s (%d cards)"), *CatnightText::Player(S, Victim), HandTotal(S.players[Victim])), [this, MeId, Victim]
			{
				Action A = Action::Make(ActionType::StealFrom, MeId);
				A.victim = Victim;
				return Do(A);
			}, true, true));
		}
		break;
	case PhaseKind::Trade:
	{
		const TradeOffer& O = S.phase.offer;
		Row(Text(FString::Printf(TEXT("%s gives %s and wants %s."), *CatnightText::Player(S, O.proposer), *CatnightText::Counts(O.give), *CatnightText::Counts(O.want)), 12, Ivory));
		const bool bCan = HasAtLeast(Me.hand, O.want) && HasAtLeast(S.players[O.proposer].hand, O.give);
		Row(SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0)[Button(TEXT("Accept"), [this, MeId]
			{
				Action A = Action::Make(ActionType::RespondTrade, MeId);
				A.response = TradeResponse::Accept;
				return Do(A);
			}, bCan, true)]
			+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("Decline"), [this, MeId]
			{
				Action A = Action::Make(ActionType::RespondTrade, MeId);
				A.response = TradeResponse::Decline;
				return Do(A);
			})]);
		break;
	}
	case PhaseKind::Main:
	{
		auto BuildButton = [&](const FString& Label, EBuild Kind, CostKey Cost, bool bAvailable)
		{
			const bool bOn = Build == Kind;
			return Button(bOn ? Label + TEXT(" (pick a spot)") : Label, [this, Kind]
			{
				Build = Build == Kind ? EBuild::None : Kind;
				bDirty = true;
				return FReply::Handled();
			}, bAvailable && CanAfford(Me.hand, Cost), bOn);
		};
		TSharedRef<SWrapBox> Builds = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
		Builds->AddSlot()[BuildButton(TEXT("Road"), EBuild::Road, CostKey::Causeway, Me.supply.causeways > 0 && !LegalCausewaySpots(S, MeId).empty())];
		Builds->AddSlot()[BuildButton(TEXT("Settlement"), EBuild::Settlement, CostKey::Outpost, Me.supply.outposts > 0 && !LegalOutpostSpots(S, MeId).empty())];
		Builds->AddSlot()[BuildButton(TEXT("City"), EBuild::City, CostKey::Citadel, Me.supply.citadels > 0 && !LegalCitadelSpots(S, MeId).empty())];
		Builds->AddSlot()[Button(TEXT("Buy development card"), [this, MeId] { return Do(Action::Make(ActionType::BuyOmen, MeId)); },
			CanAfford(Me.hand, CostKey::Omen) && !S.omenDeck.empty())];
		Row(Section(TEXT("Build"), Builds));
		Row(Text(TEXT("Road: Lumber + Brick · Settlement: Lumber + Brick + Wool + Grain · City: 2 Grain + 3 Ore · Card: Wool + Grain + Ore"), 9, Muted));

		const int32 Rate = BestBankRate(S, MeId, BankGive);
		TSharedRef<SWrapBox> Bank = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
		Bank->AddSlot()[Button(FString::Printf(TEXT("Give %d %s"), Rate, *CatnightText::Resource(BankGive)), [this] { BankGive = NextResource(BankGive); bDirty = true; return FReply::Handled(); })];
		Bank->AddSlot()[Button(FString::Printf(TEXT("Get 1 %s"), *CatnightText::Resource(BankGet)), [this] { BankGet = NextResource(BankGet); bDirty = true; return FReply::Handled(); })];
		Bank->AddSlot()[Button(TEXT("Trade"), [this, MeId]
		{
			Action A = Action::Make(ActionType::BankTrade, MeId);
			A.giveRes = BankGive;
			A.receiveRes = BankGet;
			return Do(A);
		}, BankGive != BankGet && Me.hand[BankGive] >= Rate && S.bank[BankGet] > 0, true)];
		Row(Section(TEXT("Bank and harbours"), Bank));

		TSharedRef<SWrapBox> Offer = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
		Offer->AddSlot()[Button(FString::Printf(TEXT("Give 1 %s"), *CatnightText::Resource(OfferGive)), [this] { OfferGive = NextResource(OfferGive); bDirty = true; return FReply::Handled(); })];
		Offer->AddSlot()[Button(FString::Printf(TEXT("Want 1 %s"), *CatnightText::Resource(OfferWant)), [this] { OfferWant = NextResource(OfferWant); bDirty = true; return FReply::Handled(); })];
		Offer->AddSlot()[Button(TEXT("Offer to all"), [this, MeId]
		{
			Action A = Action::Make(ActionType::ProposeTrade, MeId);
			A.give.Set(OfferGive, 1);
			A.want.Set(OfferWant, 1);
			return Do(A);
		}, OfferGive != OfferWant && Me.hand[OfferGive] > 0, true)];
		Row(Section(TEXT("Offer the players"), Offer));
		Row(Button(TEXT("End turn"), [this, MeId] { Build = EBuild::None; return Do(Action::Make(ActionType::EndTurn, MeId)); }, true, true));
		break;
	}
	default:
		break;
	}
	return Box;
}

TSharedRef<SWidget> STable::LogBox()
{
	TSharedRef<SVerticalBox> List = SNew(SVerticalBox);
	const TArray<FString>& Log = Match->Log;
	for (int32 I = FMath::Max(0, Log.Num() - 14); I < Log.Num(); I++)
	{
		List->AddSlot().AutoHeight().Padding(0, 1)[Text(Log[I], 10, I == Log.Num() - 1 ? Ivory : Muted)];
	}
	return Section(TEXT("Chronicle"), List);
}
