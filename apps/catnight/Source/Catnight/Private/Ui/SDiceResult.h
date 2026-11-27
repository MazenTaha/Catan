#pragma once
#include "CatnightMatch.h"
#include "Ui/HallKit.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"

/** The same authoritative last-roll readout on the table and while exploring. */
class SDiceResult : public SCompoundWidget
{
public:
    SLATE_BEGIN_ARGS(SDiceResult) {} SLATE_ARGUMENT(TSharedPtr<FCatnightMatch>, Match) SLATE_END_ARGS()
    void Construct(const FArguments& A) { Match=A._Match; Refresh(); }
    virtual void Tick(const FGeometry& G,double Time,float Dt) override {
        SCompoundWidget::Tick(G,Time,Dt);
        if(Match && Cached!=Match->LastDice) Refresh();
    }
private:
    void Refresh() {
        Cached=Match?Match->LastDice:std::nullopt;
        if(!Cached) { ChildSlot[HallKit::Ink(TEXT("No roll yet"),18,Hall::Color::MapInk,false)]; return; }
        const int A=(*Cached)[0],B=(*Cached)[1];
        ChildSlot[SNew(SHorizontalBox)
            + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0,0,12,0)[HallKit::LabelText(TEXT("Last roll"),18,Hall::Color::MapInk)]
            + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[HallKit::Die(A,38)]
            + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(6,0)[HallKit::Die(B,38)]
            + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(6,0,0,0)[HallKit::LabelText(FString::Printf(TEXT("%d + %d = %d"),A,B,A+B),24,Hall::Color::RubricDark)]];
    }
    TSharedPtr<FCatnightMatch> Match;
    std::optional<std::array<int,2>> Cached;
};
