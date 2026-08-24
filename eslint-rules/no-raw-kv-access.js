/**
 * ESLint rule: no-raw-kv-access
 *
 * Locks in the KV→Cache-API migration (see CLAUDE.md "KV policy — Cache API
 * first"). Raw Workers KV operations are DEFAULT-DENIED outside the files
 * listed in the rule's `allowFiles` option (configured in eslint.config.js).
 *
 * Why: every hot request path must serve from the free per-colo Cache API
 * (shared helpers: kvBackedGet/kvBackedPut in api/src/lib/route-cache.ts,
 * readLastGood/writeLastGood in api/src/lib/lastgood.ts, routeCacheGet/Put,
 * kvBulkGetText). Raw KV access in a new route silently reintroduces the
 * per-request KV reads/writes this migration removed — free-plan quota is
 * 1k writes/day platform-wide.
 *
 * What stays on KV by design (allowlisted): cross-colo correctness state
 * (bot offsets, one-time secrets, dedup/idempotency markers, queue
 * cooldowns), upstream-outage last-good durability layers, cron/admin sync
 * pipelines, and the shared helper modules themselves.
 *
 * Flags:
 *   KV_CACHE.get(...)        CASE_STUDIES.put(...)
 *   const kv = c.env.KV_CACHE; kv.list({...})   ← tracked local aliases
 *
 * Not flagged: caches.default access, D1 (BRIEFINGS_DB), the helper libs.
 */

const KV_BINDING_NAMES = new Set(['KV_CACHE', 'CASE_STUDIES']);
const KV_METHODS = new Set(['get', 'put', 'delete', 'list', 'getWithMetadata']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw Workers KV operations outside the Cache-API-first allowlist (CLAUDE.md KV policy)',
      category: 'Best Practices',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowFiles: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawKv:
        'Raw KV {{method}}() on "{{binding}}" — use the Cache-API-first helpers instead (kvBackedGet/kvBackedPut from lib/route-cache, readLastGood/writeLastGood from lib/lastgood, kvBulkGetText from lib/safe-catch). If this file legitimately needs direct KV (cross-colo state / last-good durability / cron sync), add it to allowFiles in eslint.config.js.',
    },
  },

  create(context) {
    const filename = context.filename.replace(/\\/g, '/');
    /** @type {{ allowFiles?: string[] }} */
    const opts = context.options[0] ?? {};
    const allowFiles = opts.allowFiles ?? [];

    if (allowFiles.some((pattern) => minimatchLike(filename, pattern))) return {};

    // Local aliases: `const kv = env.KV_CACHE` / `x = c.env.CASE_STUDIES`.
    const kvAliases = new Set();

    return {
      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          node.init?.type === 'MemberExpression' &&
          !node.init.computed &&
          node.init.property.type === 'Identifier' &&
          KV_BINDING_NAMES.has(node.init.property.name)
        ) {
          kvAliases.add(node.id.name);
        }
      },
      MemberExpression(node) {
        if (node.computed || node.property.type !== 'Identifier') return;
        if (!KV_METHODS.has(node.property.name)) return;

        const obj = node.object;
        let bindingName = null;

        if (obj.type === 'Identifier') {
          if (KV_BINDING_NAMES.has(obj.name)) bindingName = obj.name;
          else if (kvAliases.has(obj.name)) bindingName = obj.name;
        } else if (obj.type === 'MemberExpression' && !obj.computed && obj.property.type === 'Identifier') {
          // e.g. c.env.KV_CACHE.get(...), ctx.env.CASE_STUDIES.put(...)
          if (KV_BINDING_NAMES.has(obj.property.name)) bindingName = obj.property.name;
        }

        if (bindingName) {
          context.report({
            node,
            messageId: 'rawKv',
            data: { method: node.property.name, binding: bindingName },
          });
        }
      },
    };
  },
};

/**
 * Minimal glob matcher for allowlist patterns. Filenames arrive ABSOLUTE
 * (/repo/api/src/...), while patterns are repo-relative — anchoring with
 * (^|/) makes both forms match. Supports `**` (any segments, incl. none)
 * and `*` (within one segment). Avoids a dependency in the rules bundle.
 */
function minimatchLike(path, pattern) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    '(^|/)' +
      esc
        .replace(/\*\*/g, '\u0000ANY\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000ANY\u0000/g, '.*') +
      '$'
  );
  return re.test(path);
}
