#include "Table/UiDriver.h"

#include "CatnightRules/Bots.h"
#include "CatnightRules/Rules.h"
#include "Containers/Ticker.h"
#include "Framework/Application/SlateApplication.h"
#include "Lexicon.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Table/STable.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Text/STextBlock.h"

using namespace catnight;

/** Friend of STable: reads its state and presses its widgets. */
class FUiDriver : public TSharedFromThis<FUiDriver>
{
public:
	enum class EMode : uint8 { Mouse, Pad };

	FUiDriver(const TSharedRef<STable>& InTable, EMode InMode) : Table(InTable), Mode(InMode) {}

	void Start()
	{
		// The ticker owns the driver; it lets go when Step returns false (the table is gone).
		Handle = FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightUiDriver"), 0.12f, [D = AsShared()](float) { return D->Step(); });
		UE_LOG(LogTemp, Display, TEXT("CATNIGHT UIDRIVE start mode=%s"), Mode == EMode::Mouse ? TEXT("mouse") : TEXT("pad"));
	}

private:
	using FStepFn = TFunction<bool()>;  // true: done, go on

	TWeakPtr<STable> Table;
	EMode Mode;
	FTSTicker::FDelegateHandle Handle;
	TArray<FStepFn> Steps;
	int32 StartedAt = 0;      // action count when the current plan began
	double PlanStarted = 0;
	Action Planned;
	int32 Ui = 0, Direct = 0, Failed = 0;
	int32 StepsTotal = 0;
	int32 Covered = 0;  // times a board spot was under the HUD and the table was turned
	bool bLoggedBank = false;
	bool bDone = false;
	TMap<FString, int32> UiByType, DirectByType;

	// ---------------------------------------------------------------- widgets

	static void Collect(const TSharedRef<SWidget>& W, TArray<TSharedRef<SWidget>>& Out)
	{
		if (!W->GetVisibility().IsVisible()) return;
		Out.Add(W);
		FChildren* Children = W->GetChildren();
		for (int32 I = 0; Children && I < Children->Num(); I++) Collect(Children->GetChildAt(I), Out);
	}

	/** HallKit buttons are SHallButton (an SButton with the gold focus ring). */
	static bool IsButton(const TSharedRef<SWidget>& W) { return W->GetType() == TEXT("SButton") || W->GetType() == TEXT("SHallButton"); }

	static FString TextsUnder(const TSharedRef<SWidget>& W)
	{
		TArray<TSharedRef<SWidget>> All;
		Collect(W, All);
		FString Out;
		for (const TSharedRef<SWidget>& C : All)
			if (C->GetType() == TEXT("STextBlock")) Out += StaticCastSharedRef<STextBlock>(C)->GetText().ToString() + TEXT("|");
		return Out;
	}

	/** Visible buttons whose label equals (or starts with) Label, in layout order; disabled ones
	 *  only with bAll (so the Nth of a row keeps its place). */
	TArray<TSharedRef<SWidget>> Buttons(const FString& Label, bool bPrefix = false, bool bAll = false) const
	{
		TArray<TSharedRef<SWidget>> Found;
		TSharedPtr<STable> T = Table.Pin();
		if (!T) return Found;
		TArray<TSharedRef<SWidget>> All;
		Collect(T.ToSharedRef(), All);
		for (const TSharedRef<SWidget>& W : All)
		{
			if (!IsButton(W) || (!bAll && !W->IsEnabled())) continue;
			TArray<FString> Texts;
			TextsUnder(W).ParseIntoArray(Texts, TEXT("|"));
			for (const FString& Text : Texts)
				// (Unreal's StartsWith is false for an empty prefix: "" means every button.)
				if (Label.IsEmpty() || (bPrefix ? Text.StartsWith(Label) : Text == Label))
				{
					Found.Add(W);
					break;
				}
		}
		return Found;
	}

	/** The first enabled button labelled `Label` after the text `After` (e.g. a card's Play). */
	TSharedPtr<SWidget> ButtonAfter(const FString& After, const FString& Label) const
	{
		TSharedPtr<STable> T = Table.Pin();
		if (!T) return nullptr;
		TArray<TSharedRef<SWidget>> All;
		Collect(T.ToSharedRef(), All);
		bool bSeen = false;
		for (const TSharedRef<SWidget>& W : All)
		{
			if (W->GetType() == TEXT("STextBlock") && StaticCastSharedRef<STextBlock>(W)->GetText().ToString().StartsWith(After)) bSeen = true;
			if (bSeen && IsButton(W) && W->IsEnabled() && TextsUnder(W).Contains(Label + TEXT("|"))) return W;
		}
		return nullptr;
	}

	// ---------------------------------------------------------------- input

	static FVector2D Center(const TSharedRef<SWidget>& W)
	{
		const FGeometry& G = W->GetCachedGeometry();
		return FVector2D(G.GetAbsolutePosition()) + FVector2D(G.GetAbsoluteSize()) * 0.5f;
	}

	static void MouseMove(FVector2D At)
	{
		FSlateApplication& App = FSlateApplication::Get();
		App.ProcessMouseMoveEvent(FPointerEvent(App.CursorPointerIndex, At, At, TSet<FKey>(), EKeys::Invalid, 0.f, FModifierKeysState()));
	}

	static void MouseClick(FVector2D At)
	{
		FSlateApplication& App = FSlateApplication::Get();
		const TSet<FKey> Pressed = {EKeys::LeftMouseButton};
		App.ProcessMouseButtonDownEvent(nullptr, FPointerEvent(App.CursorPointerIndex, At, At, Pressed, EKeys::LeftMouseButton, 0.f, FModifierKeysState()));
		App.ProcessMouseButtonUpEvent(FPointerEvent(App.CursorPointerIndex, At, At, TSet<FKey>(), EKeys::LeftMouseButton, 0.f, FModifierKeysState()));
	}

	static void Key(const FKey& K)
	{
		FSlateApplication& App = FSlateApplication::Get();
		const FKeyEvent E(K, FModifierKeysState(), 0, false, 0, 0);
		App.ProcessKeyDownEvent(E);
		App.ProcessKeyUpEvent(E);
	}

	/** Scrolls the right column so W is on screen; false while it is not there yet. */
	bool OnScreen(const TSharedRef<SWidget>& W) const
	{
		TSharedPtr<STable> T = Table.Pin();
		if (!T) return false;
		const FGeometry& TG = T->GetCachedGeometry();
		const FVector2D Top = FVector2D(TG.GetAbsolutePosition()), Size = FVector2D(TG.GetAbsoluteSize());
		const FVector2D C = Center(W);
		// On screen and really the widget under that point (not clipped by the scrolled column).
		FSlateApplication& App = FSlateApplication::Get();
		const FWidgetPath Path = App.LocateWindowUnderMouse(C, App.GetInteractiveTopLevelWindows());
		if (C.Y > Top.Y + 4 && C.Y < Top.Y + Size.Y - 4 && Path.IsValid() && Path.ContainsWidget(&W.Get())) return true;
		if (T->PanelScroll) T->PanelScroll->ScrollDescendantIntoView(W, false, EDescendantScrollDestination::Center);
		return false;
	}

	/** Presses a button: a click with the mouse (scrolled into view first, as a player would), or
	 *  focus and A with the pad. False when it has to wait a frame. */
	bool Press(const TSharedRef<SWidget>& W)
	{
		if (Mode == EMode::Mouse && !OnScreen(W)) return false;
		if (Mode == EMode::Mouse)
		{
			MouseMove(Center(W));
			MouseClick(Center(W));
		}
		else
		{
			FSlateApplication::Get().SetAllUserFocus(W, EFocusCause::Navigation);
			Key(EKeys::Gamepad_FaceButton_Bottom);
		}
		return true;
	}

	// ---------------------------------------------------------------- steps

	void PressStep(const FString& Label, bool bPrefix = false, int32 Nth = 0)
	{
		Steps.Add([this, Label, bPrefix, Nth]
		{
			TArray<TSharedRef<SWidget>> Found = Buttons(Label, bPrefix, Nth > 0);
			if (!Found.IsValidIndex(Nth) || !Found[Nth]->IsEnabled()) return false;  // not drawn yet: wait (the plan times out)
			return Press(Found[Nth]);
		});
	}

	void PressAfterStep(const FString& After, const FString& Label)
	{
		Steps.Add([this, After, Label]
		{
			TSharedPtr<SWidget> W = ButtonAfter(After, Label);
			if (!W) return false;
			return Press(W.ToSharedRef());
		});
	}

	void TabStep(STable::ETab Tab, const FString& Label, bool bPrefix = false)
	{
		Steps.Add([this, Tab, Label, bPrefix]
		{
			TSharedPtr<STable> T = Table.Pin();
			if (!T) return false;
			if (T->Tab == Tab) return true;
			TArray<TSharedRef<SWidget>> Found = Buttons(Label, bPrefix);
			if (!Found.Num()) return false;
			Press(Found[0]);
			return false;  // check again once the panel is rebuilt
		});
	}

	void BoardStep(FBoardTargets::EKind Kind, int32 Index)
	{
		// Wait for the targets, then point and click (mouse) or cycle with RB and press A (pad).
		TSharedRef<int32> Presses = MakeShared<int32>(0);
		Steps.Add([this, Kind, Index, Presses]
		{
			TSharedPtr<STable> T = Table.Pin();
			if (!T || T->Targets->Kind != Kind || !T->Targets->Legal.Contains(Index)) return false;
			if (Mode == EMode::Mouse)
			{
				const TOptional<FVector2D> At = T->Board->ScreenOf(Kind, Index);
				if (!At) return false;
				MouseMove(*At);
				return true;  // the click comes next tick, once the board has seen the cursor
			}
			if (T->Targets->Focus == Index) return true;
			if (++Presses.Get() > T->Targets->Legal.Num() + 2) return true;  // give up; the plan will fail
			if (!T->Board->HasKeyboardFocus()) FSlateApplication::Get().SetAllUserFocus(T->Board, EFocusCause::Navigation);
			Key(EKeys::Gamepad_RightShoulder);
			return false;
		});
		TSharedRef<int32> Tries = MakeShared<int32>(0);
		Steps.Add([this, Kind, Index, Tries]
		{
			TSharedPtr<STable> T = Table.Pin();
			if (!T) return true;
			if (Mode == EMode::Mouse)
			{
				// Point again until the 3D board picks this spot under the cursor (the camera may
				// still be easing in), then click.
				const TOptional<FVector2D> At = T->Board->ScreenOf(Kind, Index);
				if (!At) return false;
				MouseMove(*At);
				const int32 Picked = T->View->b3D && T->View->PickUnderMouse ? T->View->PickUnderMouse() : Index;
				// A spot under the HUD (the Herald, the Lists): turn the table, as a player would.
				FSlateApplication& App = FSlateApplication::Get();
				const FWidgetPath Path = App.LocateWindowUnderMouse(*At, App.GetInteractiveTopLevelWindows());
				const bool bCovered = !Path.IsValid() || Path.Widgets.Last().Widget != T->Board;
				if ((Picked != Index || bCovered) && ++Tries.Get() < 25)
				{
					if (bCovered && T->View->b3D && T->View->MoveCamera && Tries.Get() % 4 == 1)
					{
						T->View->MoveCamera(45.f, 0.f, 1.f);
						Covered++;
					}
					if (Tries.Get() == 24)
						UE_LOG(LogTemp, Warning, TEXT("CATNIGHT UIDRIVE pick %d at (%.0f, %.0f) gives %d%s"), Index, At->X, At->Y, Picked,
							bCovered ? *FString::Printf(TEXT(", covered by %s"), Path.IsValid() ? *Path.Widgets.Last().Widget->GetTypeAsString() : TEXT("nothing")) : TEXT(""));
					return false;
				}
				MouseClick(*At);
			}
			else
			{
				Key(EKeys::Gamepad_FaceButton_Bottom);
			}
			return true;
		});
	}

	void KeyStep(const FKey& K)
	{
		Steps.Add([this, K]
		{
			TSharedPtr<STable> T = Table.Pin();
			if (!T) return true;
			if (!T->HasFocusedDescendants() && !T->HasKeyboardFocus()) FSlateApplication::Get().SetAllUserFocus(T, EFocusCause::Navigation);
			Key(K);
			return true;
		});
	}

	static int32 VertexIndex(const std::string& Id)
	{
		const auto& Ids = GetTopology().vertexIds;
		return static_cast<int32>(std::find(Ids.begin(), Ids.end(), Id) - Ids.begin());
	}

	static int32 EdgeIndex(const std::string& Id)
	{
		const auto& Ids = GetTopology().edgeIds;
		return static_cast<int32>(std::find(Ids.begin(), Ids.end(), Id) - Ids.begin());
	}

	/** Builds the UI steps for an action; false when the UI has no way to do it here. */
	bool Plan(const GameState& S, const Action& A)
	{
		TSharedPtr<STable> T = Table.Pin();
		switch (A.type)
		{
		case ActionType::AckPassDevice:
			PressStep(TEXT("I am "), true);
			return true;
		case ActionType::RollDice:
			if (Mode == EMode::Pad) KeyStep(EKeys::Gamepad_FaceButton_Top);
			else PressStep(TEXT("Roll the dice"));
			return true;
		case ActionType::EndTurn:
			if (Mode == EMode::Pad) KeyStep(EKeys::Gamepad_FaceButton_Top);
			else PressStep(TEXT("End turn"));
			return true;
		case ActionType::PlaceSetupOutpost:
			BoardStep(FBoardTargets::EKind::Vertex, VertexIndex(A.vertex));
			return true;
		case ActionType::PlaceSetupCauseway:
			BoardStep(FBoardTargets::EKind::Edge, EdgeIndex(A.edge));
			return true;
		case ActionType::MoveWraith:
			BoardStep(FBoardTargets::EKind::Hex, A.hex);
			return true;
		case ActionType::BuildCauseway:
			if (S.phase.kind == PhaseKind::Main)
			{
				TabStep(STable::ETab::Build, TEXT("Build"));
				PressStep(TEXT("Road"));
			}
			BoardStep(FBoardTargets::EKind::Edge, EdgeIndex(A.edge));
			return true;
		case ActionType::BuildOutpost:
		case ActionType::BuildCitadel:
			TabStep(STable::ETab::Build, TEXT("Build"));
			PressStep(A.type == ActionType::BuildOutpost ? TEXT("Settlement") : TEXT("City"));
			BoardStep(FBoardTargets::EKind::Vertex, VertexIndex(A.vertex));
			return true;
		case ActionType::BuyOmen:
			TabStep(STable::ETab::Build, TEXT("Build"));
			PressStep(TEXT("Dev. card"));
			return true;
		case ActionType::StealFrom:
			PressStep(FString(UTF8_TO_TCHAR(S.players[A.victim].name.c_str())) + TEXT(" · "), true);
			return true;
		case ActionType::Discard:
			for (Resource R : kResources)
				for (int32 K = 0; K < A.cards.v[static_cast<int>(R)]; K++) PressStep(TEXT("+"), false, static_cast<int32>(R));
			PressStep(TEXT("Discard"));
			return true;
		case ActionType::RespondTrade:
			if (A.response == TradeResponse::Counter) return false;  // the bots' counter terms: applied directly
			PressStep(A.response == TradeResponse::Accept ? TEXT("Accept") : TEXT("Decline"));
			return true;
		case ActionType::PlayWarden:
		case ActionType::PlayDecree:
		case ActionType::PlayHarvestPact:
		case ActionType::PlayBloodTithe:
		{
			const OmenType O = A.type == ActionType::PlayWarden ? OmenType::Warden : A.type == ActionType::PlayDecree ? OmenType::Decree
				: A.type == ActionType::PlayHarvestPact ? OmenType::Harvest : OmenType::Tithe;
			TabStep(STable::ETab::Cards, TEXT("Cards ("), true);
			PressAfterStep(CatnightText::Omen(O) + TEXT(" ×"), TEXT("Play"));
			if (A.type == ActionType::PlayHarvestPact)
			{
				for (Resource R : A.resources) PressStep(CatnightText::Resource(R) + TEXT(" ("), true);
				PressStep(TEXT("Invoke"));
			}
			if (A.type == ActionType::PlayBloodTithe) PressStep(CatnightText::Resource(A.resource));
			return true;
		}
		case ActionType::BankTrade:
		{
			// Give row: "<rate>:1" buttons; get row: the bank's stock numbers; then the "… for 1 …" seal.
			TabStep(STable::ETab::Trade, TEXT("Trade"));
			const int32 Give = static_cast<int32>(A.giveRes), Get = static_cast<int32>(A.receiveRes);
			Steps.Add([this, Give]
			{
				TArray<TSharedRef<SWidget>> Rates;
				for (const TSharedRef<SWidget>& W : Buttons(TEXT(""), true, true))
					if (TextsUnder(W).Contains(TEXT(":1|"))) Rates.Add(W);
				TSharedPtr<STable> Tb = Table.Pin();
				if (!Tb || Tb->BankGive == static_cast<Resource>(Give)) return true;
				if (!Rates.IsValidIndex(Give) || !Rates[Give]->IsEnabled())
				{
					UE_LOG(LogTemp, Verbose, TEXT("CATNIGHT UIDRIVE bank: %d rate buttons, want %d"), Rates.Num(), Give);
					if (Rates.IsValidIndex(Give) && !bLoggedBank)
					{
						bLoggedBank = true;
						FString States;
						for (const TSharedRef<SWidget>& W : Rates) States += FString::Printf(TEXT("%s=%s "), *TextsUnder(W), W->IsEnabled() ? TEXT("on") : TEXT("off"));
						UE_LOG(LogTemp, Warning, TEXT("CATNIGHT UIDRIVE bank give %d disabled: %s"), Give, *States);
					}
					else if (!bLoggedBank)
					{
						bLoggedBank = true;
						UE_LOG(LogTemp, Warning, TEXT("CATNIGHT UIDRIVE bank: %d rate buttons found"), Rates.Num());
					}
					return false;
				}
				Press(Rates[Give]);
				return false;
			});
			Steps.Add([this, Get]
			{
				TSharedPtr<STable> Tb = Table.Pin();
				if (!Tb || Tb->BankGet == static_cast<Resource>(Get)) return true;
				TArray<TSharedRef<SWidget>> Stock;
				for (const TSharedRef<SWidget>& W : Buttons(TEXT(""), true, true))
				{
					FString Text = TextsUnder(W);
					Text.RemoveFromEnd(TEXT("|"));
					if (Text.Len() && Text.IsNumeric()) Stock.Add(W);
				}
				if (!Stock.IsValidIndex(Get) || !Stock[Get]->IsEnabled()) return false;
				Press(Stock[Get]);
				return false;
			});
			Steps.Add([this]
			{
				for (const TSharedRef<SWidget>& W : Buttons(TEXT(""), true))
					if (TextsUnder(W).Contains(TEXT(" for 1 ")))
						return Press(W);
				return false;
			});
			return true;
		}
		case ActionType::ProposeTrade:
		{
			// The bill of exchange: steppers per resource (give –/+, want –/+), the "To" choice, the seal.
			TabStep(STable::ETab::Trade, TEXT("Trade"));
			Counts Give{}, Want{};
			for (Resource R : kResources)
			{
				Give[R] = A.give.has[static_cast<int>(R)] ? A.give.v[static_cast<int>(R)] : 0;
				Want[R] = A.want.has[static_cast<int>(R)] ? A.want.v[static_cast<int>(R)] : 0;
			}
			Steps.Add([this, Give, Want]
			{
				TSharedPtr<STable> Tb = Table.Pin();
				if (!Tb) return true;
				const TArray<TSharedRef<SWidget>> Plus = Buttons(TEXT("+"), false, true), Minus = Buttons(TEXT("–"), false, true);
				for (Resource R : kResources)
				{
					const int32 I = static_cast<int32>(R);
					for (int32 Side = 0; Side < 2; Side++)
					{
						const int32 Have = Side == 0 ? Tb->OfferGive[R] : Tb->OfferWant[R];
						const int32 Goal = Side == 0 ? Give[R] : Want[R];
						const TArray<TSharedRef<SWidget>>& Row = Have < Goal ? Plus : Minus;
						if (Have == Goal || !Row.IsValidIndex(I * 2 + Side)) continue;
						Press(Row[I * 2 + Side]);
						return false;  // one press per frame; the editor is rebuilt after each
					}
				}
				return true;
			});
			const TSet<int32> To = A.to ? TSet<int32>(TArray<int32>(A.to->data(), static_cast<int32>(A.to->size()))) : TSet<int32>();
			Steps.Add([this, To, Me = A.player]
			{
				TSharedPtr<STable> Tb = Table.Pin();
				if (!Tb) return true;
				const GameState& St = Tb->Match->State();
				const bool bAll = To.Num() == 0 || To.Num() == static_cast<int32>(St.players.size()) - 1;
				if (bAll ? Tb->OfferTo.IsEmpty() : Tb->OfferTo.Num() == To.Num() && Tb->OfferTo.Includes(To)) return true;
				// Someone chosen who should not be (or everyone wanted): "All" clears the choice.
				if (bAll || Tb->OfferTo.Difference(To).Num())
				{
					TArray<TSharedRef<SWidget>> AllButton = Buttons(TEXT("All"));
					if (AllButton.Num()) Press(AllButton[0]);
					return false;
				}
				for (int32 Id : To)
				{
					if (Tb->OfferTo.Contains(Id)) continue;
					TArray<TSharedRef<SWidget>> Named = Buttons(UTF8_TO_TCHAR(St.players[Id].name.c_str()));
					if (Named.Num()) Press(Named.Last());
					return false;
				}
				return true;
			});
			PressStep(TEXT("Make the offer"));
			return true;
		}
		default:
			return false;  // cancelling an offer, counter terms, the walk's actions
		}
	}

	bool Step()
	{
		TSharedPtr<STable> T = Table.Pin();
		if (!T) return false;
		const TSharedPtr<FCatnightMatch>& M = T->Match;
		if (!M || !M->HasGame()) return true;
		if (M->IsEnded())
		{
			if (!bDone)
			{
				bDone = true;
				TArray<FString> Kinds;
				for (const auto& [Name, N] : UiByType) Kinds.Add(FString::Printf(TEXT("%s=%d"), *Name, N));
				TArray<FString> Directs;
				for (const auto& [Name, N] : DirectByType) Directs.Add(FString::Printf(TEXT("%s=%d"), *Name, N));
				UE_LOG(LogTemp, Display, TEXT("CATNIGHT UIDRIVE done mode=%s ui=%d direct=%d failed=%d actions=%d winner=%s"),
					Mode == EMode::Mouse ? TEXT("mouse") : TEXT("pad"), Ui, Direct, Failed, M->ActionCount(), *CatnightText::Player(M->State(), *M->State().winner));
				UE_LOG(LogTemp, Display, TEXT("CATNIGHT UIDRIVE through the UI: %s (table turned %d times to uncover a spot)"), *FString::Join(Kinds, TEXT(" ")), Covered);
				UE_LOG(LogTemp, Display, TEXT("CATNIGHT UIDRIVE applied directly: %s"), *FString::Join(Directs, TEXT(" ")));
			}
			return true;
		}
		const double Now = FPlatformTime::Seconds();
		// A plan in progress: run its next step, or see whether it worked.
		if (Steps.Num())
		{
			if (M->ActionCount() > StartedAt)
			{
				Steps.Reset();  // the action happened (possibly earlier than the last step)
			}
			else if (Steps[0]())
			{
				Steps.RemoveAt(0);
				return true;
			}
			if (Steps.Num() && Now - PlanStarted < 6.0) return true;
		}
		if (StartedAt >= 0 && PlanStarted > 0)
		{
			const FString Type = UTF8_TO_TCHAR(std::string(Name(Planned.type)).c_str());
			if (M->ActionCount() > StartedAt)
			{
				Ui++;
				UiByType.FindOrAdd(Type)++;
			}
			else
			{
				Failed++;
				UE_LOG(LogTemp, Warning, TEXT("CATNIGHT UIDRIVE failed %s through the UI at step %d of %d (error: '%s', tab %d, build %d, targets %d, legal %d, give %d get %d); applying it directly"),
					*Type, StepsTotal - Steps.Num() + 1, StepsTotal, *M->LastError, static_cast<int32>(T->Tab), static_cast<int32>(T->Build), static_cast<int32>(T->Targets->Kind),
					T->Targets->Legal.Num(), static_cast<int32>(T->BankGive), static_cast<int32>(T->BankGet));
				Steps.Reset();
				T->Build = STable::EBuild::None;
				if (M->Apply(Planned).IsEmpty())
				{
					Direct++;
					DirectByType.FindOrAdd(Type)++;
				}
			}
			PlanStarted = 0;
			Steps.Reset();
			return true;
		}
		if (!M->IsHumanToAct() || T->bDirty || T->bLeaving) return true;

		const GameState& S = M->State();
		std::optional<Action> A;
		if (M->NeedsHandoff()) A = Action::Make(ActionType::AckPassDevice, M->Actor());
		else A = DecideAction(S, BotLevel::Warlord);
		if (!A) return true;
		Planned = *A;
		StartedAt = M->ActionCount();
		PlanStarted = Now;
		const bool bPlanned = Plan(S, *A);
		StepsTotal = Steps.Num();
		if (!bPlanned)
		{
			const FString Type = UTF8_TO_TCHAR(std::string(Name(A->type)).c_str());
			PlanStarted = 0;
			if (M->Apply(*A).IsEmpty())
			{
				Direct++;
				DirectByType.FindOrAdd(Type)++;
			}
		}
		return true;
	}
};

namespace CatnightUiDriver
{
	void AttachIfRequested(const TSharedRef<STable>& Table)
	{
		FString Mode;
		if (!FParse::Value(FCommandLine::Get(), TEXT("CatnightUiDrive="), Mode)) return;
		static TWeakPtr<FUiDriver> Running;
		if (Running.IsValid()) return;
		TSharedRef<FUiDriver> D = MakeShared<FUiDriver>(Table, Mode == TEXT("pad") ? FUiDriver::EMode::Pad : FUiDriver::EMode::Mouse);
		D->Start();
		Running = D;
	}
}
