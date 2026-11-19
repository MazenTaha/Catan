#pragma once
#include "CoreMinimal.h"

/** Presentation clock: crossing a marker fires once even when one frame crosses the entire action. */
struct FCatanActionClock {
    double Age = 100, Duration = 0, Contact = 0;
    bool bContactPassed = true;
    bool Active() const { return Age < Duration; }
    bool Begin(double InContact, double InDuration) {
        if (Active()) return false;
        Age = 0; Contact = InContact; Duration = InDuration; bContactPassed = false; return true;
    }
    bool Advance(double Delta) {
        Age += FMath::Max(0.0, Delta);
        if (!bContactPassed && Age >= Contact) { bContactPassed = true; return true; }
        return false;
    }
    void CancelContact() { bContactPassed = true; }
    void Cancel() { Age = 100; bContactPassed = true; }
};
