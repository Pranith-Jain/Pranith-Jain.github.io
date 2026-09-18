import { describe, it, expect } from 'vitest';
import {
  parsePostgrestQuery,
  parseFiniteInt,
  isSafeSqlIdentifier,
  resolveColumn,
  buildWhereClause,
  buildSelectQuery,
} from '../../src/lib/postgrest-filter';

const MAP = { title: 'title', created_at: 'created_at', api_name: 'real_col' };

describe('isSafeSqlIdentifier', () => {
  it('accepts bare identifiers', () => {
    expect(isSafeSqlIdentifier('created_at')).toBe(true);
    expect(isSafeSqlIdentifier('b')).toBe(true);
    expect(isSafeSqlIdentifier('_x1')).toBe(true);
  });

  it('rejects injection shapes', () => {
    for (const bad of ['x DESC; DROP TABLE t; --', 'x.y', 'x"', "x'", 'x`', 'x ', ' x', '1x', '', 'x-y', 'x(y)', '*']) {
      expect(isSafeSqlIdentifier(bad)).toBe(false);
    }
  });
});

describe('parseFiniteInt', () => {
  it('parses non-negative ints', () => {
    expect(parseFiniteInt('10')).toBe(10);
    expect(parseFiniteInt('0')).toBe(0);
  });

  it('rejects garbage that parseInt would partially accept or NaN', () => {
    expect(parseFiniteInt('abc')).toBeUndefined();
    expect(parseFiniteInt('')).toBeUndefined();
    expect(parseFiniteInt(null)).toBeUndefined();
    expect(parseFiniteInt('-5')).toBeUndefined();
    expect(parseFiniteInt('1.5')).toBeUndefined();
    expect(parseFiniteInt('99999999999')).toBeUndefined();
  });
});

describe('parsePostgrestQuery order/limit hardening', () => {
  it('normalizes order direction case-insensitively, defaults garbage to asc', () => {
    expect(parsePostgrestQuery(new URLSearchParams('order=created_at.DESC')).order).toEqual({
      column: 'created_at',
      dir: 'desc',
    });
    expect(parsePostgrestQuery(new URLSearchParams('order=created_at')).order).toEqual({
      column: 'created_at',
      dir: 'asc',
    });
    // Raw SQL in the direction slot must not survive parsing.
    expect(parsePostgrestQuery(new URLSearchParams('order=created_at.desc; DROP TABLE x')).order?.dir).toBe('asc');
  });

  it('drops non-finite limit/offset instead of yielding NaN', () => {
    const q = parsePostgrestQuery(new URLSearchParams('limit=abc&offset=-3'));
    expect(q.limit).toBeUndefined();
    expect(q.offset).toBeUndefined();
    expect(parsePostgrestQuery(new URLSearchParams('limit=25&offset=5'))).toMatchObject({
      limit: 25,
      offset: 5,
    });
  });
});

describe('resolveColumn', () => {
  it('maps known columns, rejects unknown ones', () => {
    expect(resolveColumn(MAP, 'title')).toBe('title');
    expect(resolveColumn(MAP, 'api_name')).toBe('real_col');
    expect(resolveColumn(MAP, 'nope')).toBeNull();
    expect(resolveColumn(MAP, 'title; DROP TABLE t')).toBeNull();
  });

  it('rejects unsafe mapped values even when the key is known', () => {
    expect(resolveColumn({ evil: 'x DESC --' }, 'evil')).toBeNull();
  });
});

describe('buildWhereClause', () => {
  it('drops filters on unknown columns (fail closed)', () => {
    const { sql, bindings } = buildWhereClause(
      [
        { column: 'title', op: 'eq', value: 'x' },
        { column: '1 = 1; --', op: 'eq', value: 'y' },
      ],
      'b',
      MAP
    );
    expect(sql).toBe('WHERE b.title = ?');
    expect(bindings).toEqual(['x']);
  });

  it('turns empty IN lists into a match-nothing clause instead of IN ()', () => {
    const { sql } = buildWhereClause([{ column: 'title', op: 'in', value: [] }], 'b', MAP);
    expect(sql).toBe('WHERE 1 = 0');
  });

  it('binds values while interpolating only allowlisted columns', () => {
    const { sql, bindings } = buildWhereClause([{ column: 'created_at', op: 'gte', value: '2026-01-01' }], 'b', MAP);
    expect(sql).toBe('WHERE b.created_at >= ?');
    expect(bindings).toEqual(['2026-01-01']);
  });
});

describe('buildSelectQuery', () => {
  it('falls back to default select when all requested columns are unknown', () => {
    const { sql } = buildSelectQuery(
      't',
      { filters: [], select: ['1 = 1; --'] },
      { tableAlias: 'b', columnMap: MAP, defaultSelect: ['id'] }
    );
    expect(sql).toBe('SELECT b.id FROM t b');
  });

  it('ignores unknown order columns and clamps non-finite limit/offset', () => {
    const { sql } = buildSelectQuery(
      't',
      {
        filters: [],
        order: { column: 'evil desc; --', dir: 'desc' },
        limit: Number.NaN,
        offset: Number.NaN,
      },
      { tableAlias: 'b', columnMap: MAP, defaultSelect: ['id'] }
    );
    expect(sql).toBe('SELECT b.id FROM t b');
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('LIMIT');
  });

  it('emits strict ASC/DESC and finite LIMIT/OFFSET for valid input', () => {
    const { sql, bindings } = buildSelectQuery(
      't',
      {
        filters: [{ column: 'title', op: 'eq', value: 'v' }],
        order: { column: 'created_at', dir: 'desc' },
        limit: 10,
        offset: 5,
      },
      { tableAlias: 'b', columnMap: MAP, defaultSelect: ['id'] }
    );
    expect(sql).toBe('SELECT b.id FROM t b WHERE b.title = ? ORDER BY b.created_at DESC LIMIT 10 OFFSET 5');
    expect(bindings).toEqual(['v']);
  });
});
