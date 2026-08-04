/**
 * Organization routes.
 *
 * GET    /api/v1/orgs — List user's organizations
 * POST   /api/v1/orgs — Create organization
 * GET    /api/v1/orgs/:slug — Get organization by slug
 * GET    /api/v1/orgs/:slug/members — List members
 * POST   /api/v1/orgs/:slug/members — Add member
 * DELETE /api/v1/orgs/:slug/members/:userId — Remove member
 */

import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, unauthorized, forbidden, notFound, conflict } from '../lib/api-error';
import type { D1Database } from '@cloudflare/workers-types';
import {
  createOrganization,
  getOrgMembers,
  addOrgMember,
  removeOrgMember,
  getUserOrgs,
  isOrgMember,
  validateSession,
} from '../lib/user-auth';

interface OrgEnv extends Env {
  BRIEFINGS_DB: D1Database;
}

const orgs = new Hono<{ Bindings: OrgEnv }>();

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function getTokenFromCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session_token=([^;]+)/);
  return match?.[1] ?? null;
}

async function requireUser(c: any) {
  const token = getTokenFromCookie(c.req.header('cookie'));
  if (!token) return null;
  return validateSession(c.env.BRIEFINGS_DB, token);
}

/* ─── Routes ───────────────────────────────────────────────────────────────── */

orgs.get('/', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c, 'Unauthorized');

  const orgsList = await getUserOrgs(c.env.BRIEFINGS_DB, user.id);
  return c.json({ organizations: orgsList });
});

orgs.post('/', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c, 'Unauthorized');

  const body = await c.req.json<{ name: string; slug?: string; description?: string }>();
  if (!body.name) {
    return badRequest(c, 'Organization name required');
  }

  const slug =
    body.slug ||
    body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const result = await createOrganization(c.env.BRIEFINGS_DB, user.id, body.name, slug, body.description);

  if ('error' in result) {
    return conflict(c, result.error);
  }

  return c.json({ organization: result }, 201);
});

orgs.get('/:slug', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c, 'Unauthorized');

  const slug = c.req.param('slug');
  const org = await c.env.BRIEFINGS_DB.prepare('SELECT * FROM organizations WHERE slug = ?').bind(slug).first();

  if (!org) {
    return notFound(c, 'Organization not found');
  }

  const isMember = await isOrgMember(c.env.BRIEFINGS_DB, org.id as string, user.id);
  if (!isMember) {
    return forbidden(c, 'Forbidden');
  }

  return c.json({ organization: org });
});

orgs.get('/:slug/members', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c, 'Unauthorized');

  const slug = c.req.param('slug');
  const org = await c.env.BRIEFINGS_DB.prepare('SELECT id FROM organizations WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>();

  if (!org) {
    return notFound(c, 'Organization not found');
  }

  const isMember = await isOrgMember(c.env.BRIEFINGS_DB, org.id, user.id);
  if (!isMember) {
    return forbidden(c, 'Forbidden');
  }

  const members = await getOrgMembers(c.env.BRIEFINGS_DB, org.id);
  return c.json({ members });
});

orgs.post('/:slug/members', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c, 'Unauthorized');

  const slug = c.req.param('slug');
  const body = await c.req.json<{ email: string; role?: 'admin' | 'member' | 'viewer' }>();

  const org = await c.env.BRIEFINGS_DB.prepare('SELECT id FROM organizations WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>();

  if (!org) {
    return notFound(c, 'Organization not found');
  }

  const isMember = await isOrgMember(c.env.BRIEFINGS_DB, org.id, user.id);
  if (!isMember) {
    return forbidden(c, 'Forbidden');
  }

  const targetUser = await c.env.BRIEFINGS_DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(body.email.toLowerCase())
    .first<{ id: string }>();

  if (!targetUser) {
    return notFound(c, 'User not found');
  }

  const result = await addOrgMember(c.env.BRIEFINGS_DB, org.id, targetUser.id, body.role || 'member');

  if ('error' in result) {
    return conflict(c, result.error);
  }

  return c.json({ ok: true });
});

orgs.delete('/:slug/members/:userId', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c, 'Unauthorized');

  const slug = c.req.param('slug');
  const userId = c.req.param('userId');

  const org = await c.env.BRIEFINGS_DB.prepare('SELECT id FROM organizations WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>();

  if (!org) {
    return notFound(c, 'Organization not found');
  }

  const isMember = await isOrgMember(c.env.BRIEFINGS_DB, org.id, user.id);
  if (!isMember) {
    return forbidden(c, 'Forbidden');
  }

  await removeOrgMember(c.env.BRIEFINGS_DB, org.id, userId);
  return c.json({ ok: true });
});

export default orgs;
