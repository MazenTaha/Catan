#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "CatnightMatch.h"
#include "Island/IslandWorld.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Components/StaticMeshComponent.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatnightIslandTest,"Catnight.Island.RoutesAndMatch",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FCatnightIslandTest::RunTest(const FString& Parameters)
{
    UWorld* World=UWorld::CreateWorld(EWorldType::Game,false);
    if(!TestNotNull(TEXT("island world"),World)) return false;
    GEngine->CreateNewWorldContext(EWorldType::Game).SetCurrentWorld(World);
    auto Match=MakeShared<FCatnightMatch>();
    FCatnightMatchSetup Setup; Setup.Seed=TEXT("island-rework");
    TestTrue(TEXT("match starts"),Match->Start(Setup).IsEmpty());
    for(int32 I=0;I<18;I++) if(!Match->StepBot()) break;
    const FString Record=Match->RecordJson();
    auto* Island=World->SpawnActor<ACatnightIsland>(); Island->Setup(Match);
    TestTrue(TEXT("rich instanced scenery"),Island->SceneryInstances>2000);
    TestTrue(TEXT("full collision terrain"),Island->TerrainTriangles>15000);
    FString Report; TestTrue(*Report,Island->ValidateRoutes(Report)); AddInfo(Report);
    TestTrue(TEXT("spawn on dry land"),Island->CanWalk(Island->EntryPoint()));
    TestFalse(TEXT("deep ocean excluded"),Island->CanWalk(FVector(1000000,1000000,0)));
    for(int32 E=0;E<static_cast<int32>(catnight::GetTopology().edgeHexes.size());E++) {
        if(catnight::GetTopology().edgeHexes[E].size()!=2) continue;
        const auto& Ends=catnight::GetTopology().edgeVertices[E];
        const FVector P=(Island->VertexPoint(Ends[0])+Island->VertexPoint(Ends[1]))*.5f;
        TestTrue(TEXT("internal tile joins are not shoreline"),Island->CoastDistance(FVector2D(P-Island->GetActorLocation()))<-500.f);
    }
    FHitResult Hit;
    const FVector Start=Island->EntryPoint();
    TestTrue(TEXT("physical ground supports the player"),World->LineTraceSingleByChannel(Hit,Start+FVector(0,0,500),Start-FVector(0,0,500),ECC_Visibility));
    if(Hit.bBlockingHit) TestTrue(TEXT("spawn floor faces upward"),Hit.ImpactNormal.Z>.8);
    for(int32 H=0;H<19;H++) for(const FVector Offset:{FVector(-700,100,0),FVector(-1200,-900,0)}) {
        const FVector P=Island->HexPoint(H)+Offset;
        FHitResult Floor;
        const bool Supported=World->LineTraceSingleByChannel(Floor,P+FVector(0,0,2000),P-FVector(0,0,2000),ECC_Visibility);
        TestTrue(TEXT("biome prop position has a physical floor"),Supported);
        if(Supported) TestTrue(TEXT("placement height matches the rendered collision triangles"),FMath::Abs(Floor.ImpactPoint.Z-Island->GetActorLocation().Z-Island->SurfaceHeight(FVector2D(P-Island->GetActorLocation())))<1.f);
    }
    TestEqual(TEXT("exploration does not mutate the match"),Match->RecordJson(),Record);
    const int32 Instances=Island->SceneryInstances;
    Island->Setup(Match);
    TestEqual(TEXT("repeat build deterministic"),Island->SceneryInstances,Instances);
    TestTrue(TEXT("routes stay clear after refresh"),Island->ValidateRoutes(Report));
    Island->Destroy();
    TestEqual(TEXT("leaving preserves record"),Match->RecordJson(),Record);
    World->DestroyWorld(false);
    GEngine->DestroyWorldContext(World);
    return !HasAnyErrors();
}
#endif
