/**
 * Generic loop engine.
 *
 * Encodes the "loop engineering" pattern (see docs/LOOP-ENGINEERING.md) as a
 * small, typed control-flow primitive: a loop has a goal, a max-iteration
 * ceiling, an ordered list of named exit conditions, and a list of guardrails
 * that filter proposed actions.
 *
 * The engine only *decides*. It never prompts an LLM, executes a tool, or
 * mutates state — callers own all I/O. This keeps exit/guardrail logic pure and
 * independently testable (see test/lib/loop-engine.test.ts).
 */

/** A named, pure predicate that ends the loop when it matches the state. */
export interface ExitCondition<TState> {
  /** Stable identifier used in decision traces and tests. */
  name: string;
  /** True when this condition is satisfied for the given state. */
  met(state: TState): boolean;
  /** Human-readable reason, shown in the agent UI when this condition fires. */
  reason(state: TState): string;
}

/**
 * A named filter applied to the actions an iteration proposes. Guardrails are
 * anti-gaming / safety rules — e.g. "don't repeat a call" or "never call a
 * banned tool". Each returns the surviving subset (never mutates its input).
 */
export interface Guardrail<TState, TAction> {
  name: string;
  filter(actions: readonly TAction[], state: TState): TAction[];
}

/** Declarative description of a loop. */
export interface LoopDefinition<TState, TAction> {
  /** The desired end state, in prose. */
  goal: string;
  /** Hard ceiling on iterations for this state. */
  maxIterations(state: TState): number;
  /** Exit conditions, evaluated in order; the first match wins. */
  exitConditions: ExitCondition<TState>[];
  /** Guardrails, applied in order to proposed actions. */
  guardrails: Guardrail<TState, TAction>[];
}

/** The result of evaluating exit conditions. */
export interface ExitResult {
  /** The `name` of the matching exit condition. */
  name: string;
  /** Its `reason(state)` output. */
  reason: string;
}

/**
 * Drives a {@link LoopDefinition}. Stateless beyond the definition itself.
 */
export class LoopEngine<TState, TAction> {
  constructor(private readonly def: LoopDefinition<TState, TAction>) {}

  get goal(): string {
    return this.def.goal;
  }

  maxIterations(state: TState): number {
    return this.def.maxIterations(state);
  }

  /**
   * Returns the first matching exit condition (by definition order), or `null`
   * if the loop should continue.
   */
  evaluateExit(state: TState): ExitResult | null {
    for (const c of this.def.exitConditions) {
      if (c.met(state)) return { name: c.name, reason: c.reason(state) };
    }
    return null;
  }

  /**
   * Runs proposed actions through every guardrail, in order. The output of one
   * guardrail is the input to the next.
   */
  applyGuardrails(actions: readonly TAction[], state: TState): TAction[] {
    return this.def.guardrails.reduce<TAction[]>((acc, g) => g.filter(acc, state), [...actions]);
  }
}
