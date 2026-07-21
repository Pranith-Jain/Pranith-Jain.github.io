/**
 * Typed wrapper for the Workers AI binding.
 *
 * The runtime `env.AI` binding has a complex generic type that doesn't always
 * match the `@cloudflare/workers-types` declaration perfectly. This module
 * provides a single well-typed accessor so callers don't need `as never`.
 * The cast from `unknown` happens exactly ONCE, here, instead of 50+ places.
 */

import type { Ai } from '@cloudflare/workers-types';

/** Extract a typed AI binding from the env. */
export function getAi(env: { AI: unknown }): Ai {
  return env.AI as Ai;
}
