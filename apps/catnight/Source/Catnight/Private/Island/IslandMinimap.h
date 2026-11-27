#pragma once
#include "CoreMinimal.h"
#include "Widgets/SLeafWidget.h"

/** Public chart only: no private hand or deck information enters the exploration HUD. */
class SIslandMinimap : public SLeafWidget
{
public:
    SLATE_BEGIN_ARGS(SIslandMinimap) {}
        SLATE_ARGUMENT(TWeakObjectPtr<class ACatnightIsland>,Island)
        SLATE_ARGUMENT(TWeakObjectPtr<class ACatnightHero>,Hero)
    SLATE_END_ARGS()
    void Construct(const FArguments& Args) { Island=Args._Island; Hero=Args._Hero; }
    virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D(230,250); }
    virtual int32 OnPaint(const FPaintArgs& Args,const FGeometry& Geometry,const FSlateRect& Culling,FSlateWindowElementList& Elements,int32 Layer,const FWidgetStyle& Style,bool ParentEnabled) const override;
private:
    TWeakObjectPtr<class ACatnightIsland> Island;
    TWeakObjectPtr<class ACatnightHero> Hero;
};
