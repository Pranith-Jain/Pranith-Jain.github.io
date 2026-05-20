/**
 * Rule converter — heuristic, any-to-any detection translation.
 *
 *     source text ──parse──▶ RuleIR ──emit──▶ target text
 *
 * This barrel exposes the public surface: `convertRule` and every type / table
 * a UI needs (RuleFormat list, FORMAT_LABELS, ConvertResult). Each side of the
 * pipeline lives in a focused module:
 *
 *   types.ts     — IR + format tables + small shared helpers
 *   parsers.ts   — text → IR (Sigma faithful; rest regex-heuristic)
 *   emitters.ts  — IR → text (Sigma/KQL/SPL/Lucene/EQL/YARA/DLP/supply-chain)
 *
 * Pure module — no DOM / no network — so it stays unit-testable in isolation.
 */

import { FORMAT_LABELS, uniq, type ConvertResult, type RuleFormat, type RuleIR } from './types';
import {
  parseDlp,
  parseEql,
  parseKql,
  parseLucene,
  parseSigma,
  parseSplunk,
  parseSupplychain,
  parseYara,
} from './parsers';
import { emitDlp, emitEql, emitKql, emitLucene, emitSigma, emitSplunk, emitSupplyChain, emitYara } from './emitters';

export {
  FORMAT_LABELS,
  SOURCE_FORMATS,
  TARGET_FORMATS,
  type ConvertResult,
  type Predicate,
  type RuleFormat,
  type RuleIR,
  type SelectionGroup,
  type MatchOp,
} from './types';

const PARSERS: Record<RuleFormat, (s: string) => RuleIR | { error: string }> = {
  sigma: parseSigma,
  kql: parseKql,
  splunk: parseSplunk,
  lucene: parseLucene,
  eql: parseEql,
  yara: parseYara,
  dlp: parseDlp,
  supplychain: parseSupplychain,
};

export function convertRule(src: string, from: RuleFormat, to: RuleFormat): ConvertResult {
  if (!src.trim()) return { ok: false, error: 'empty input' };

  const ir = PARSERS[from](src);
  if ('error' in ir) return { ok: false, error: ir.error };

  const warnings = [...ir.warnings];
  if (from !== 'sigma') warnings.unshift(`${FORMAT_LABELS[from]} → IR is heuristic; verify the result.`);
  if (from === to) warnings.push('Source and target are the same format — output is a normalised round-trip.');

  try {
    let output: string;
    switch (to) {
      case 'sigma':
        output = emitSigma(ir);
        break;
      case 'kql':
        output = emitKql(ir);
        break;
      case 'splunk':
        output = emitSplunk(ir);
        break;
      case 'lucene':
        output = emitLucene(ir);
        break;
      case 'eql':
        output = emitEql(ir);
        warnings.push('EQL output omits sequence/time logic; it is a single-event `… where` expression.');
        break;
      case 'yara':
        output = emitYara(ir, warnings);
        break;
      case 'dlp':
        output = emitDlp(ir, warnings);
        break;
      case 'supplychain':
        output = emitSupplyChain(ir, warnings);
        break;
      default:
        return { ok: false, error: `unknown target format` };
    }
    return { ok: true, output, warnings: uniq(warnings) };
  } catch (e) {
    return { ok: false, error: `conversion failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
