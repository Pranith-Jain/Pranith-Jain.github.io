/**
 * Minimal YAML parser for upstream svg-widgets.yaml manifests.
 *
 * Upstream manifests are very simple: 2-space indent, top-level keys
 * (canvas, palette, widgets), nested objects, and an array of widgets
 * each with their own fields. We don't need to handle anchors,
 * references, multi-line strings, or flow style — the manifest schema
 * is regular and well-known.
 *
 * If the parser encounters anything it can't handle, it throws and the
 * caller should fall back to the MCP tool si_render_svg which expects
 * a JSON manifest.
 *
 * NOT a general YAML parser. Use js-yaml for that.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export class MiniYamlError extends Error {
  constructor(
    msg: string,
    public line: number
  ) {
    super(`YAML parse error at line ${line}: ${msg}`);
  }
}

export function parseMiniYaml(src: string): Json {
  const lines = src.split(/\r?\n/);
  let pos = 0;

  function peek(): string | undefined {
    while (pos < lines.length && /^\s*(#|$)/.test(lines[pos]!)) pos++;
    return lines[pos]!;
  }

  function indentOf(line: string): number {
    const m = /^(\s*)/.exec(line);
    return m ? m[1]!.length : 0;
  }

  function parseValue(raw: string | undefined, line: number): Json {
    // Strip trailing inline comments first (whitespace + # to EOL), but only
    // if the # is OUTSIDE of any quoted substring. Without this guard, a
    // value like `"foo # bar"` would be incorrectly truncated at the #.
    let v = (raw ?? '').trim();
    let inQuote: '"' | "'" | null = null;
    let commentStart = -1;
    for (let i = 0; i < v.length; i++) {
      const c = v[i];
      if (inQuote) {
        if (c === inQuote) inQuote = null;
      } else if (c === '"' || c === "'") {
        inQuote = c as '"' | "'";
      } else if (c === '#' && (i === 0 || /\s/.test(v[i - 1] ?? ''))) {
        commentStart = i;
        break;
      }
    }
    if (commentStart >= 0) v = v.slice(0, commentStart).trimEnd();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    if (v.startsWith('[') && v.endsWith(']')) {
      const inner = v.slice(1, -1).trim();
      if (inner === '') return [];
      return inner.split(',').map((x) => parseValue(x.trim(), line));
    }
    if (v.startsWith('{') && v.endsWith('}')) {
      const inner = v.slice(1, -1).trim();
      if (inner === '') return {};
      // Null-proto accumulator: untrusted keys like `__proto__`/`constructor`
      // become harmless own properties instead of polluting Object.prototype.
      const out: Record<string, Json> = Object.create(null);
      for (const part of inner.split(',')) {
        const m = /^([^:]+):(.*)$/.exec(part.trim());
        if (!m || !m[1] || m[2] === undefined) throw new MiniYamlError(`bad flow-style mapping: "${part}"`, line);
        out[m[1]!.trim()] = parseValue(m[2]!.trim(), line);
      }
      return out;
    }
    return v;
  }

  function parseBlock(parentIndent: number): Json {
    // Null-proto accumulator: untrusted keys like `__proto__`/`constructor`
    // become harmless own properties instead of polluting Object.prototype.
    const obj: Record<string, Json> = Object.create(null);
    while (pos < lines.length) {
      const line = lines[pos]!;
      if (/^\s*(#|$)/.test(line)) {
        pos++;
        continue;
      }
      const ind = indentOf(line);
      if (ind < parentIndent) break;
      if (ind > parentIndent) {
        throw new MiniYamlError(`unexpected indent at "${line}"`, pos + 1);
      }
      // key: value | key:
      const m = /^(\s*)([^:]+):(\s|$)(.*)$/.exec(line);
      if (!m) {
        pos++;
        continue;
      }
      const key = m[2]!.trim();
      const rest = m[4];
      pos++;
      if (rest === '') {
        // Nested block or list. Look ahead to decide.
        const next = peek();
        if (next === undefined) {
          obj[key] = {};
        } else {
          const nextInd = indentOf(next);
          if (nextInd <= ind) {
            obj[key] = null;
          } else {
            // Look at the first content char to see if it's a list ('-') or object.
            const nextTrim = next.replace(/^\s+/, '');
            if (nextTrim.startsWith('- ')) {
              obj[key] = parseList(nextInd);
            } else {
              obj[key] = parseBlock(nextInd);
            }
          }
        }
      } else if (rest === '|' || rest === '>' || /^\|[+-]?$/.test(rest ?? '') || /^>[+-]?$/.test(rest ?? '')) {
        // Block-literal (`|`) or block-folded (`>`) scalar indicator. Consume
        // all subsequent lines indented strictly more than `ind` as a single
        // string. We don't honour chomping indicators (|-, |+, >-, >+) — all
        // trailing newlines are stripped. This is enough to swallow the
        // `field_mapping_notes: |` block at the tail of upstream skill
        // manifests, which the render path doesn't need but the naive parser
        // would otherwise trip on with "unexpected indent".
        const literal: string[] = [];
        const blockInd = ind + 2;
        while (pos < lines.length) {
          const cur = lines[pos]!;
          if (/^\s*(#|$)/.test(cur)) {
            pos++;
            continue;
          }
          const curInd = indentOf(cur);
          if (curInd < blockInd) break;
          literal.push(cur.slice(blockInd));
          pos++;
        }
        obj[key] = literal.join('\n').replace(/\n+$/, '');
      } else {
        obj[key] = parseValue(rest, pos);
      }
    }
    return obj;
  }

  function parseList(itemIndent: number): Json[] {
    const arr: Json[] = [];
    while (pos < lines.length) {
      const line = lines[pos]!;
      if (/^\s*(#|$)/.test(line)) {
        pos++;
        continue;
      }
      const ind = indentOf(line);
      if (ind < itemIndent) break;
      if (ind > itemIndent) {
        throw new MiniYamlError(`unexpected indent in list at "${line}"`, pos + 1);
      }
      const trimmed = line.trim();
      if (!trimmed.startsWith('- ')) break;
      const afterDash = trimmed.slice(2);
      pos++;
      if (afterDash === '') {
        // Nested block under "-".
        const next = peek();
        if (next === undefined) {
          arr.push({});
          continue;
        }
        const nextInd = indentOf(next);
        if (nextInd <= ind) {
          arr.push({});
          continue;
        }
        arr.push(parseBlock(nextInd));
      } else {
        // Could be "- key: value" or "- value".
        const m = /^([^:]+):(\s|$)(.*)$/.exec(afterDash);
        if (m) {
          // Inline mapping start; build object from this + following indent.
          const obj: Record<string, Json> = { [m[1]!.trim()]: m[3] ? parseValue(m[3], pos) : null };
          // Consume remaining sibling keys at the same indent.
          const thisItemIndent = indentOf(line);
          while (pos < lines.length) {
            const nl = lines[pos]!;
            if (/^\s*(#|$)/.test(nl)) {
              pos++;
              continue;
            }
            const nlInd = indentOf(nl);
            const nlTrim = nl.trim();
            if (nlInd !== thisItemIndent + 2) break;
            if (nlTrim.startsWith('- ')) break;
            const nm = /^([^:]+):(\s|$)(.*)$/.exec(nlTrim);
            if (!nm) break;
            pos++;
            if (nm[3] === '') {
              const nn = peek();
              if (nn !== undefined) {
                const nnInd = indentOf(nn);
                if (nnInd > thisItemIndent + 2) {
                  if (nn.replace(/^\s+/, '').startsWith('- ')) obj[nm[1]!.trim()] = parseList(nnInd);
                  else obj[nm[1]!.trim()] = parseBlock(nnInd);
                  continue;
                }
              }
              obj[nm[1]!.trim()] = null;
            } else {
              obj[nm[1]!.trim()] = parseValue(nm[3] ?? '', pos);
            }
          }
          arr.push(obj);
        } else {
          arr.push(parseValue(afterDash, pos));
        }
      }
    }
    return arr;
  }

  const result = parseBlock(0);
  return result;
}
