/**
 * User authentication routes.
 *
 * POST /api/v1/auth/register — Create account
 * POST /api/v1/auth/login — Sign in
 * POST /api/v1/auth/logout — Sign out
 * GET  /api/v1/auth/me — Current user
 * POST /api/v1/auth/verify-email — Verify email address
 * POST /api/v1/auth/forgot-password — Request password reset
 * POST /api/v1/auth/reset-password — Reset password with token
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { createUser, loginUser, validateSession, deleteSession } from '../lib/user-auth';

interface AuthEnv {
  BRIEFINGS_DB: D1Database;
}

const auth = new Hono<{ Bindings: AuthEnv }>();

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function getTokenFromCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session_token=([^;]+)/);
  return match?.[1] ?? null;
}

function setSessionCookie(token: string): string {
  return `session_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30 * 24 * 3600}`;
}

/* ─── Routes ───────────────────────────────────────────────────────────────── */

auth.post('/register', async (c) => {
  const body = await c.req.json<{ email: string; password: string; display_name?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password required' }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }

  const result = await createUser(c.env.BRIEFINGS_DB, {
    email: body.email,
    password: body.password,
    display_name: body.display_name,
  });

  if ('error' in result) {
    return c.json({ error: result.error }, 409);
  }

  c.header('Set-Cookie', setSessionCookie(result.token));
  return c.json({ user: result.user }, 201);
});

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  const result = await loginUser(c.env.BRIEFINGS_DB, body.email, body.password);
  if ('error' in result) {
    return c.json({ error: result.error }, 401);
  }

  c.header('Set-Cookie', setSessionCookie(result.token));
  return c.json({ user: result.user });
});

auth.post('/logout', async (c) => {
  const token = getTokenFromCookie(c.req.header('cookie'));
  if (token) {
    await deleteSession(c.env.BRIEFINGS_DB, token);
  }
  c.header('Set-Cookie', 'session_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const token = getTokenFromCookie(c.req.header('cookie'));
  if (!token) {
    return c.json({ user: null });
  }

  const user = await validateSession(c.env.BRIEFINGS_DB, token);
  if (!user) {
    return c.json({ user: null });
  }

  return c.json({ user });
});

export default auth;
