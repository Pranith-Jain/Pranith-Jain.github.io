/**
 * Telegram Boolean Search Parser
 *
 * Parses boolean queries (AND/OR/NOT) with field qualifiers into SQL WHERE clauses.
 * Inspired by TraceOn.re's search syntax.
 *
 * Syntax:
 *   - General: "word1 word2" → OR match
 *   - Boolean: "word1 AND word2 NOT word3"
 *   - Field: "field:value" or "field:\"quoted value\""
 *   - Wildcard: "prefix*"
 *   - Exact phrase: "\"exact phrase\""
 *
 * Fields: text, channel.title, channel.username, sender.username, severity, leak_type
 */

export interface ParsedQuery {
  whereClause: string;
  params: string[];
}

type Token =
  | { type: 'term'; value: string }
  | { type: 'phrase'; value: string }
  | { type: 'field'; field: string; value: string; exact: boolean }
  | { type: 'operator'; op: 'AND' | 'OR' | 'NOT' };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const q = query.trim();

  while (i < q.length) {
    // Skip whitespace
    if (q[i] === ' ' || q[i] === '\t') {
      i++;
      continue;
    }

    // Operators (must be uppercase)
    if (q.substring(i, i + 3) === 'AND') {
      tokens.push({ type: 'operator', op: 'AND' });
      i += 3;
      continue;
    }
    if (q.substring(i, i + 2) === 'OR') {
      tokens.push({ type: 'operator', op: 'OR' });
      i += 2;
      continue;
    }
    if (q.substring(i, i + 3) === 'NOT') {
      tokens.push({ type: 'operator', op: 'NOT' });
      i += 3;
      continue;
    }

    // Quoted phrase
    if (q[i] === '"') {
      i++;
      let end = q.indexOf('"', i);
      if (end === -1) end = q.length;
      tokens.push({ type: 'phrase', value: q.substring(i, end) });
      i = end + 1;
      continue;
    }

    // Field qualifier: field:value or field:"value"
    const fieldMatch = q.substring(i).match(/^([a-zA-Z_][a-zA-Z0-9_.]*):/);
    if (fieldMatch) {
      const field = fieldMatch[1]!;
      i += fieldMatch[0].length;
      if (q[i] === '"') {
        i++;
        let end = q.indexOf('"', i);
        if (end === -1) end = q.length;
        tokens.push({ type: 'field', field, value: q.substring(i, end), exact: true });
        i = end + 1;
      } else {
        let end = i;
        while (end < q.length && q[end] !== ' ' && q[end] !== '\t') end++;
        tokens.push({ type: 'field', field, value: q.substring(i, end), exact: false });
        i = end;
      }
      continue;
    }

    // Plain term
    let end = i;
    while (end < q.length && q[end] !== ' ' && q[end] !== '\t') end++;
    tokens.push({ type: 'term', value: q.substring(i, end) });
    i = end;
  }

  return tokens;
}

function fieldToColumn(field: string): string | null {
  const map: Record<string, string> = {
    text: 'message_text',
    'channel.title': 'channel_handle',
    'channel.username': 'channel_handle',
    'channel.handle': 'channel_handle',
    'sender.username': 'channel_handle',
    severity: 'severity',
    leak_type: 'leak_type',
    domain: 'domains_found',
    domains: 'domains_found',
  };
  return map[field.toLowerCase()] || null;
}

function termToCondition(term: string, negated: boolean): { clause: string; param: string } {
  const not = negated ? 'NOT ' : '';
  if (term.includes('*')) {
    const prefix = term.replace(/\*/g, '');
    return {
      clause: `${not}(message_text LIKE ? OR channel_handle LIKE ? OR domains_found LIKE ?)`,
      param: `${prefix}%`,
    };
  }
  return { clause: `${not}(message_text LIKE ? OR channel_handle LIKE ? OR domains_found LIKE ?)`, param: `%${term}%` };
}

function phraseToCondition(phrase: string, negated: boolean): { clause: string; param: string } {
  const not = negated ? 'NOT ' : '';
  return {
    clause: `${not}(message_text LIKE ? OR channel_handle LIKE ? OR domains_found LIKE ?)`,
    param: `%${phrase}%`,
  };
}

function fieldToCondition(
  field: string,
  value: string,
  exact: boolean,
  negated: boolean
): { clause: string; param: string } | null {
  const col = fieldToColumn(field);
  if (!col) return null;
  const not = negated ? 'NOT ' : '';
  if (exact) {
    return { clause: `${not}${col} = ?`, param: value };
  }
  if (value.includes('*')) {
    return { clause: `${not}${col} LIKE ?`, param: value.replace(/\*/g, '%') };
  }
  return { clause: `${not}${col} LIKE ?`, param: `%${value}%` };
}

/**
 * Parse a boolean search query into a SQL WHERE clause.
 * Defaults to OR if no operators are specified.
 */
export function parseBooleanQuery(query: string): ParsedQuery {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { whereClause: '1=1', params: [] };
  }

  // If no operators, treat as OR (general search)
  const hasOps = tokens.some((t) => t.type === 'operator');
  if (!hasOps) {
    const conditions: string[] = [];
    const params: string[] = [];
    for (const t of tokens) {
      if (t.type === 'term') {
        const c = termToCondition(t.value, false);
        conditions.push(c.clause);
        params.push(c.param, c.param, c.param);
      } else if (t.type === 'phrase') {
        const c = phraseToCondition(t.value, false);
        conditions.push(c.clause);
        params.push(c.param, c.param, c.param);
      } else if (t.type === 'field') {
        const c = fieldToCondition(t.field, t.value, t.exact, false);
        if (c) {
          conditions.push(c.clause);
          params.push(c.param);
        }
      }
    }
    if (conditions.length === 0) return { whereClause: '1=1', params: [] };
    return { whereClause: `(${conditions.join(' OR ')})`, params };
  }

  // Boolean parsing with precedence: NOT > AND > OR
  // Build a simple expression tree
  const conditions: string[] = [];
  const andGroups: string[][] = [[]];
  const params: string[] = [];
  let currentNegated = false;

  for (const t of tokens) {
    if (t.type === 'operator') {
      if (t.op === 'NOT') {
        currentNegated = true;
      } else if (t.op === 'AND') {
        // AND keeps adding to current group
      } else if (t.op === 'OR') {
        andGroups.push([]);
      }
      continue;
    }

    let clause: string | null = null;

    if (t.type === 'term') {
      const c = termToCondition(t.value, currentNegated);
      clause = c.clause;
      params.push(c.param, c.param, c.param);
    } else if (t.type === 'phrase') {
      const c = phraseToCondition(t.value, currentNegated);
      clause = c.clause;
      params.push(c.param, c.param, c.param);
    } else if (t.type === 'field') {
      const c = fieldToCondition(t.field, t.value, t.exact, currentNegated);
      if (c) {
        clause = c.clause;
        params.push(c.param);
      }
    }

    if (clause) {
      const currentGroup = andGroups[andGroups.length - 1]!;
      currentGroup.push(clause);
    }

    currentNegated = false;
  }

  // Build final WHERE clause: OR groups of AND conditions
  const orParts = andGroups.filter((g) => g.length > 0).map((g) => `(${g.join(' AND ')})`);

  if (orParts.length === 0) return { whereClause: '1=1', params: [] };

  return {
    whereClause: orParts.join(' OR '),
    params,
  };
}
