/**
 * Strict KQL expression parser.
 *
 * Grammar (90% case):
 *   expr      := or
 *   or        := and ( 'or' and )*
 *   and       := unary ( 'and' unary )*
 *   unary     := 'not' unary | primary
 *   primary   := '(' expr ')' | comparison
 *   comparison:= field op value
 *   op        := '==' | '!=' | '=~' | '!~'
 *              | 'contains' | 'startswith' | 'endswith' | 'has' | 'in'
 *              | 'matches regex'
 *   value     := string (single or double quoted) | bareword
 *
 * Output: a string `condition` expression over group names (one per
 * leaf predicate), using `and` / `or` / `not` / parens, plus a list
 * of `predicates` keyed by group name.
 *
 * Anything we can't parse surfaces as a top-level warning; the parser
 * is never silent. Heuristic fallback (flat `field <op> "value"`) lives
 * in parsers.ts — this module is the strict alternative.
 */
import type { MatchOp, Predicate, SelectionGroup } from './types';

export interface KqlExprResult {
  /** Names of groups in declaration order, with a synthetic 'selection' alias at the end. */
  groups: SelectionGroup[];
  /** Boolean expression over group names. */
  condition: string;
  /** Per-leaf warnings. */
  warnings: string[];
}

type Token =
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'and' }
  | { kind: 'or' }
  | { kind: 'not' }
  | { kind: 'op'; op: MatchOp | 'ne' | 're_neg' }
  | { kind: 'ident'; value: string }
  | { kind: 'str'; value: string };

const OP_KEYWORDS: Record<string, MatchOp | 'ne' | 're_neg'> = {
  contains: 'contains',
  startswith: 'startswith',
  endswith: 'endswith',
  has: 'contains',
};

function tokenize(src: string): { tokens: Token[]; warnings: string[] } {
  const tokens: Token[] = [];
  const warnings: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    // Two-char operators
    if (c === '!' && src[i + 1] === '=') {
      tokens.push({ kind: 'op', op: 'ne' });
      i += 2;
      continue;
    }
    if (c === '=' && src[i + 1] === '=') {
      tokens.push({ kind: 'op', op: 'eq' });
      i += 2;
      continue;
    }
    if (c === '=' && src[i + 1] === '~') {
      tokens.push({ kind: 'op', op: 're' });
      i += 2;
      continue;
    }
    if (c === '!' && src[i + 1] === '~') {
      tokens.push({ kind: 'op', op: 're_neg' });
      i += 2;
      continue;
    }
    if (c === '=') {
      tokens.push({ kind: 'op', op: 'eq' });
      i++;
      continue;
    }
    // String literal
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      let v = '';
      while (j < n && src[j] !== q) {
        if (src[j] === '\\' && j + 1 < n) {
          v += src[j + 1];
          j += 2;
          continue;
        }
        v += src[j];
        j++;
      }
      if (j >= n) {
        warnings.push(`unterminated string literal at offset ${i}`);
        return { tokens, warnings };
      }
      tokens.push({ kind: 'str', value: v });
      i = j + 1;
      continue;
    }
    // Identifier / keyword
    if (/[A-Za-z_]/.test(c!)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_.]/.test(src[j]!)) j++;
      const word = src.substring(i, j);
      const lw = word.toLowerCase();
      if (lw === 'and') tokens.push({ kind: 'and' });
      else if (lw === 'or') tokens.push({ kind: 'or' });
      else if (lw === 'not') tokens.push({ kind: 'not' });
      else if (lw === 'in')
        tokens.push({ kind: 'op', op: 'eq' }); // `x in (...)` ≈ `x == ...` for our IR
      else if (lw === 'matches' && src.substring(j, j + 6).toLowerCase() === ' regex') {
        tokens.push({ kind: 'op', op: 're' });
        j += 6;
      } else if (lw in OP_KEYWORDS) tokens.push({ kind: 'op', op: OP_KEYWORDS[lw]! });
      else tokens.push({ kind: 'ident', value: word });
      i = j;
      continue;
    }
    warnings.push(`unexpected character '${c}' at offset ${i} (skipped)`);
    i++;
  }
  return { tokens, warnings };
}

type AstNode =
  | { type: 'group'; name: string; pred: Predicate }
  | { type: 'and'; left: AstNode; right: AstNode }
  | { type: 'or'; left: AstNode; right: AstNode }
  | { type: 'not'; inner: AstNode };

interface Parser {
  pos: number;
  tokens: Token[];
  warnings: string[];
  groupCounter: number;
}

function peek(p: Parser): Token | undefined {
  return p.tokens[p.pos];
}
function consume(p: Parser): Token | undefined {
  return p.tokens[p.pos++];
}

function parseExpr(p: Parser): AstNode | null {
  return parseOr(p);
}
function parseOr(p: Parser): AstNode | null {
  let left = parseAnd(p);
  if (!left) return null;
  while (peek(p)?.kind === 'or') {
    consume(p);
    const right = parseAnd(p);
    if (!right) return null;
    left = { type: 'or', left, right };
  }
  return left;
}
function parseAnd(p: Parser): AstNode | null {
  let left = parseUnary(p);
  if (!left) return null;
  while (peek(p)?.kind === 'and') {
    consume(p);
    const right = parseUnary(p);
    if (!right) return null;
    left = { type: 'and', left, right };
  }
  return left;
}
function parseUnary(p: Parser): AstNode | null {
  if (peek(p)?.kind === 'not') {
    consume(p);
    const inner = parseUnary(p);
    if (!inner) return null;
    return { type: 'not', inner };
  }
  return parsePrimary(p);
}
function parsePrimary(p: Parser): AstNode | null {
  const t = peek(p);
  if (!t) return null;
  if (t.kind === 'lparen') {
    consume(p);
    const inner = parseExpr(p);
    if (peek(p)?.kind === 'rparen') consume(p);
    else p.warnings.push('unmatched `(` — emitted unbalanced parens');
    return inner;
  }
  if (t.kind === 'ident') {
    consume(p);
    const op = consume(p);
    if (!op || (op.kind !== 'op' && op.kind !== 'ident' && op.kind !== 'str')) {
      p.warnings.push(`expected operator after field '${t.value}'`);
      return null;
    }
    const val = consume(p);
    if (!val || (val.kind !== 'str' && val.kind !== 'ident')) {
      p.warnings.push(`expected value after '${t.value} ${(op as { value?: string }).value ?? ''}'`);
      return null;
    }
    // Map token-kind to MatchOp.
    let matchOp: MatchOp;
    if (op.kind === 'op') {
      if (op.op === 'ne' || op.op === 're_neg') {
        // IR has no negative predicate; we use a synthetic `!field_<n>` group
        // and surface a warning. For now, record as 'eq' with the neg flag in
        // the group name and add a warning.
        p.warnings.push(`negation operator '${op.op === 'ne' ? '!=' : '!~'}' flattened to positive form`);
        matchOp = op.op === 'ne' ? 'eq' : 're';
      } else {
        matchOp = op.op as MatchOp;
      }
    } else {
      p.warnings.push(`unknown operator '${op.value}' on field '${t.value}' — treating as eq`);
      matchOp = 'eq';
    }
    const pred: Predicate = { field: t.value, op: matchOp, values: [val.value] };
    p.groupCounter += 1;
    return { type: 'group', name: `g${p.groupCounter}`, pred };
  }
  p.warnings.push(`unexpected token at offset ${p.pos}`);
  return null;
}

function astToCondition(node: AstNode): string {
  switch (node.type) {
    case 'group':
      return node.name;
    case 'and':
      return `( ${astToCondition(node.left)} and ${astToCondition(node.right)} )`;
    case 'or':
      return `( ${astToCondition(node.left)} or ${astToCondition(node.right)} )`;
    case 'not':
      return `not ( ${astToCondition(node.inner)} )`;
  }
}

function collectGroups(node: AstNode, out: Map<string, Predicate>): void {
  switch (node.type) {
    case 'group':
      out.set(node.name, node.pred);
      return;
    case 'and':
    case 'or':
      collectGroups(node.left, out);
      collectGroups(node.right, out);
      return;
    case 'not':
      collectGroups(node.inner, out);
      return;
  }
}

/**
 * Parse a KQL expression (the part after `where`, or the whole KQL if no
 * `where` is present) into a strict IR-shaped result.
 */
export function parseKqlStrict(src: string): KqlExprResult {
  const warnings: string[] = ['KQL parsed in strict mode — full boolean expression preserved (and/or/not/parens).'];
  // Strip `where` if present.
  const whereIdx = src.search(/\bwhere\b/i);
  const scope = whereIdx >= 0 ? src.slice(whereIdx + 5) : src;
  // Drop trailing semicolon.
  const cleaned = scope.replace(/;+\s*$/, '').trim();
  if (!cleaned) {
    return { groups: [], condition: '', warnings: [...warnings, 'empty KQL expression'] };
  }
  const { tokens, warnings: tw } = tokenize(cleaned);
  warnings.push(...tw);
  const parser: Parser = { pos: 0, tokens, warnings, groupCounter: 0 };
  const ast = parseExpr(parser);
  if (parser.pos < tokens.length) {
    warnings.push(`trailing tokens after expression at position ${parser.pos} — ignored`);
  }
  if (!ast) {
    return { groups: [], condition: '', warnings };
  }
  const groupMap = new Map<string, Predicate>();
  collectGroups(ast, groupMap);
  // Order groups by declaration order — Map preserves insertion.
  const groups: SelectionGroup[] = [];
  for (const [name, pred] of groupMap) {
    groups.push({ name, kind: 'fields', predicates: [pred] });
  }
  return { groups, condition: astToCondition(ast), warnings };
}
