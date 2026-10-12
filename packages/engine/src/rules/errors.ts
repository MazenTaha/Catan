import type { GameError, GameErrorCode } from '../state/types';

/** Thrown inside rule handlers; converted to a typed `GameError` by `applyAction`. */
export class RuleError extends Error implements GameError {
  constructor(
    public code: GameErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function fail(code: GameErrorCode, message: string): never {
  throw new RuleError(code, message);
}

export function check(cond: unknown, code: GameErrorCode, message: string): asserts cond {
  if (!cond) throw new RuleError(code, message);
}
