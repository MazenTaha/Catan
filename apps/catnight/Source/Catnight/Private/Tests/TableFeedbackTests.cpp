// Drive the real match and board together: effects must finish, reset and preserve rules state.
#include "Board/CatnightBoardActor.h"
#include "Board/TablePresentation.h"
#include "CatnightMatch.h"
#include "CatnightRules/Board.h"
#include "CatnightRules/Bots.h"
#include "CatnightRules/Rules.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/World.h"
#include "Lexicon.h"
#include "Materials/MaterialInstanceDynamic.h"
#if WITH_EDITOR
#include "Materials/Material.h"
#include "Materials/MaterialExpressionSubtract.h"
#include "Materials/MaterialExpressionComponentMask.h"
#endif
#include "Misc/AutomationTest.h"
#include "Table/BoardView.h"

using namespace catnight;

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatnightTableFeedbackTest, "Catnight.Match.TableFeedback",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::ProductFilter)

bool FCatnightTableFeedbackTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    if (!TestNotNull(TEXT("test world"), World)) return false;
    TSharedRef<FCatnightMatch> Match = MakeShared<FCatnightMatch>();
    TSharedRef<FCatnightBoardView> View = MakeShared<FCatnightBoardView>();
    FCatnightMatchSetup Setup;
    Setup.Seed = TEXT("board3d-handoff");
    Setup.Seats = {{TEXT("Ada"), true}, {TEXT("Ben"), true}, {TEXT("Cai"), true}};
    Match->Start(Setup);
    ACatnightBoardActor* Board = World->SpawnActor<ACatnightBoardActor>();
    if (!TestNotNull(TEXT("board actor"), Board)) { World->DestroyWorld(false); return false; }
    Board->Setup(Match, View);
    Board->Tick(0.f);
    if (!TestNotNull(TEXT("imported construction material"), Board->ConstructionBase.Get()))
    {
        World->DestroyWorld(false);
        return false;
    }
#if WITH_EDITOR
    const auto* Clip = Cast<UMaterialExpressionSubtract>(Board->ConstructionBase->GetMaterial()->GetEditorOnlyData()->OpacityMask.Expression);
    const auto* HeightMask = Clip ? Cast<UMaterialExpressionComponentMask>(Clip->B.Expression) : nullptr;
    TestTrue(TEXT("construction shader world-height input is connected"), HeightMask && HeightMask->Input.Expression != nullptr);
#endif
    auto CheckPaint = [&](const FCatnightBuildReveal& Reveal)
    {
        for (int32 I = 0; I < Reveal.RevealMaterials.Num(); I++)
        {
            UTexture* BaseTexture = nullptr;
            Reveal.FinalMaterials[I]->GetTextureParameterValue(FMaterialParameterInfo(TEXT("Base")), BaseTexture);
            TestNotNull(TEXT("original atlas resolves"), BaseTexture);
            TestEqual(TEXT("construction preserves the original atlas"), Reveal.RevealMaterials[I]->K2_GetTextureParameterValue(TEXT("Base")), BaseTexture);
            FLinearColor Paint;
            Reveal.FinalMaterials[I]->GetVectorParameterValue(FMaterialParameterInfo(TEXT("Color")), Paint);
            TestTrue(TEXT("construction preserves owner colour"), Reveal.RevealMaterials[I]->K2_GetVectorParameterValue(TEXT("Color")).Equals(Paint, 0.0001f));
        }
    };
    const Topology& Top = GetTopology();
    auto Act = [&]()
    {
        const auto Next = DecideAction(Match->State());
        return Next && Match->Apply(*Next).IsEmpty();
    };
    auto Ack = [&]()
    {
        if (Match->State().handoff) return Match->Apply(Action::Make(ActionType::AckPassDevice, *Match->State().handoff)).IsEmpty();
        return true;
    };
    auto Place = [&]() -> int32
    {
        const auto Legal = LegalOutpostSpots(Match->State(), Match->Actor());
        if (Legal.empty()) return INDEX_NONE;
        Action A = Action::Make(ActionType::PlaceSetupOutpost, Match->Actor());
        A.vertex = Top.vertexIds[Legal.front()];
        return Match->Apply(A).IsEmpty() ? Legal.front() : INDEX_NONE;
    };

    const FString StartRecord = Match->RecordJson();
    TestFalse(TEXT("illegal roll is refused"), Match->Apply(Action::Make(ActionType::RollDice, Match->Actor())).IsEmpty());
    TestEqual(TEXT("rejection creates no effects"), Board->Builds.Num(), 0);
    TestEqual(TEXT("rejection preserves record"), Match->RecordJson(), StartRecord);
    TestTrue(TEXT("acknowledge initial hand-off"), Ack());
    const int32 Vertex = Place();
    if (!TestTrue(TEXT("place a settlement"), Vertex != INDEX_NONE)) { World->DestroyWorld(false); return false; }
    const FString PlacedRecord = Match->RecordJson();
    Board->Tick(0.f);
    TestEqual(TEXT("one construction"), Board->Builds.Num(), 1);
    if (!Board->Builds.Contains(Vertex)) { World->DestroyWorld(false); return false; }
    TestTrue(TEXT("temporary scaffolding exists"), Board->Builds[Vertex].Scaffold.Num() > 0);
    CheckPaint(Board->Builds[Vertex]);
    const float Started = Board->Builds[Vertex].Started;
    Board->Tick(2.5f);
    const FCatnightBuildReveal& Half = Board->Builds[Vertex];
    const float Height = Half.RevealMaterials[0]->K2_GetScalarParameterValue(TEXT("BuildHeight"));
    TestTrue(TEXT("half-built height is inside original bounds"), Height > Half.Low && Height < Half.High);
    TestTrue(TEXT("road action during construction"), Act());
    Board->Tick(0.5f);
    TestEqual(TEXT("another action does not restart construction"), Board->Builds[Vertex].Started, Started);
    UStaticMeshComponent* House = Board->Builds[Vertex].Mesh;
    int32 Best = Top.vertexHexes[Vertex].front();
    for (int32 H : Top.vertexHexes[Vertex]) if (Pips(Match->State().board.hexes[H].token) > Pips(Match->State().board.hexes[Best].token)) Best = H;
    const FVector Toward = (Board->HexWorld(Best) - Board->VertexWorld(Vertex)).GetSafeNormal2D();
    const FVector DoorFacing = House->GetComponentTransform().TransformVectorNoScale(FVector::RightVector).GetSafeNormal2D();
    TestTrue(TEXT("imported +Y door faces the strongest producing neighbour"), FVector::DotProduct(DoorFacing, Toward) > 0.999f);
    UMaterialInterface* FinishedMaterial = Board->Builds[Vertex].FinalMaterials[0];
    Board->Tick(2.1f);
    TestEqual(TEXT("construction ends after five seconds"), Board->Builds.Num(), 0);
    TestEqual(TEXT("original painted material is restored"), House->GetMaterial(0), FinishedMaterial);
    TestEqual(TEXT("dust expires"), Board->Dust.Num(), 0);

    TestTrue(TEXT("next hand-off"), Ack());
    const FString BeforeUndo = Match->RecordJson();
    TestTrue(TEXT("second settlement"), Place() != INDEX_NONE);
    Board->Tick(1.f);
    TestTrue(TEXT("live construction before undo"), Board->Builds.Num() > 0);
    for (const auto& Pair : Board->Builds) CheckPaint(Pair.Value);
    TestTrue(TEXT("undo while building"), Match->Undo());
    Board->Tick(0.f);
    TestEqual(TEXT("undo removes construction effects"), Board->Builds.Num(), 0);
    TestEqual(TEXT("undo restores record"), Match->RecordJson(), BeforeUndo);
    TestEqual(TEXT("continue replays correctly"), Match->LoadRecord(PlacedRecord), FString());
    Board->Tick(0.f);
    TestEqual(TEXT("historical builds never animate on Continue"), Board->Builds.Num(), 0);

    const FString BeforeDice = Match->RecordJson();
    for (int32 First = 1; First <= 6; First++) for (int32 Second = 1; Second <= 6; Second++)
    {
        TestEqual(TEXT("carved pip count"), CatnightTable::Pips(First).Num(), First);
        Board->SetDice(First, Second, true);
        Board->Tick(1.3f);
        for (int32 I = 0; I < 2; I++)
        {
            const int32 Face = I ? Second : First;
            const FVector Up = Board->DiceRoots[I]->GetRelativeTransform().TransformVectorNoScale(CatnightTable::DiceNormal(Face));
            TestTrue(TEXT("authoritative face lands upwards"), Up.Equals(FVector::UpVector, 0.0001f));
        }
    }
    TestEqual(TEXT("visual dice do not consume rules RNG or actions"), Match->RecordJson(), BeforeDice);

    // Same five-second lifetime across low and high frame rates, including reduced motion mid-build.
    for (int32 Rate : {10, 60, 144})
    {
        View->bReducedMotion = false;
        Match->Start(Setup);
        Board->Tick(0.f);
        Ack();
        Place();
        Board->Tick(0.f);
        for (int32 Frame = 0; Frame < Rate * 4; Frame++) Board->Tick(1.f / Rate);
        TestEqual(TEXT("still building at four seconds"), Board->Builds.Num(), 1);
        for (int32 Frame = 0; Frame < Rate * 2; Frame++) Board->Tick(1.f / Rate);
        TestEqual(TEXT("finished at six seconds"), Board->Builds.Num(), 0);
    }
    Match->Start(Setup);
    Board->Tick(0.f);
    Ack();
    Place();
    Board->Tick(0.3f);
    View->bReducedMotion = true;
    Board->Tick(0.f);
    TestEqual(TEXT("reduce motion finishes active construction"), Board->Builds.Num(), 0);
    TestEqual(TEXT("reduce motion clears dust"), Board->Dust.Num(), 0);
    Board->SetDice(6, 2, true);
    Board->Tick(0.f);
    TestTrue(TEXT("reduced dice are settled immediately"), Board->DiceRoots[0]->GetRelativeRotation().Quaternion().RotateVector(CatnightTable::DiceNormal(6)).Equals(FVector::UpVector, 0.0001f));

    // Use a real roll/event payout, not inferred tile numbers; bank shortages and robber stay authoritative.
    View->bReducedMotion = false;
    Setup.bAutoplay = true;
    Match->Start(Setup);
    Board->Tick(0.f);
    std::vector<GameEvent> Latest;
    const FDelegateHandle Capture = Match->OnActionApplied.AddLambda([&](const Action&, const std::vector<GameEvent>& Events) { Latest = Events; });
    bool bProduced = false;
    for (int32 Step = 0; Step < 400 && !bProduced; Step++)
    {
        if (!Act()) break;
        Board->Tick(0.f);
        for (const GameEvent& E : Latest)
        {
            if (E.Get("type")->AsStr() != "ResourcesProduced") continue;
            TArray<int32> Expected;
            for (const Json& H : E.Get("hexes")->Items()) Expected.Add(static_cast<int32>(H.AsInt()));
            if (Expected.Num() == 0) continue;
            TestTrue(TEXT("production markers exist"), Board->ProductionParts.Num() > 0);
            TestTrue(TEXT("only actual paid hexes are highlighted"), Board->ProductionHexes == Expected);
            const Json* Blocked = E.Get("blockedHex");
            TestEqual(TEXT("blocked marker matches rules event"), Board->ProductionBlocked, Blocked->IsInt() ? static_cast<int32>(Blocked->AsInt()) : INDEX_NONE);
            TestEqual(TEXT("first die uses rules result"), Board->DiceFaces[0], (*Match->State().dice)[0]);
            TestEqual(TEXT("second die uses rules result"), Board->DiceFaces[1], (*Match->State().dice)[1]);
            bProduced = true;
        }
    }
    TestTrue(TEXT("a real production roll was checked"), bProduced);
    Match->OnActionApplied.Remove(Capture);
    Board->GoalYaw = 43.f;
    Board->Tick(0.2f);
    for (UActorComponent* Part : Board->ProductionParts) if (UTextRenderComponent* Mark = Cast<UTextRenderComponent>(Part))
        TestTrue(TEXT("production glyph keeps its meaning while orbiting"), Mark->GetRelativeRotation().Quaternion().Equals(FRotator(90, 180.f + Board->Yaw, 0).Quaternion(), 0.0001f));
    GameState DesertFixture = Match->State();
    for (const HexTile& Tile : DesertFixture.board.hexes) if (Tile.terrain == Terrain::Waste)
    {
        Building City;
        City.owner = 0;
        City.kind = BuildingKind::Citadel;
        DesertFixture.buildings.Put(Top.hexVertices[Tile.id][0], City);
        const FString Note = CatnightText::HexNote(DesertFixture, Tile.id);
        TestFalse(TEXT("desert never claims resource production"), Note.Contains(TEXT("Production claims")));
        TestTrue(TEXT("desert still identifies adjacent owners"), Note.Contains(TEXT("Adjacent owners")));
    }
    Board->Tick(5.f);
    TestEqual(TEXT("production feedback expires"), Board->ProductionParts.Num(), 0);
    TestTrue(TEXT("hex note includes odds"), CatnightText::HexNote(Match->State(), 0).Contains(TEXT("36")) || Match->State().board.hexes[0].token == 0);
    TestTrue(TEXT("invalid hex has no note"), CatnightText::HexNote(Match->State(), -1).IsEmpty());
    AddInfo(TEXT("CATNIGHT TABLE 36 dice pairs, construction at 10/60/144 Hz, undo/Continue, reduced motion and actual production events"));
    World->DestroyWorld(false);
    return !HasAnyErrors();
}
#endif
