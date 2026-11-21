#include "Hero/HeroYard.h"
#include "Components/BoxComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"

ACatnightHeroYard::ACatnightHeroYard()
{
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("YardRoot"));
}

void ACatnightHeroYard::Block(const FVector& Position, const FVector& Size, const FLinearColor& Color, const FRotator& Rotation)
{
	auto* Mesh = NewObject<UStaticMeshComponent>(this);
	Mesh->SetupAttachment(RootComponent);
	Mesh->SetRelativeLocationAndRotation(Position, Rotation);
	Mesh->SetRelativeScale3D(Size / 100.f);
	Mesh->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	auto* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Tint"));
	auto* Mat = UMaterialInstanceDynamic::Create(Base, this);
	Mat->SetVectorParameterValue(TEXT("Color"), Color);
	Mat->SetScalarParameterValue(TEXT("Roughness"), .9f);
	Mesh->SetMaterial(0, Mat); Mesh->RegisterComponent(); Parts.Add(Mesh);
	auto* Box = NewObject<UBoxComponent>(this);
	Box->SetupAttachment(RootComponent); Box->SetRelativeLocationAndRotation(Position, Rotation);
	Box->SetBoxExtent(Size * .5f); Box->SetCollisionProfileName(TEXT("BlockAll"));
	Box->RegisterComponent(); Parts.Add(Box);
}

void ACatnightHeroYard::Model(const TCHAR* Family, const TCHAR* Name, const FVector& Position, float Height, float Yaw)
{
	const FString Path = FString::Printf(TEXT("/Game/Generated/Models/%s/SM_%s.SM_%s"), Family, Name, Name);
	auto* Asset = LoadObject<UStaticMesh>(nullptr, *Path);
	if (!Asset) { UE_LOG(LogTemp, Warning, TEXT("HERO yard prop missing %s"), *Path); return; }
	const FBox Bounds = Asset->GetBoundingBox();
	const float Scale = Height / FMath::Max(1.f, Bounds.GetSize().Z);
	auto* Mesh = NewObject<UStaticMeshComponent>(this); Mesh->SetupAttachment(RootComponent);
	Mesh->SetStaticMesh(Asset); Mesh->SetRelativeScale3D(FVector(Scale));
	Mesh->SetRelativeLocationAndRotation(Position - FVector(0, 0, Bounds.Min.Z * Scale), FRotator(0, Yaw, 0));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision); Mesh->RegisterComponent(); Parts.Add(Mesh);
}

void ACatnightHeroYard::BeginPlay()
{
	Super::BeginPlay();
	const FLinearColor Grass(.16f, .27f, .08f), Stone(.32f, .29f, .22f), Oak(.19f, .105f, .045f);
	Block(FVector(0, 0, -40), FVector(12000, 12000, 80), Grass);
	Block(FVector(1800, 0, 2), FVector(7000, 500, 4), FLinearColor(.29f, .22f, .13f));
	for (int32 Side : {-1, 1})
	{
		Block(FVector(Side * 5900, 0, 120), FVector(100, 12000, 240), Stone);
		Block(FVector(0, Side * 5900, 120), FVector(12000, 100, 240), Stone);
	}
	// A slope, real 20 cm steps, low lintel and a wall: movement/camera checks have physical fixtures.
	Block(FVector(1400, 1000, 120), FVector(900, 500, 70), Stone, FRotator(15, 0, 0));
	for (int32 I = 0; I < 8; I++) Block(FVector(850 + I * 60, -1000, (I + 1) * 10.f), FVector(60, 300, (I + 1) * 20.f), Stone);
	Block(FVector(-500, -2500, 190), FVector(70, 800, 380), Stone);
	Block(FVector(-750, 1500, 178), FVector(500, 160, 16), Oak);
	Block(FVector(-750, 1385, 100), FVector(500, 70, 200), Stone);
	Block(FVector(-750, 1615, 100), FVector(500, 70, 200), Stone);
	Model(TEXT("village"), TEXT("Cottage"), FVector(-1800, -1400, 0), 500, 20);
	Block(FVector(-1800, -1400, 150), FVector(500, 480, 300), Stone);
	CastChecked<UStaticMeshComponent>(Parts[Parts.Num()-2])->SetVisibility(false);
	Model(TEXT("village"), TEXT("Barn"), FVector(-1800, 2500, 0), 420, 100);
	for (int32 I = 0; I < 24; I++)
	{
		const float A = I * 2.f * PI / 24.f;
		Model(TEXT("flora"), I % 2 ? TEXT("Oak") : TEXT("Spruce"), FVector(FMath::Cos(A) * 4000, FMath::Sin(A) * 4000, 0), 550 + (I % 3) * 80, I * 53.f);
	}
	auto* Sun = NewObject<UDirectionalLightComponent>(this); Sun->SetupAttachment(RootComponent); Sun->SetMobility(EComponentMobility::Movable);
	Sun->SetRelativeRotation(FRotator(-42, 145, 0)); Sun->SetIntensity(50000.f); Sun->LightSourceAngle = 1.25f; Sun->SetLightColor(FLinearColor(1, .91f, .78f));
	Sun->bAtmosphereSunLight = true; Sun->RegisterComponent(); Parts.Add(Sun);
	auto* Sky = NewObject<USkyLightComponent>(this); Sky->SetupAttachment(RootComponent); Sky->SetMobility(EComponentMobility::Movable);
	Sky->SourceType = ESkyLightSourceType::SLS_CapturedScene; Sky->bRealTimeCapture = true;
	Sky->SetIntensity(.8f); Sky->RegisterComponent(); Parts.Add(Sky);
	auto* Atmosphere = NewObject<USkyAtmosphereComponent>(this); Atmosphere->SetupAttachment(RootComponent);
	Atmosphere->RegisterComponent(); Parts.Add(Atmosphere);
}
