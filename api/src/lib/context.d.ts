/**
 * Hono Context augmentation for middleware-injected properties.
 *
 * The auth middleware attaches `c.user`, and the validation middleware
 * attaches `c.parsed`. These types make them visible to route handlers.
 */
import type { AuthUser } from './auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    parsed: unknown;
  }
}
