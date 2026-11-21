// Plays the person's seats through the table UI with simulated input, as a stand-in for a hand
// playthrough in automated runs: -CatnightUiDrive=mouse (clicks on the real buttons and board
// spots, the 3D board picking from the cursor) or -CatnightUiDrive=pad (gamepad keys: shoulders and
// A on the board, Y for roll / end turn, A on focused buttons). The moves are the Medium bot's.
// Anything the UI cannot do is applied directly and counted; the log ends with
//   CATNIGHT UIDRIVE done mode=<m> ui=<n> direct=<k> failed=<f> actions=<a> winner=<name>
#pragma once

#include "CoreMinimal.h"

class STable;

namespace CatnightUiDriver
{
	/** Starts driving this table if the command line asks for it. */
	void AttachIfRequested(const TSharedRef<STable>& Table);
}
