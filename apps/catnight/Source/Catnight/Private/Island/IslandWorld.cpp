#include "Island/IslandWorld.h"
#include "CatnightMatch.h"
#include "CatnightRules/Board.h"
#include "CatnightRules/Rules.h"
#include "Components/BoxComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "Ui/CatnightUi.h"
#include "Ui/HallSettings.h"
#include "Misc/Crc.h"

using namespace catnight;
namespace
{
    float SegmentDistance(FVector2D P, FVector2D A, FVector2D B)
    {
        const FVector2D D=B-A;
        return FVector2D::Distance(P,A+D*FMath::Clamp(FVector2D::DotProduct(P-A,D)/FMath::Max(1.,D.SizeSquared()),0.,1.));
    }
    FLinearColor BiomeColor(Terrain T)
    {
        switch(T) {
        case Terrain::Witchwood: return CatnightUi::Srgb(109,151,71);
        case Terrain::Moors: return CatnightUi::Srgb(149,182,82);
        case Terrain::Fields: return CatnightUi::Srgb(178,168,87);
        case Terrain::Ashen: return CatnightUi::Srgb(183,133,91);
        case Terrain::Peaks: return CatnightUi::Srgb(142,153,129);
        default: return CatnightUi::Srgb(221,195,138);
        }
    }
    // Rolling height of each biome's open ground (cm), before mounds; fields stay nearly level.
    float BiomeRelief(Terrain T)
    {
        switch(T) {
        case Terrain::Peaks: return 260.f;
        case Terrain::Ashen: return 210.f;
        case Terrain::Witchwood: return 170.f;
        case Terrain::Moors: return 150.f;
        case Terrain::Fields: return 45.f;
        default: return 200.f;
        }
    }
    // Smooth fractal noise, roughly -1..1. PerlinNoise2D is zero on lattice points, hence the offsets.
    float Fbm(FVector2D P,int32 Octaves)
    {
        float Sum=0,Amp=.5f,Norm=0;
        for(int32 I=0;I<Octaves;I++) {
            Sum+=Amp*FMath::PerlinNoise2D(P+FVector2D(17.31f*I+.37f,9.17f*I+.61f)); Norm+=Amp;
            P*=2.03f; Amp*=.5f;
        }
        return Sum/Norm;
    }
}

ACatnightIsland::ACatnightIsland()
{
    PrimaryActorTick.bCanEverTick=true;
    RootComponent=CreateDefaultSubobject<USceneComponent>(TEXT("IslandRoot"));
    Terrain=CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("WalkableTerrain"));
    Terrain->SetupAttachment(RootComponent);
    Terrain->bUseAsyncCooking=false;
    Terrain->bUseComplexAsSimpleCollision=true;
    Terrain->SetCollisionProfileName(TEXT("BlockAll"));
}
void ACatnightIsland::OnConstruction(const FTransform& Transform)
{
    Super::OnConstruction(Transform);
    if (GetWorld() && !GetWorld()->IsGameWorld()) RebuildIsland();
}
void ACatnightIsland::RebuildIsland()
{
    BoardData=GenerateBoard(TCHAR_TO_UTF8(*PreviewSeed),LayoutMode::Balanced);
    Generate();
}
void ACatnightIsland::Setup(TSharedRef<FCatnightMatch> InMatch)
{
    if (Match) Match->OnChanged.Remove(ChangedHandle);
    Match=InMatch;
    BoardData=Match->State().board;
    Generate(); RefreshBuildings();
    ChangedHandle=Match->OnChanged.AddUObject(this,&ACatnightIsland::RefreshBuildings);
}
void ACatnightIsland::EndPlay(const EEndPlayReason::Type Reason)
{
    if(Match) Match->OnChanged.Remove(ChangedHandle);
    Super::EndPlay(Reason);
}
void ACatnightIsland::ClearParts()
{
    for(const auto& Part:Parts) if(Part) Part->DestroyComponent();
    for(const auto& Part:BuildingParts) if(Part) Part->DestroyComponent();
    Parts.Empty(); BuildingParts.Empty(); RoadSurface=nullptr; Groups.Empty(); Obstacles.Empty();
    Terrain->ClearAllMeshSections(); SceneryInstances=0;
}
void ACatnightIsland::Generate()
{
    TileRadius=FMath::Clamp(TileRadius,6500.f,10000.f);
    ClearParts(); Assets.Empty(); Centers.Empty(); Vertices.Empty(); Trails.Empty(); Piers.Empty();
    for(const auto& H:BoardData.hexes) Centers.Add(FVector2D(-1.5f*TileRadius*H.r,1.7320508f*TileRadius*(H.q+.5f*H.r)));
    for(const auto& ID:GetTopology().vertexIds) {
        const size_t Split=ID.find(',');
        Vertices.Add(FVector2D(-.5f*TileRadius*std::stoi(ID.substr(Split+1)),.8660254f*TileRadius*std::stoi(ID.substr(0,Split))));
    }
    for(int32 H=0;H<Centers.Num();H++) {
        for(int32 N:GetTopology().hexNeighbors[H]) if(N>H) Trails.Add({Centers[H],Centers[N]});
        Trails.Add({Centers[H],Vertices[GetTopology().hexVertices[H][0]]});
    }
    // The shore sits below the field's lowest value on any coastal road corridor, so every
    // corridor stays dry with a beach beyond it (about 7 m at the outermost corners).
    float Lowest=BIG_NUMBER;
    for(int32 E:GetTopology().coastalEdges) {
        const auto& Ends=GetTopology().edgeVertices[E];
        for(int32 I=0;I<=12;I++) Lowest=FMath::Min(Lowest,LandField(FMath::Lerp(Vertices[Ends[0]],Vertices[Ends[1]],I/12.f),nullptr));
    }
    CoastLevel=Lowest*.8f;
    Mounds(); Ground(); Dress(); Lighting();
    UE_LOG(LogTemp,Display,TEXT("ISLAND BUILT: %d tiles, %d scenery instances, %d terrain triangles; radius %.0f cm"),Centers.Num(),SceneryInstances,TerrainTriangles,TileRadius);
}
float ACatnightIsland::LandField(FVector2D P,FVector2D* Gradient) const
{
    // A soft blob round every tile centre: the outline fills the notches between the outer
    // hexagons and rounds their corners, like an island rather than a board.
    const float Sigma2=FMath::Square(TileRadius*.95f);
    float F=0; FVector2D G(0,0);
    for(FVector2D C:Centers) {
        const FVector2D D=P-C;
        const float E=FMath::Exp(-static_cast<float>(D.SizeSquared())/Sigma2);
        F+=E; G+=D*(-2.f*E/Sigma2);
    }
    // Headlands and bays.
    const float Wobble=1.f+.12f*Fbm(P/5200.f,3);
    if(Gradient) *Gradient=G*Wobble;
    return F*Wobble;
}
float ACatnightIsland::CoastDistance(FVector2D P) const
{
    // Signed distance (cm, negative on land) to where the field crosses CoastLevel, to first order.
    FVector2D G; const float F=LandField(P,&G);
    return FMath::Clamp((CoastLevel-F)/FMath::Max(static_cast<float>(G.Size()),1e-9f),-200000.f,200000.f);
}
void ACatnightIsland::Mounds()
{
    Hills.Empty();
    FRandomStream Rand(static_cast<int32>(FCrc::StrCrc32(UTF8_TO_TCHAR(BoardData.seed.c_str())))+7);
    for(int32 H=0;H<Centers.Num();H++) {
        const auto T=BoardData.hexes[H].terrain;
        if(T!=Terrain::Peaks && T!=Terrain::Ashen) continue;
        const auto& Corners=GetTopology().hexVertices[H];
        // Toward each corner, short of the building site; the hub, its trails and the road
        // corridors stay level. Corner 0 has the hub's trail, and hills take every other corner.
        for(int32 K=1;K<6;K++) {
            if(T==Terrain::Ashen && K%2==0) continue;
            const bool Crag=T==Terrain::Peaks;
            // Clay hills vary in size, height and place, so a tile never shows a row of equal cones.
            const FVector2D Dir=(Vertices[Corners[K]]-Centers[H]).GetSafeNormal().GetRotated(static_cast<float>(Rand.FRandRange(Crag?-7.f:-12.f,Crag?7.f:12.f)));
            const float Radius=TileRadius*static_cast<float>(Crag?Rand.FRandRange(.24f,.29f):Rand.FRandRange(.26f,.31f));
            const float Height=static_cast<float>(Crag?Rand.FRandRange(2300.f,3700.f):Rand.FRandRange(400.f,950.f));
            const float Out=Crag?.56f:static_cast<float>(Rand.FRandRange(.55f,.62f));
            Hills.Add({Centers[H]+Dir*TileRadius*Out,Radius,Height,Crag});
        }
    }
}
float ACatnightIsland::TrailDistance(FVector2D P) const
{
    float D=BIG_NUMBER;
    for(const auto& T:Trails) D=FMath::Min(D,SegmentDistance(P,T.Key,T.Value));
    // All legal future roads/building sites remain clear, even before somebody builds them.
    for(const auto& E:GetTopology().edgeVertices) D=FMath::Min(D,SegmentDistance(P,Vertices[E[0]],Vertices[E[1]])+120.f);
    return D;
}
float ACatnightIsland::FootpathDistance(FVector2D P) const
{
    // The worn surface wanders up to 1.7 m inside the 3.2 m level lane, so paths are not ruled lines.
    const FVector2D W=P+FVector2D(FMath::PerlinNoise2D(P/2300.f+FVector2D(.5f,.2f)),FMath::PerlinNoise2D(P/2300.f+FVector2D(4.4f,1.9f)))*170.f;
    float D=BIG_NUMBER;
    for(const auto& T:Trails) D=FMath::Min(D,SegmentDistance(W,T.Key,T.Value));
    return D;
}
float ACatnightIsland::GroundHeight(FVector2D P) const
{
    const float Coast=CoastDistance(P);
    float Relief=0,Sum=0;
    for(int32 I=0;I<Centers.Num();I++) {
        const float W=FMath::Pow(FMath::Max(.001f,1.f-static_cast<float>(FVector2D::Distance(P,Centers[I]))/(TileRadius*1.25f)),4.f);
        Relief+=W*BiomeRelief(BoardData.hexes[I].terrain); Sum+=W;
    }
    float Hill=Relief/Sum*Fbm(P/2600.f,4);
    for(const auto& M:Hills) {
        const float X=static_cast<float>(FVector2D::Distance(P,M.P))/M.Radius;
        if(X>=1.f) continue;
        // Ridged noise breaks a crag's dome into ribs and shoulders; clay hills stay rounded.
        const float Rough=M.bCrag?1.f+.24f*(1.f-2.f*FMath::Abs(FMath::PerlinNoise2D(P/900.f+FVector2D(3.1f,7.7f)))):1.f;
        // Crags rise steeply to a summit; clay hills are broad, rounded swells.
        Hill+=M.Height*(M.bCrag?FMath::Square(1.f-X*X):FMath::SmoothStep(0.f,1.f,1.f-X*X))*Rough;
    }
    // Hub trails and every road corridor stay level for walking, riding and building.
    const float Lane=FMath::SmoothStep(320.f,1500.f,TrailDistance(P));
    const float Land=105.f+Hill*Lane;
    // Past the beach the sea floor keeps falling, so the water deepens from turquoise to blue.
    const float Sea=-380.f-FMath::Clamp((Coast-1300.f)*.45f,0.f,1900.f);
    return FMath::Lerp(Land,Sea,FMath::SmoothStep(-400.f,1300.f,Coast));
}
float ACatnightIsland::Slope(FVector2D P) const
{
    return static_cast<float>(FVector2D(SurfaceHeight(P+FVector2D(100,0))-SurfaceHeight(P-FVector2D(100,0)),
        SurfaceHeight(P+FVector2D(0,100))-SurfaceHeight(P-FVector2D(0,100))).Size())/200.f;
}
float ACatnightIsland::SurfaceHeight(FVector2D P) const
{
    if(SurfaceSamples.Num()!=(SurfaceN+1)*(SurfaceN+1) || SurfaceN<1) return Centers.Num()==19?GroundHeight(P):0.f;
    const float X=FMath::Clamp(static_cast<float>((P.X+SurfaceExtent)/SurfaceStep),0.f,static_cast<float>(SurfaceN));
    const float Y=FMath::Clamp(static_cast<float>((P.Y+SurfaceExtent)/SurfaceStep),0.f,static_cast<float>(SurfaceN));
    const int32 IX=FMath::Min(FMath::FloorToInt(X),SurfaceN-1),IY=FMath::Min(FMath::FloorToInt(Y),SurfaceN-1);
    const float U=X-IX,V=Y-IY;
    const int32 A=IY*(SurfaceN+1)+IX,B=A+1,C=A+SurfaceN+1,D=C+1;
    if(U+V<=1) return SurfaceSamples[A]+(SurfaceSamples[B]-SurfaceSamples[A])*U+(SurfaceSamples[C]-SurfaceSamples[A])*V;
    return SurfaceSamples[D]+(SurfaceSamples[C]-SurfaceSamples[D])*(1-U)+(SurfaceSamples[B]-SurfaceSamples[D])*(1-V);
}
FVector ACatnightIsland::HexPoint(int32 H) const { const FVector2D P=Centers[H]; return GetActorLocation()+FVector(P,SurfaceHeight(P)); }
FVector ACatnightIsland::VertexPoint(int32 V) const { const FVector2D P=Vertices[V]; return GetActorLocation()+FVector(P,SurfaceHeight(P)); }
FVector ACatnightIsland::EntryPoint() const
{
    int32 H=0;
    for(int32 I=0;I<Centers.Num();I++) if(BoardData.hexes[I].terrain==Terrain::Moors) { H=I; break; }
    const FVector2D P=Centers[H]+FVector2D(-900,0);
    return GetActorLocation()+FVector(P,SurfaceHeight(P)+98);
}
bool ACatnightIsland::CanWalk(FVector P) const
{
    const FVector2D Local(P-GetActorLocation());
    if(CoastDistance(Local)<650.f) return true;
    for(const auto& Pier:Piers) if(SegmentDistance(Local,Pier.Key,Pier.Value)<90.f) return true;
    return false;
}
int32 ACatnightIsland::TileAt(FVector P) const
{
    int32 Best=0; double D=DBL_MAX;
    for(int32 I=0;I<Centers.Num();I++) { const double New=FVector2D::DistSquared(FVector2D(P-GetActorLocation()),Centers[I]); if(New<D) {D=New;Best=I;} }
    return Best;
}
FLinearColor ACatnightIsland::GroundColor(FVector2D P,float Height,float Steep) const
{
    FLinearColor Color(0,0,0,1); float Sum=0;
    for(int32 I=0;I<Centers.Num();I++) {
        const float W=FMath::Pow(FMath::Max(.001f,1.f-static_cast<float>(FVector2D::Distance(P,Centers[I]))/(TileRadius*1.25f)),4.f);
        Color+=BiomeColor(BoardData.hexes[I].terrain)*W; Sum+=W;
    }
    Color/=Sum;
    // Broad lush and sun-dried patches, so no tile reads as one flat colour.
    Color*=1.f+.14f*Fbm(P/3400.f+FVector2D(11.f,3.f),3);
    Color=FMath::Lerp(Color,Color*FLinearColor(1.1f,.98f,.74f),FMath::Max(0.f,Fbm(P/2100.f+FVector2D(2.f,8.f),2))*.9f);
    // Steep ground is bare stone; the highest crags keep a little snow.
    Color=FMath::Lerp(Color,CatnightUi::Srgb(124,119,110),FMath::SmoothStep(.5f,1.05f,Steep)*.85f);
    Color=FMath::Lerp(Color,CatnightUi::Srgb(236,238,241),FMath::SmoothStep(2600.f,3200.f,Height)*(1.f-.5f*FMath::SmoothStep(1.2f,1.9f,Steep)));
    // Only the hubs' footpaths are worn; unbuilt road corridors keep their biome colour.
    const float Worn=(1.f-FMath::SmoothStep(60.f,190.f,FootpathDistance(P)))*(.7f+.3f*Fbm(P/650.f,2));
    Color=FMath::Lerp(Color,CatnightUi::Srgb(163,140,102),FMath::Clamp(Worn,0.f,1.f)*.8f);
    const float Coast=CoastDistance(P);
    Color=FMath::Lerp(Color,CatnightUi::Srgb(222,204,158),FMath::SmoothStep(-650.f,150.f,Coast));
    Color=FMath::Lerp(Color,CatnightUi::Srgb(178,160,124),FMath::SmoothStep(250.f,700.f,Coast));
    // The sea floor darkens with depth into the ocean floor's colour, so its edge never shows.
    Color=FMath::Lerp(Color,FLinearColor(.035f,.07f,.08f),1.f-FMath::SmoothStep(-2000.f,-450.f,Height));
    Color.A=1; return Color;
}
void ACatnightIsland::Ground()
{
    // Wide enough for the curving shore and a sloping sea floor all round.
    const float Extent=TileRadius*5.3f;
    // Avoid an extra grid row from compiler rounding at an exact multiple of the nominal step.
    const int32 N=FMath::Max(1,FMath::RoundToInt(Extent*2.f/350.f));
    const float Step=Extent*2.f/N;
    SurfaceN=N; SurfaceExtent=Extent; SurfaceStep=Step; SurfaceSamples.Empty();
    TArray<FVector> V,Normals; TArray<int32> Tri; TArray<FVector2D> UV; TArray<FLinearColor> Colors; TArray<FProcMeshTangent> Tangents;
    for(int32 Y=0;Y<=N;Y++) for(int32 X=0;X<=N;X++) {
        const FVector2D P(-Extent+X*Step,-Extent+Y*Step);
        const float Height=GroundHeight(P);
        const float DX=GroundHeight(P+FVector2D(20,0))-GroundHeight(P-FVector2D(20,0));
        const float DY=GroundHeight(P+FVector2D(0,20))-GroundHeight(P-FVector2D(0,20));
        V.Add(FVector(P,Height)); SurfaceSamples.Add(Height); UV.Add(P/700.f);
        Colors.Add(GroundColor(P,Height,FMath::Sqrt(DX*DX+DY*DY)/40.f));
        Normals.Add(FVector(-DX,-DY,40).GetSafeNormal()); Tangents.Add(FProcMeshTangent(1,0,DX/40.f));
    }
    for(int32 Y=0;Y<N;Y++) for(int32 X=0;X<N;X++) {
        const int32 A=Y*(N+1)+X,B=A+1,C=A+N+1,D=C+1;
        if(CoastDistance(FVector2D(V[A]))>5200.f) continue;
        Tri.Append({A,C,B,B,C,D});
    }
    TerrainTriangles=Tri.Num()/3;
    Terrain->CreateMeshSection_LinearColor(0,V,Tri,Normals,UV,Colors,Tangents,true);
    auto* GroundMat=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Generated/Island/M_Ground"));
    Terrain->SetMaterial(0,GroundMat?GroundMat:LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Generated/Materials/M_VertexColor")));
    auto* Sea=NewObject<UStaticMeshComponent>(this); Sea->SetupAttachment(Terrain);
    Sea->bUseAttachParentBound=true;
    Sea->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,TEXT("/Engine/BasicShapes/Plane.Plane")));
    Sea->SetRelativeLocation(FVector(0,0,-220)); Sea->SetRelativeScale3D(FVector(100000,100000,1));
    // A dark ocean floor under everything, so the translucent sea always has depth behind it and
    // reads deep blue to the horizon instead of showing the empty sky below.
    auto* Floor=NewObject<UStaticMeshComponent>(this); Floor->SetupAttachment(Terrain);
    Floor->bUseAttachParentBound=true;
    Floor->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,TEXT("/Engine/BasicShapes/Plane.Plane")));
    Floor->SetRelativeLocation(FVector(0,0,-2450)); Floor->SetRelativeScale3D(FVector(100000,100000,1));
    auto* Bed=UMaterialInstanceDynamic::Create(LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Generated/Materials/M_Tint")),this);
    Bed->SetVectorParameterValue(TEXT("Color"),FLinearColor(.035f,.07f,.08f)); Bed->SetScalarParameterValue(TEXT("Roughness"),1.f);
    Floor->SetMaterial(0,Bed); Floor->SetCastShadow(false);
    Floor->SetCollisionEnabled(ECollisionEnabled::NoCollision); Floor->RegisterComponent(); Parts.Add(Floor);
    // The island's own sea is translucent: sand shows through the shallows, foam at the shore.
    if(auto* Clear=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Generated/Island/M_IslandSea"))) Sea->SetMaterial(0,Clear);
    else {
        auto* Water=UMaterialInstanceDynamic::Create(LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Generated/Materials/M_Water")),this);
        Water->SetVectorParameterValue(TEXT("Deep"),FLinearColor(.015f,.14f,.22f));
        Water->SetVectorParameterValue(TEXT("Shallow"),FLinearColor(.035f,.24f,.30f));
        Water->SetScalarParameterValue(TEXT("Roughness"),.3f);
        Water->SetScalarParameterValue(TEXT("Specular"),.35f);
        Sea->SetMaterial(0,Water);
    }
    Sea->SetCollisionEnabled(ECollisionEnabled::NoCollision); Sea->RegisterComponent(); Parts.Add(Sea);
}
UStaticMesh* ACatnightIsland::Asset(const FString& Family,const FString& Name)
{
    const FString Key=Family+TEXT("/")+Name;
    if(auto* Cached=Assets.Find(Key)) return *Cached;
    const FString Path=Family==TEXT("island")?FString::Printf(TEXT("/Game/Generated/Island/Meshes/island/StaticMeshes/%s.%s"),*Name,*Name)
        :FString::Printf(TEXT("/Game/Generated/Models/%s/SM_%s.SM_%s"),*Family,*Name,*Name);
    auto* Mesh=LoadObject<UStaticMesh>(nullptr,*Path); Assets.Add(Key,Mesh);
    if(!Mesh) UE_LOG(LogTemp,Error,TEXT("ISLAND missing %s"),*Path);
    return Mesh;
}
UHierarchicalInstancedStaticMeshComponent* ACatnightIsland::Group(const FString& Family,const FString& Name,const FLinearColor* Tint)
{
    const FString Key=Family+TEXT("/")+Name+(Tint?TEXT("#")+Tint->ToFColor(true).ToHex():FString());
    if(auto* Cached=Groups.Find(Key)) return *Cached;
    auto* Mesh=Asset(Family,Name); if(!Mesh) return nullptr;
    auto* Batch=NewObject<UHierarchicalInstancedStaticMeshComponent>(this); Batch->SetupAttachment(RootComponent);
    Batch->SetStaticMesh(Mesh); Batch->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    // Meadow tufts are painted white in Blender and tinted where they grow, as in the web walk.
    if(Tint) for(int32 I=0;I<Mesh->GetStaticMaterials().Num();I++) {
        auto* Mat=UMaterialInstanceDynamic::Create(Mesh->GetMaterial(I),this);
        Mat->SetVectorParameterValue(TEXT("Color"),*Tint); Batch->SetMaterial(I,Mat);
    }
    const bool Small=Family==TEXT("flora") && !Name.Contains(TEXT("Oak")) && !Name.Contains(TEXT("Lime")) && Name!=TEXT("Fir") && Name!=TEXT("Spruce") && Name!=TEXT("Sapling");
    // Crags are the island's skyline: they stay drawn across the whole island.
    const bool Skyline=Family==TEXT("rocks") && Name.StartsWith(TEXT("Crag"));
    // Ground cover is dense, so it stops at 70-120 m; the ground colour carries the distance.
    const bool Crop=Name.StartsWith(TEXT("Wheat"));
    Batch->SetCullDistances(Crop?9000:Small?6500:Skyline?70000:30000,Crop?12000:Small?9000:Skyline?90000:45000);
    Batch->SetCastShadow(!Small); Batch->RegisterComponent(); Parts.Add(Batch); Groups.Add(Key,Batch); return Batch;
}
void ACatnightIsland::Solid(FVector2D P,float Radius,float Height)
{
    auto* C=NewObject<UCapsuleComponent>(this); C->SetupAttachment(RootComponent);
    C->InitCapsuleSize(Radius,FMath::Max(Radius,Height*.5f));
    C->SetVisibility(false);
    C->SetRelativeLocation(FVector(P,SurfaceHeight(P)+Height*.5f)); C->SetCollisionProfileName(TEXT("BlockAll"));
    C->RegisterComponent(); Parts.Add(C); Obstacles.Add({P,Radius});
}
void ACatnightIsland::Prop(const TCHAR* Family,const TCHAR* Name,FVector2D P,float Height,float Yaw,float SolidRadius,const FLinearColor* Tint)
{
    auto* Batch=Group(Family,Name,Tint); if(!Batch) return;
    const FBox Bounds=Batch->GetStaticMesh()->GetBoundingBox();
    const float S=Height/FMath::Max(1.f,static_cast<float>(Bounds.GetSize().Z));
    if (FCString::Strcmp(Family,TEXT("rocks"))==0 && SolidRadius>0) {
        SolidRadius=FMath::Max(SolidRadius,static_cast<float>(FVector2D(Bounds.GetSize()).Size())*S*.5f);
        if(Reserved(P,SolidRadius)) return;
    }
    // On a slope the downhill side of the base would float: sink it by the drop across its footprint.
    const float Sink=FMath::Min(90.f,Slope(P)*static_cast<float>(FVector2D(Bounds.GetSize()).Size())*S*.5f);
    Batch->AddInstance(FTransform(FRotator(0,Yaw,0),FVector(P,SurfaceHeight(P)-Sink-Bounds.Min.Z*S),FVector(S)));
    SceneryInstances++;
    if(SolidRadius>0 && FCString::Strcmp(Name,TEXT("Cottage"))==0) {
        auto* Wall=NewObject<UBoxComponent>(this); Wall->SetupAttachment(RootComponent);
        const FRotator Rotation(0,Yaw,0);
        Wall->SetRelativeLocation(FVector(P,SurfaceHeight(P)-Bounds.Min.Z*S)+Rotation.RotateVector(Bounds.GetCenter()*S));
        Wall->SetRelativeRotation(Rotation); Wall->SetBoxExtent(Bounds.GetSize()*S*.5);
        Wall->SetCollisionProfileName(TEXT("BlockAll")); Wall->RegisterComponent(); Parts.Add(Wall);
        Wall->SetVisibility(false);
        Obstacles.Add({P,static_cast<float>(FVector2D(Bounds.GetSize()).Size())*S*.5f});
    } else if(SolidRadius>0) Solid(P,SolidRadius,Height);
}
void ACatnightIsland::Embed(const TCHAR* Family,const TCHAR* Name,FVector2D P,float Height,float Yaw,float Sink,float SolidRadius)
{
    auto* Batch=Group(Family,Name); if(!Batch) return;
    const FBox Bounds=Batch->GetStaticMesh()->GetBoundingBox();
    const float S=Height/FMath::Max(1.f,static_cast<float>(Bounds.GetSize().Z));
    // On a crag's flank the downhill side drops away: sink by that drop too, so no rock floats.
    Sink+=Slope(P)*static_cast<float>(FVector2D(Bounds.GetSize()).Size())*S*.5f;
    Batch->AddInstance(FTransform(FRotator(0,Yaw,0),FVector(P,SurfaceHeight(P)-Sink-Bounds.Min.Z*S),FVector(S)));
    SceneryInstances++;
    if(SolidRadius>0) Solid(P,SolidRadius,FMath::Max(SolidRadius,Height-Sink));
}
void ACatnightIsland::Flock(FVector2D Centre,int32 Count,FRandomStream& Rand)
{
    for(int32 I=0;I<Count;I++) {
        const FVector2D P=Centre+FVector2D(Rand.FRandRange(-1.f,1.f),Rand.FRandRange(-1.f,1.f))*700.f;
        if(Reserved(P,60.f) || Slope(P)>.35f) continue;
        // Grazing sheep face roughly the same way, as a flock does.
        Prop(TEXT("village"),TEXT("Sheep"),P,Rand.FRandRange(85.f,105.f),40.f+Rand.FRandRange(-50.f,50.f));
    }
}
bool ACatnightIsland::Bare(FVector2D P) const
{
    // Ground cover has no collision, so it may grow anywhere except where it would poke through
    // something: worn footpaths, building sites, the flush road surfaces and the beach.
    if(CoastDistance(P)>-450.f || FootpathDistance(P)<150.f) return true;
    for(FVector2D V:Vertices) if(FVector2D::DistSquared(P,V)<FMath::Square(520.f)) return true;
    for(const auto& E:GetTopology().edgeVertices) if(SegmentDistance(P,Vertices[E[0]],Vertices[E[1]])<130.f) return true;
    return false;
}
void ACatnightIsland::Cover(int32 H)
{
    const auto T=BoardData.hexes[H].terrain;
    const float Density=T==Terrain::Fields?2.f:T==Terrain::Moors?1.3f:T==Terrain::Witchwood?1.f:T==Terrain::Ashen?.7f:T==Terrain::Peaks?.35f:.12f;
    const float Cell=100.f/FMath::Sqrt(Density);
    FRandomStream Rand(static_cast<int32>(FCrc::StrCrc32(UTF8_TO_TCHAR(BoardData.seed.c_str())))+H*7919);
    const FVector2D C=Centers[H];
    // Over the tile's nearest-centre cell, which on the coast includes the land beyond its hexagon.
    const int32 Steps=FMath::CeilToInt(TileRadius*1.5f/Cell);
    for(int32 Y=-Steps;Y<=Steps;Y++) for(int32 X=-Steps;X<=Steps;X++) {
        const FVector2D P=C+FVector2D(X+Rand.FRandRange(-.45f,.45f),Y+Rand.FRandRange(-.45f,.45f))*Cell;
        const double Own=FVector2D::DistSquared(P,C);
        if(Own<FMath::Square(260.) || Own>FMath::Square(TileRadius*1.5)) continue;
        bool Nearest=true;
        for(int32 O=0;O<Centers.Num() && Nearest;O++) Nearest=O==H || FVector2D::DistSquared(P,Centers[O])>=Own;
        if(!Nearest) continue;
        if(Bare(P) || Slope(P)>.85f) continue;
        const float Patch=Fbm(P/1500.f+FVector2D(H*3.7f,1.3f),2);
        const float Yaw=Rand.FRand()*360; const int32 Pick=Rand.RandHelper(12);
        // Two greens per biome (lit and shaded tufts), as the web walk tints its meadow.
        const FLinearColor Grass=CatnightUi::Srgb(
            T==Terrain::Moors?(Pick%2?118:96):T==Terrain::Witchwood?(Pick%2?86:70):T==Terrain::Ashen?(Pick%2?146:126):(Pick%2?120:104),
            T==Terrain::Moors?(Pick%2?168:146):T==Terrain::Witchwood?(Pick%2?134:114):T==Terrain::Ashen?(Pick%2?146:128):(Pick%2?140:124),
            T==Terrain::Moors?(Pick%2?58:52):T==Terrain::Witchwood?(Pick%2?54:48):T==Terrain::Ashen?(Pick%2?72:62):(Pick%2?82:74));
        if(T==Terrain::Fields) {
            Prop(TEXT("flora"),Pick==0?TEXT("WheatA"):TEXT("WheatMid"),P,Rand.FRandRange(110.f,150.f),Yaw);
        } else if(T==Terrain::Waste) {
            if(Pick<6) Prop(TEXT("flora"),TEXT("DryScrub"),P,Rand.FRandRange(35.f,80.f),Yaw);
            else if(Pick<8) Prop(TEXT("props"),TEXT("DesertStones"),P,Rand.FRandRange(18.f,40.f),Yaw);
        } else if(T==Terrain::Moors && Patch>.12f && Pick<6) {
            Prop(TEXT("flora"),Pick<2?TEXT("Buttercup"):Pick<4?TEXT("Daisy"):TEXT("Poppy"),P,Rand.FRandRange(35.f,60.f),Yaw);
        } else if(T==Terrain::Ashen && Patch>.2f && Pick<5) {
            Prop(TEXT("flora"),TEXT("Lavender"),P,Rand.FRandRange(45.f,70.f),Yaw);
        } else if(T==Terrain::Witchwood && Pick==0) {
            Prop(TEXT("flora"),TEXT("ShrubA"),P,Rand.FRandRange(55.f,110.f),Yaw);
        } else {
            Prop(TEXT("flora"),Pick<5?TEXT("GrassA"):TEXT("GrassB"),P,Rand.FRandRange(30.f,70.f),Yaw,0,&Grass);
        }
    }
}
bool ACatnightIsland::Reserved(FVector2D P,float Radius) const
{
    if(CoastDistance(P)>-700.f || TrailDistance(P)<340.f+Radius) return true;
    for(FVector2D V:Vertices) if(FVector2D::Distance(P,V)<900.f+Radius) return true;
    for(FVector2D C:Centers) if(FVector2D::Distance(P,C)<(Radius>30.f?1600.f:450.f)+Radius) return true;
    for(const auto& O:Obstacles) if(FVector2D::Distance(P,O.P)<O.Radius+Radius+100.f) return true;
    return false;
}
void ACatnightIsland::Dress()
{
    FRandomStream Rand(static_cast<int32>(FCrc::StrCrc32(UTF8_TO_TCHAR(BoardData.seed.c_str()))));
    int32 Village=0;
    for(int32 I=0;I<Centers.Num();I++) if(BoardData.hexes[I].terrain==Terrain::Moors) { Village=I; break; }
    const FVector2D Plaza=Centers[Village];
    // Public hamlet landmarks are scenery, distinct from the match's player-owned buildings.
    Prop(TEXT("village"),TEXT("Cottage"),Plaza+FVector2D(-3000,0),650,90,350);
    Prop(TEXT("village"),TEXT("Cottage"),Plaza+FVector2D(-2000,3500),560,160,350);
    Prop(TEXT("village"),TEXT("Cottage"),Plaza+FVector2D(2200,-3500),600,-30,350);
    for(int32 H=0;H<Centers.Num();H++) {
        const FVector2D C=Centers[H]; const auto T=BoardData.hexes[H].terrain;
        // Hubs have a genuinely open lane through their centre; furnishings sit beside it.
        Prop(TEXT("island"),TEXT("Waystone"),C+FVector2D(0,480),210,90);
        const FVector2D Yard=C+FVector2D(2200,2400);
        if(T==Terrain::Fields) { Prop(TEXT("village"),TEXT("Mill"),Yard,1050,0,300); Prop(TEXT("island"),TEXT("Handcart"),C+FVector2D(-2200,2400),160,30,70); }
        else if(T==Terrain::Moors) { Prop(TEXT("village"),TEXT("Barn"),Yard,520,0,230); Prop(TEXT("props"),TEXT("TroughA"),C+FVector2D(-2200,2400),80,90,70); }
        else if(T==Terrain::Witchwood) { Prop(TEXT("props"),TEXT("LogPile"),Yard,200,60,150); Prop(TEXT("props"),TEXT("AxeStump"),C+FVector2D(-2200,2400),95,0,50); }
        else if(T==Terrain::Ashen) { Prop(TEXT("village"),TEXT("Kiln"),Yard,400,0,160); Prop(TEXT("props"),TEXT("BrickStack"),C+FVector2D(-2200,2400),100,20,90); }
        else if(T==Terrain::Peaks) { Prop(TEXT("village"),TEXT("Mine"),Yard,440,0,190); Prop(TEXT("rocks"),TEXT("OreFace"),C+FVector2D(-2200,2400),270,30,150); }
        else { Prop(TEXT("props"),TEXT("Ruin"),Yard,650,60,210); }
        Prop(TEXT("supplies"),TEXT("BarrelA"),C+FVector2D(2200,-2400),100,30,40);
        Prop(TEXT("supplies"),TEXT("StorageCrate"),C+FVector2D(2400,-2200),100,10,60);
        // Large features and thickets here; the grass, flowers and wheat come from Cover().
        const int32 Count=T==Terrain::Fields?400:1900;
        const int32 Large=T==Terrain::Witchwood?240:T==Terrain::Peaks?70:T==Terrain::Ashen?40:T==Terrain::Fields?14:T==Terrain::Waste?22:18;
        for(int32 I=0;I<Count;I++) {
            const float A=Rand.FRand()*2*PI,R=FMath::Sqrt(Rand.FRand())*TileRadius*.89f;
            const FVector2D P=C+FVector2D(FMath::Cos(A),FMath::Sin(A))*R;
            const bool Big=I<Large;
            if(Reserved(P,Big?100.f:20.f)) continue;
            const float Steep=Slope(P);
            // Nothing perches on crag faces; trees need gentler ground than grass.
            if(Steep>(Big?.55f:.8f)) continue;
            const float Yaw=Rand.FRand()*360;
            // Low-frequency noise gathers flowers into meadows and shrubs into thickets.
            const float Patch=Fbm(P/1500.f+FVector2D(H*3.7f,1.3f),2);
            const float Shore=CoastDistance(P);
            if(Shore>-1500.f && T!=Terrain::Waste && T!=Terrain::Peaks && Rand.FRand()<.45f) {
                Prop(TEXT("flora"),TEXT("Reeds"),P,Rand.FRandRange(110,170),Yaw);
            } else if(T==Terrain::Witchwood) {
                const TCHAR* Trees[]={TEXT("Oak"),TEXT("OakB"),TEXT("Lime"),TEXT("Spruce"),TEXT("Fir")};
                if(Big) Prop(TEXT("flora"),Trees[I%5],P,Rand.FRandRange(850,1500),Yaw,45);
                else if(I%23==0) Prop(TEXT("props"),I%2?TEXT("StumpA"):TEXT("StumpB"),P,Rand.FRandRange(50,80),Yaw);
                else if(I%31==0) Prop(TEXT("props"),I%2?TEXT("MushRed"):TEXT("MushBrown"),P,Rand.FRandRange(18,30),Yaw);
                else if(I%11==0) Prop(TEXT("flora"),TEXT("Sapling"),P,Rand.FRandRange(220,380),Yaw);
                else if(Patch>.1f) Prop(TEXT("flora"),I%2?TEXT("ShrubA"):TEXT("ShrubB"),P,Rand.FRandRange(60,130),Yaw);
            } else if(T==Terrain::Peaks) {
                // Boulders on the hub, wind-bent firs up the lower slopes, thin grass between.
                if(Big && Steep<.2f) Prop(TEXT("rocks"),I%3==0?TEXT("BoulderA"):I%3==1?TEXT("BoulderB"):TEXT("BoulderC"),P,Rand.FRandRange(120,260),Yaw,90);
                else if(Big) Prop(TEXT("flora"),I%2?TEXT("Fir"):TEXT("Spruce"),P,Rand.FRandRange(650,1100),Yaw,40);
                else if(I%9==0) Prop(TEXT("rocks"),TEXT("BoulderC"),P,Rand.FRandRange(25,55),Yaw);
                else if(I%2) { const FLinearColor Alpine=CatnightUi::Srgb(120,140,82); Prop(TEXT("flora"),TEXT("GrassB"),P,Rand.FRandRange(30,55),Yaw,0,&Alpine); }
            } else if(T==Terrain::Ashen) {
                if(Big) Prop(TEXT("rocks"),I%2?TEXT("ClayA"):TEXT("ClayB"),P,Rand.FRandRange(200,450),Yaw,130);
                else if(I%4==0) Prop(TEXT("flora"),TEXT("ShrubB"),P,Rand.FRandRange(60,110),Yaw);
            } else if(T==Terrain::Fields) {
                if(Big) Prop(I%2?TEXT("flora"):TEXT("village"),I%2?TEXT("Stook"):TEXT("HayBale"),P,Rand.FRandRange(120,170),Yaw);
                else if(I%9==0) Prop(TEXT("flora"),TEXT("Poppy"),P,Rand.FRandRange(40,60),Yaw);
            } else if(T==Terrain::Waste) {
                if(Big) Prop(TEXT("props"),TEXT("SandRidge"),P,Rand.FRandRange(60,120),Yaw);
                else if(I%3==0) Prop(TEXT("props"),TEXT("DesertStones"),P,Rand.FRandRange(35,70),Yaw);
                else if(I%2) Prop(TEXT("flora"),TEXT("DryScrub"),P,Rand.FRandRange(45,90),Yaw);
            } else {
                if(Big) Prop(TEXT("flora"),TEXT("LimeB"),P,Rand.FRandRange(600,1000),Yaw,40);
                else if(I%9==0) Prop(TEXT("flora"),TEXT("ShrubA"),P,Rand.FRandRange(60,120),Yaw);
            }
        }
        Cover(H);
        if(T==Terrain::Moors) for(int32 F=0;F<3;F++) Flock(C+FVector2D(TileRadius*.42f,0).GetRotated(F*120.f+H*17.f),8,Rand);
    }
    // Each crag mound is crowned with rock: a tall face on top and shoulders down its flanks.
    for(const auto& M:Hills) {
        const float Yaw=FMath::Fmod(M.P.X*.37f+M.P.Y*.11f,360.f);
        if(M.bCrag) {
            Embed(TEXT("rocks"),M.Height>3000.f?TEXT("CragA"):TEXT("CragB"),M.P,M.Height*.55f,Yaw,M.Height*.2f);
            for(int32 K=0;K<3;K++) {
                const FVector2D Q=M.P+FVector2D(M.Radius*.48f,0).GetRotated(Yaw+K*120.f);
                Embed(TEXT("rocks"),K%2?TEXT("CragC"):TEXT("CragB"),Q,M.Height*.3f,Yaw+K*77.f,M.Height*.1f);
            }
        } else {
            const FVector2D Shoulder=M.P+FVector2D(M.Radius*.35f,0).GetRotated(Yaw);
            Embed(TEXT("rocks"),M.Height>700.f?TEXT("ClayA"):TEXT("ClayB"),Shoulder,280.f+M.Height*.2f,Yaw,60.f,M.Radius*.12f);
        }
    }
    // A welcoming hamlet off the central trail, at real cottage/horse scale.
    Prop(TEXT("island"),TEXT("Well"),Plaza+FVector2D(2600,-1800),300,0,100);
    Prop(TEXT("island"),TEXT("MarketStall"),Plaza+FVector2D(-2200,-2400),290,90,150);
    Prop(TEXT("island"),TEXT("LanternPost"),Plaza+FVector2D(-1700,-1700),310);
    Prop(TEXT("island"),TEXT("Flowerbed"),Plaza+FVector2D(450,-450),50);
    for(const auto& Harbor:BoardData.harbors) {
        const auto& Ends=GetTopology().edgeVertices[Harbor.edge];
        const FVector2D Shore=(Vertices[Ends[0]]+Vertices[Ends[1]])*.5;
        const FVector2D Out=(Shore-Centers[Harbor.hex]).GetSafeNormal();
        this->Harbor(Shore,Out);
    }
}
void ACatnightIsland::Harbor(FVector2D Shore,FVector2D Out)
{
    auto* Dock=Group(TEXT("village"),TEXT("Dock"));
    auto* Boat=Group(TEXT("village"),TEXT("Boat"));
    if(!Dock || !Boat) return;
    const FBox Bounds=Dock->GetStaticMesh()->GetBoundingBox();
    const FVector2D LocalDirection=FVector2D(Bounds.GetCenter()).GetSafeNormal();
    const float Yaw=FMath::RadiansToDegrees(FMath::Atan2(Out.Y,Out.X)-FMath::Atan2(LocalDirection.Y,LocalDirection.X));
    const FRotator Rotation(0,Yaw,0); const float Scale=1.35f;
    // The land runs past the tiles' edge by a varying reach: walk out to the actual waterline.
    float Reach=0;
    while(Reach<5000.f && CoastDistance(Shore+Out*Reach)<-150.f) Reach+=25.f;
    Shore+=Out*Reach;
    const FVector2D Start=Shore-Out*150.f;
    const FVector Pivot(Start,SurfaceHeight(Start)+4.f);
    Dock->AddInstance(FTransform(Rotation,Pivot,FVector(Scale))); SceneryInstances++;
    auto* Deck=NewObject<UBoxComponent>(this); Deck->SetupAttachment(RootComponent);
    Deck->SetRelativeLocation(Pivot+Rotation.RotateVector(FVector(Bounds.GetCenter().X*Scale,Bounds.GetCenter().Y*Scale,-16)));
    Deck->SetRelativeRotation(Rotation); Deck->SetBoxExtent(FVector(Bounds.GetSize().X*Scale*.5,Bounds.GetSize().Y*Scale*.5,8));
    Deck->SetCollisionProfileName(TEXT("BlockAll")); Deck->RegisterComponent(); Parts.Add(Deck);
    Deck->SetVisibility(false);
    Piers.Add({Start,Start+Out*static_cast<float>(FVector2D(Bounds.GetSize()).GetMax())*Scale});
    const FBox Hull=Boat->GetStaticMesh()->GetBoundingBox();
    const float BoatScale=750.f/FMath::Max(1.f,static_cast<float>(Hull.GetSize().Z));
    // The Blender boat pivot is its waterline; bounding-box bottoms would sink the hull.
    Boat->AddInstance(FTransform(FRotator(0,Yaw,0),FVector(Shore+Out*1600.f,-220.f),FVector(BoatScale))); SceneryInstances++;
}
void ACatnightIsland::Lighting()
{
    // The editable world uses the same physical exposure as the player camera.
    auto* Exposure=NewObject<UPostProcessComponent>(this); Exposure->SetupAttachment(RootComponent);
    Exposure->bUnbound=true;
    auto& PP=Exposure->Settings;
    PP.bOverride_AutoExposureMethod=true; PP.AutoExposureMethod=EAutoExposureMethod::AEM_Manual;
    PP.bOverride_AutoExposureApplyPhysicalCameraExposure=true; PP.AutoExposureApplyPhysicalCameraExposure=true;
    PP.bOverride_CameraISO=true; PP.CameraISO=100;
    PP.bOverride_CameraShutterSpeed=true; PP.CameraShutterSpeed=125;
    PP.bOverride_DepthOfFieldFstop=true; PP.DepthOfFieldFstop=8;
    PP.bOverride_AutoExposureBias=true; PP.AutoExposureBias=0;
    Exposure->RegisterComponent(); Parts.Add(Exposure);
    auto* Sun=NewObject<UDirectionalLightComponent>(this); Sun->SetupAttachment(RootComponent);
    Sun->SetMobility(EComponentMobility::Movable); Sun->SetRelativeRotation(FRotator(-38,SunYaw,0));
    Sun->SetIntensity(50000); Sun->SetLightColor(FLinearColor(1,.94f,.84f)); Sun->LightSourceAngle=1.5f;
    Sun->SetForwardShadingPriority(1);
    Sun->DynamicShadowDistanceMovableLight=18000; Sun->bAtmosphereSunLight=true; Sun->RegisterComponent(); Parts.Add(Sun);
    auto* Sky=NewObject<USkyLightComponent>(this); Sky->SetupAttachment(RootComponent);
    Sky->SetMobility(EComponentMobility::Movable); Sky->bRealTimeCapture=true; Sky->SetIntensity(1.6f);
    Sky->RegisterComponent(); Parts.Add(Sky);
    // A weak, shadowless sky fill keeps painted characters readable under the forest canopy.
    auto* Fill=NewObject<UDirectionalLightComponent>(this); Fill->SetupAttachment(RootComponent);
    Fill->SetMobility(EComponentMobility::Movable); Fill->SetRelativeRotation(FRotator(-24,SunYaw+180,0));
    Fill->SetIntensity(4500); Fill->SetLightColor(FLinearColor(.65f,.79f,1)); Fill->SetCastShadows(false);
    Fill->RegisterComponent(); Parts.Add(Fill);
    auto* Air=NewObject<USkyAtmosphereComponent>(this); Air->SetupAttachment(RootComponent); Air->RegisterComponent(); Parts.Add(Air);
    auto* Fog=NewObject<UExponentialHeightFogComponent>(this); Fog->SetupAttachment(RootComponent);
    Fog->SetFogDensity(.0045f); Fog->SetFogHeightFalloff(.2f); Fog->SetStartDistance(18000);
    Fog->SetFogInscatteringColor(FLinearColor(.60f,.73f,.84f)); Fog->RegisterComponent(); Parts.Add(Fog);
}
void ACatnightIsland::Line(FVector2D A,FVector2D B,float Width,FLinearColor Color)
{
    if(!RoadSurface) {
        RoadSurface=NewObject<UHierarchicalInstancedStaticMeshComponent>(this); RoadSurface->SetupAttachment(RootComponent);
        RoadSurface->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,TEXT("/Engine/BasicShapes/Cube.Cube")));
        auto* Mat=UMaterialInstanceDynamic::Create(LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Generated/Materials/M_Tint")),this);
        Mat->SetVectorParameterValue(TEXT("Color"),Color); Mat->SetScalarParameterValue(TEXT("Roughness"),.95f);
        RoadSurface->SetMaterial(0,Mat); RoadSurface->SetCollisionEnabled(ECollisionEnabled::NoCollision); RoadSurface->SetCastShadow(false);
        RoadSurface->RegisterComponent(); BuildingParts.Add(RoadSurface);
    }
    const FVector Start(A,SurfaceHeight(A)+.4f),End(B,SurfaceHeight(B)+.4f),D=End-Start;
    RoadSurface->AddInstance(FTransform(D.Rotation(),(Start+End)*.5,FVector(D.Size()/100.f,Width/100.f,.002f)));
}
void ACatnightIsland::RefreshBuildings()
{
    if(!Match || !Match->HasGame()) return;
    // No replay effects: rebuilding the walk shows the current match, never a second action stream.
    for(const auto& P:BuildingParts) if(P) P->DestroyComponent(); BuildingParts.Empty(); RoadSurface=nullptr;
    const auto& State=Match->State();
    for(int32 V:State.buildings.order) {
        const auto& B=*State.buildings.Find(V);
        const bool City=B.kind==BuildingKind::Citadel;
        auto* Model=Asset(TEXT("village"),City?TEXT("Hall"):TEXT("Cottage")); if(!Model) continue;
        const float Height=City?1050.f:650.f;
        const FBox Bounds=Model->GetBoundingBox(); const float Scale=Height/FMath::Max(1.f,static_cast<float>(Bounds.GetSize().Z));
        auto* Mesh=NewObject<UStaticMeshComponent>(this); Mesh->SetupAttachment(RootComponent); Mesh->SetStaticMesh(Model);
        Mesh->SetRelativeLocation(FVector(Vertices[V],SurfaceHeight(Vertices[V])-Bounds.Min.Z*Scale)); Mesh->SetRelativeScale3D(FVector(Scale));
        const FLinearColor OwnerColor=CatnightUi::PlayerTint(State.players[B.owner].color);
        for(int32 I=0;I<Model->GetStaticMaterials().Num();I++) if(Model->GetStaticMaterials()[I].MaterialSlotName.ToString().StartsWith(TEXT("Owner"))) {
            auto* Mat=UMaterialInstanceDynamic::Create(Model->GetMaterial(I),this); Mat->SetVectorParameterValue(TEXT("Color"),OwnerColor); Mesh->SetMaterial(I,Mat);
        }
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision); Mesh->RegisterComponent(); BuildingParts.Add(Mesh);
        // Closed collision shells keep walls and roofs solid until the room/door migration.
        auto* Box=NewObject<UBoxComponent>(this); Box->SetupAttachment(RootComponent);
        Box->SetRelativeLocation(FVector(Vertices[V],SurfaceHeight(Vertices[V]))+Bounds.GetCenter()*Scale-FVector(0,0,Bounds.Min.Z*Scale));
        Box->SetBoxExtent(Bounds.GetSize()*Scale*.5f);
        Box->SetCollisionProfileName(TEXT("BlockAll")); Box->RegisterComponent(); BuildingParts.Add(Box);
        Box->SetVisibility(false);
    }
    for(int32 E:State.causeways.order) {
        const auto& Ends=GetTopology().edgeVertices[E]; const FVector2D A=Vertices[Ends[0]],B=Vertices[Ends[1]];
        // A flush trail surface never creates a new step across the public walking network.
        for(int32 I=0;I<20;I++) Line(FMath::Lerp(A,B,(I+.02f)/20.f),FMath::Lerp(A,B,(I+.98f)/20.f),180,CatnightUi::Srgb(142,112,76));
    }
}
void ACatnightIsland::Tick(float Dt) { Super::Tick(Dt); }
bool ACatnightIsland::ValidateRoutes(FString& Report) const
{
    int32 Checks=0,Failures=0;
    auto Routes=Trails;
    for(const auto& Edge:GetTopology().edgeVertices) Routes.Add({Vertices[Edge[0]],Vertices[Edge[1]]});
    for(const auto& T:Routes) for(int32 I=0;I<=40;I++) {
        const FVector2D P=FMath::Lerp(T.Key,T.Value,I/40.f); Checks++;
        const float H=GroundHeight(P);
        if(CoastDistance(P)>1.f || FMath::Abs(GroundHeight(P+FVector2D(40,0))-H)>30 || FMath::Abs(GroundHeight(P+FVector2D(0,40))-H)>30) Failures++;
        for(const auto& O:Obstacles) if(FVector2D::Distance(P,O.P)<O.Radius+70) {Failures++;break;}
    }
    Report=FString::Printf(TEXT("ISLAND ROUTES: %d samples, %d failures, %d connected tiles"),Checks,Failures,Centers.Num());
    return Checks>0 && Failures==0 && Centers.Num()==19;
}
