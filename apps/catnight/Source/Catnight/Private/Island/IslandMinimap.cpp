#include "Island/IslandMinimap.h"
#include "Island/IslandWorld.h"
#include "Hero/HeroPawn.h"
#include "CatnightRules/Board.h"
#include "Rendering/DrawElements.h"
#include "Styling/CoreStyle.h"
#include "Ui/HallStyle.h"

int32 SIslandMinimap::OnPaint(const FPaintArgs& Args,const FGeometry& G,const FSlateRect& Culling,FSlateWindowElementList& E,int32 L,const FWidgetStyle& Style,bool ParentEnabled) const
{
    if(!Island.IsValid() || !Hero.IsValid()) return L;
    const float Scale=205.f/(Island->TileRadius*9.f);
    auto XY=[&](FVector P) { P-=Island->GetActorLocation(); return FVector2D(115+P.Y*Scale,132-P.X*Scale); };
    const auto* White=FCoreStyle::Get().GetBrush(TEXT("GenericWhiteBox"));
    FSlateDrawElement::MakeBox(E,L,G.ToPaintGeometry(),White,ESlateDrawEffect::None,FLinearColor(.81f,.73f,.54f,.96f));
    for(const auto& H:Island->Map().hexes) {
        TArray<FVector2D> Ring;
        for(int32 V:catnight::GetTopology().hexVertices[H.id]) Ring.Add(XY(Island->VertexPoint(V)));
        const FVector2D First=Ring[0];
        Ring.Add(First);
        const FLinearColor Colors[]={FLinearColor(.15f,.30f,.08f),FLinearColor(.55f,.22f,.11f),FLinearColor(.3f,.45f,.12f),FLinearColor(.55f,.42f,.08f),FLinearColor(.27f,.31f,.32f),FLinearColor(.65f,.5f,.25f)};
        FSlateDrawElement::MakeLines(E,L+1,G.ToPaintGeometry(),Ring,ESlateDrawEffect::None,Colors[static_cast<int32>(H.terrain)],true,2.4f);
    }
    const FVector2D P=XY(Hero->GetActorLocation());
    const FVector F=Hero->GetActorForwardVector(); const FVector2D D(F.Y,-F.X),R(-D.Y,D.X);
    FSlateDrawElement::MakeLines(E,L+2,G.ToPaintGeometry(),{P+D*7,P-D*5+R*4,P-D*5-R*4,P+D*7},ESlateDrawEffect::None,FLinearColor(.66f,.08f,.05f),true,2.4f);
    auto Text=[&](const FString& S,FVector2D At) { FSlateDrawElement::MakeText(E,L+3,G.ToPaintGeometry(FVector2D(200,22),FSlateLayoutTransform(At)),S,Hall::Body(16),ESlateDrawEffect::None,Hall::Color::MapInk); };
    Text(TEXT("Island · North"),FVector2D(14,10));
    Text(TEXT("100 m"),FVector2D(14,223));
    FSlateDrawElement::MakeLines(E,L+2,G.ToPaintGeometry(),{FVector2D(80,234),FVector2D(80+10000*Scale,234)},ESlateDrawEffect::None,Hall::Color::MapInk,true,2.f);
    return L+3;
}
