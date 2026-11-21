#include "Lexicon.h"
#include "CatnightRules/Board.h"

using namespace catnight;

namespace
{
	FString Str(const Json* J) { return J && J->IsStr() ? FString(UTF8_TO_TCHAR(J->AsStr().c_str())) : FString(); }
	int32 Int(const Json* J) { return J && J->IsInt() ? static_cast<int32>(J->AsInt()) : 0; }

	FString ResourceFromKey(const FString& Key)
	{
		catnight::Resource R;
		return Parse(TCHAR_TO_UTF8(*Key), R) ? CatnightText::Resource(R) : Key;
	}

	FString CountsFromJson(const Json* J)
	{
		if (!J || !J->IsObj()) return FString();
		catnight::Counts C;
		for (catnight::Resource R : kResources)
		{
			if (const Json* V = J->Get(Name(R))) C[R] = static_cast<int>(V->AsInt());
		}
		return CatnightText::Counts(C);
	}
}

namespace CatnightText
{
	FString Motion(bool bReduced) { return bReduced ? TEXT("Motion: Reduced") : TEXT("Motion: Full"); }
	FString InspectionHint() { return TEXT("Inspect terrain: hover a hex. I cycles map notes (gamepad: X)."); }
	FString DiceResult(const GameState& S)
	{
		return S.dice ? FString::Printf(TEXT("Dice: %d + %d = %d"), (*S.dice)[0], (*S.dice)[1], (*S.dice)[0] + (*S.dice)[1]) : FString();
	}
	FString HexNote(const GameState& S, int32 Hex)
	{
		if (Hex < 0 || Hex >= static_cast<int32>(S.board.hexes.size())) return FString();
		const HexTile& Tile = S.board.hexes[Hex];
		const std::optional<catnight::Resource> Res = TerrainResource(Tile.terrain);
		FString Note = Terrain(Tile.terrain);
		if (Res) Note += TEXT("  /  ") + Resource(*Res);
		if (Tile.token) Note += FString::Printf(TEXT("\nRoll %d: %d of 36 combinations (%.1f%%)"), Tile.token, Pips(Tile.token), Pips(Tile.token) * 100.f / 36.f);
		else Note += TEXT("\nNo production number.");
		if (S.wraithHex == Hex) Note += TEXT("\nRobber: production blocked.");
		TArray<int32> Claims;
		Claims.Init(0, static_cast<int32>(S.players.size()));
		for (int32 V : GetTopology().hexVertices[Hex])
			if (S.buildings.at[V]) Claims[S.buildings.at[V]->owner] += S.buildings.at[V]->kind == BuildingKind::Citadel ? 2 : 1;
		TArray<FString> Owners;
		for (int32 P = 0; P < Claims.Num(); P++) if (Claims[P]) Owners.Add(Res ? FString::Printf(TEXT("%s x%d"), *Player(S, P), Claims[P]) : Player(S, P));
		Note += Owners.Num() ? (Res ? TEXT("\nProduction claims: ") : TEXT("\nAdjacent owners: ")) + FString::Join(Owners, TEXT(", ")) : FString(TEXT("\nNo adjacent settlements."));
		if (Res && Owners.Num()) Note += TEXT("\nSubject to the robber and bank stock.");
		return Note;
	}

	FString Resource(catnight::Resource R)
	{
		static const TCHAR* Names[] = {TEXT("Lumber"), TEXT("Brick"), TEXT("Wool"), TEXT("Grain"), TEXT("Ore")};
		return Names[static_cast<int>(R)];
	}

	FString ResourceShort(catnight::Resource R)
	{
		static const TCHAR* Names[] = {TEXT("L"), TEXT("B"), TEXT("W"), TEXT("G"), TEXT("O")};
		return Names[static_cast<int>(R)];
	}

	FString Terrain(catnight::Terrain T)
	{
		static const TCHAR* Names[] = {TEXT("Forest"), TEXT("Hills"), TEXT("Pasture"), TEXT("Fields"), TEXT("Mountains"), TEXT("Desert")};
		return Names[static_cast<int>(T)];
	}

	FString Omen(catnight::OmenType O)
	{
		static const TCHAR* Names[] = {TEXT("Knight"), TEXT("Victory Point"), TEXT("Road Building"), TEXT("Year of Plenty"), TEXT("Monopoly"), TEXT("Man up")};
		return Names[static_cast<int>(O)];
	}

	FString OmenHelp(catnight::OmenType O)
	{
		switch (O)
		{
		case OmenType::Warden: return TEXT("Move the robber and steal a card.");
		case OmenType::Relic: return TEXT("1 hidden victory point.");
		case OmenType::Decree: return TEXT("Build two roads for free.");
		case OmenType::Harvest: return TEXT("Take any two resources from the bank.");
		case OmenType::Tithe: return TEXT("Name a resource: everyone gives you all of theirs.");
		case OmenType::Manup: return TEXT("Challenge a player to a duel.");
		}
		return FString();
	}

	FString Color(catnight::PlayerColor C)
	{
		static const TCHAR* Names[] = {TEXT("Red"), TEXT("Blue"), TEXT("White"), TEXT("Orange")};
		return Names[static_cast<int>(C)];
	}

	FString BotLevel(catnight::BotLevel B)
	{
		static const TCHAR* Names[] = {TEXT("Easy"), TEXT("Medium"), TEXT("Hard")};
		return Names[static_cast<int>(B)];
	}

	FString Layout(catnight::LayoutMode L)
	{
		static const TCHAR* Names[] = {TEXT("Balanced"), TEXT("Random"), TEXT("Beginner")};
		return Names[static_cast<int>(L)];
	}

	FString HandoffReason(const catnight::GameState& S, int32 Seat)
	{
		switch (S.phase.kind)
		{
		case PhaseKind::Setup: return TEXT("It is their turn to place a settlement and a road.");
		case PhaseKind::Discard: return TEXT("A 7 was rolled: they must discard half their cards.");
		case PhaseKind::Trade:
			return S.phase.offer.proposer == Seat ? FString(TEXT("Their offer has an answer."))
				: FString::Printf(TEXT("%s has made them an offer."), *Player(S, S.phase.offer.proposer));
		default:
			return S.currentPlayer == Seat ? FString(TEXT("It is their turn.")) : FString(TEXT("They must act."));
		}
	}

	FString Player(const catnight::GameState& S, int32 Seat)
	{
		if (Seat < 0 || Seat >= static_cast<int32>(S.players.size())) return TEXT("?");
		return UTF8_TO_TCHAR(S.players[Seat].name.c_str());
	}

	FString Counts(const catnight::Counts& C)
	{
		TArray<FString> Parts;
		for (catnight::Resource R : kResources)
		{
			if (C[R] > 0) Parts.Add(FString::Printf(TEXT("%d %s"), C[R], *Resource(R)));
		}
		return Parts.Num() ? FString::Join(Parts, TEXT(", ")) : TEXT("nothing");
	}

	FString EventLine(const catnight::GameState& S, const catnight::GameEvent& E, int32 Viewer)
	{
		const FString Type = Str(E.Get("type"));
		auto P = [&](const char* Key) { return Player(S, Int(E.Get(Key))); };
		if (Type == TEXT("DiceRolled")) return FString::Printf(TEXT("%s rolled %d."), *P("player"), Int(E.Get("total")));
		if (Type == TEXT("ResourcesProduced"))
		{
			TArray<FString> Parts;
			const Json* Gains = E.Get("gains");
			for (int32 Seat = 0; Gains && Seat < static_cast<int32>(Gains->Items().size()); Seat++)
			{
				const FString C = CountsFromJson(&Gains->Items()[Seat]);
				if (C != TEXT("nothing")) Parts.Add(FString::Printf(TEXT("%s %s"), *Player(S, Seat), *C));
			}
			if (!Parts.Num()) return E.Get("blockedHex")->IsNull() ? TEXT("Nobody produced anything.") : TEXT("The robber blocked the harvest.");
			return FString::Printf(TEXT("Harvest: %s."), *FString::Join(Parts, TEXT("; ")));
		}
		if (Type == TEXT("SetupResourcesGranted")) return FString::Printf(TEXT("%s starts with %s."), *P("player"), *CountsFromJson(E.Get("gains")));
		if (Type == TEXT("SetupOutpostPlaced") || Type == TEXT("OutpostBuilt")) return FString::Printf(TEXT("%s built a settlement."), *P("player"));
		if (Type == TEXT("CausewayBuilt")) return FString::Printf(TEXT("%s built a road."), *P("player"));
		if (Type == TEXT("CitadelBuilt")) return FString::Printf(TEXT("%s built a city."), *P("player"));
		if (Type == TEXT("SetupComplete")) return TEXT("Setup is complete.");
		if (Type == TEXT("TurnStarted"))
		{
			const FString Whose = Int(E.Get("player")) == Viewer ? FString(TEXT("your")) : P("player") + TEXT("'s");
			return FString::Printf(TEXT("— Round %d: %s turn —"), Int(E.Get("round")), *Whose);
		}
		if (Type == TEXT("DiscardRequired")) return TEXT("A 7! Everyone with more than 7 cards discards half.");
		if (Type == TEXT("Discarded")) return FString::Printf(TEXT("%s discarded %s."), *P("player"), *CountsFromJson(E.Get("cards")));
		if (Type == TEXT("WraithMoved")) return FString::Printf(TEXT("%s moved the robber."), *P("player"));
		if (Type == TEXT("Stolen"))
		{
			const int32 Thief = Int(E.Get("thief"));
			const int32 Victim = Int(E.Get("victim"));
			if (Thief == Viewer || Victim == Viewer)
			{
				return FString::Printf(TEXT("%s stole %s from %s."), *P("thief"), *ResourceFromKey(Str(E.Get("resource"))), *P("victim"));
			}
			return FString::Printf(TEXT("%s stole a card from %s."), *P("thief"), *P("victim"));
		}
		if (Type == TEXT("StealSkipped")) return TEXT("Nobody there to rob.");
		if (Type == TEXT("OmenBought")) return FString::Printf(TEXT("%s bought a development card."), *P("player"));
		if (Type == TEXT("OmenPlayed"))
		{
			catnight::OmenType O;
			Parse(E.Get("omen")->AsStr(), O);
			return FString::Printf(TEXT("%s played %s."), *P("player"), *Omen(O));
		}
		if (Type == TEXT("HarvestTaken")) return FString::Printf(TEXT("%s took %s from the bank."), *P("player"), *CountsFromJson(E.Get("resources")));
		if (Type == TEXT("TitheTaken")) return FString::Printf(TEXT("%s took %d %s."), *P("player"), Int(E.Get("total")), *ResourceFromKey(Str(E.Get("resource"))));
		if (Type == TEXT("TradeProposed") || Type == TEXT("TradeCountered"))
		{
			const Json* O = E.Get("offer");
			return FString::Printf(TEXT("%s offers %s for %s."), *Player(S, Int(O->Get("proposer"))), *CountsFromJson(O->Get("give")), *CountsFromJson(O->Get("want")));
		}
		if (Type == TEXT("TradeDeclined")) return FString::Printf(TEXT("%s declined."), *P("player"));
		if (Type == TEXT("TradeCompleted")) return FString::Printf(TEXT("%s and %s traded."), *P("proposer"), *P("accepter"));
		if (Type == TEXT("TradeClosed")) return Str(E.Get("reason")) == TEXT("cancelled") ? TEXT("The offer was withdrawn.") : TEXT("Nobody took the offer.");
		if (Type == TEXT("BankTraded"))
		{
			return FString::Printf(TEXT("%s traded %d %s for %d %s with the bank."), *P("player"), Int(E.Get("giveCount")),
				*ResourceFromKey(Str(E.Get("give"))), Int(E.Get("receiveCount")), *ResourceFromKey(Str(E.Get("receive"))));
		}
		if (Type == TEXT("ProductionShortage")) return FString::Printf(TEXT("The bank ran short of %s."), *ResourceFromKey(Str(E.Get("resource"))));
		if (Type == TEXT("LongestCausewayChanged"))
		{
			return E.Get("holder")->IsNull() ? TEXT("Nobody holds Longest Road now.") : FString::Printf(TEXT("%s takes Longest Road (%d)."), *P("holder"), Int(E.Get("length")));
		}
		if (Type == TEXT("GreatestHostChanged")) return FString::Printf(TEXT("%s takes Largest Army (%d knights)."), *P("holder"), Int(E.Get("count")));
		if (Type == TEXT("GameWon")) return FString::Printf(TEXT("%s wins with %d points!"), *P("player"), Int(E.Get("vp")));
		return FString();
	}
}
