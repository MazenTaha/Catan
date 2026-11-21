// What the table UI and the 3D board share: where a pick may go, what is highlighted, and how a
// screen position becomes a board target in 3D.
#pragma once

#include "CoreMinimal.h"

/** What a board pick places, and where it may go. Written by STable, read by both boards. */
struct FBoardTargets
{
	enum class EKind : uint8 { None, Vertex, Edge, Hex };
	EKind Kind = EKind::None;
	TArray<int32> Legal;
	/** The target chosen with keys or a gamepad (INDEX_NONE: none). */
	int32 Focus = INDEX_NONE;
	/** The target under the mouse (INDEX_NONE: none). */
	int32 Hover = INDEX_NONE;
};

/** Shared by the UI and the 3D board actor for one game window. */
struct FCatnightBoardView
{
	FBoardTargets Targets;
	/** True: the 3D table shows through the UI; false: the flat chart is drawn over it. */
	bool b3D = true;
	/** Set by the 3D board: the legal target under the mouse, or INDEX_NONE. */
	TFunction<int32()> PickUnderMouse;
	/** Set by the 3D board: orbit (degrees) and zoom (factor, 1 = none) requests from the UI. */
	TFunction<void(float Yaw, float Pitch, float Zoom)> MoveCamera;
	/** Bumped when targets or highlights change, so the 3D board redraws its markers. */
	uint32 Revision = 0;
};
