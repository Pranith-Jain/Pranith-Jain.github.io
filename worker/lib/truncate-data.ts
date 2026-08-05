/**
 * Budget-aware JSON truncation for persisted tool-result data.
 *
 * Used by `InvestigatorAgentDO.persist()` to keep `agent_sessions.steps_json`
 * within a char budget. The previous implementation sliced the serialized
 * JSON at an arbitrary char boundary and hoped `JSON.parse` would recover —
 * it almost never does (mid-string cuts produce unparseable JSON), so large
 * tool results were silently replaced by a `{ _truncated, _preview }` stub.
 *
 * This implementation truncates at the structural level (drops trailing
 * object keys or array entries) so the result is ALWAYS valid JSON. A future
 * replay/debug feature that reads `steps_json` back will get honest partial
 * data instead of a parse failure.
 */

/**
 * Truncate JSON-serializable data to a max char budget WITHOUT slicing
 * mid-string (which produces unparseable JSON).
 *
 * Strategy: if the serialized form fits, return as-is. Otherwise, walk the
 * top-level object/array and drop trailing entries (or, for objects, the
 * last keys) until the budget is met, always re-stringifying to guarantee
 * valid JSON. If the structure itself can't fit (a single huge primitive),
 * return an explicit `{ _truncated, _original_chars, _summary }` stub so
 * downstream consumers never receive malformed JSON.
 *
 * Note on arrays: a truncated array is wrapped in
 * `{ _truncated_array: [...kept], _truncated_entries: N }` rather than
 * attaching a named prop to the array (which `JSON.stringify` silently
 * drops). This keeps the truncation marker visible after serialization.
 */
export function truncateData(data: unknown, maxChars: number): unknown {
  const json = JSON.stringify(data);
  if (json.length <= maxChars) return data;

  // Object: drop trailing keys until it fits.
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    for (let keep = keys.length - 1; keep >= 0; keep--) {
      const slimmed: Record<string, unknown> = {};
      for (let i = 0; i < keep; i++) slimmed[keys[i]!] = obj[keys[i]!];
      slimmed['_truncated_keys'] = keys.slice(keep);
      const candidate = JSON.stringify(slimmed);
      if (candidate.length <= maxChars) return slimmed;
    }
  }

  // Array: drop trailing entries until it fits. Wrap in an object so the
  // truncation marker survives JSON.stringify (named props on arrays are
  // dropped by the serializer).
  if (Array.isArray(data)) {
    for (let keep = data.length - 1; keep >= 0; keep--) {
      const wrapper = { _truncated_array: data.slice(0, keep), _truncated_entries: data.length - keep };
      const candidate = JSON.stringify(wrapper);
      if (candidate.length <= maxChars) return wrapper;
    }
  }

  // Single huge primitive, or object/array that can't fit even empty —
  // return an explicit stub. Cap _summary so the WHOLE stub fits the budget.
  // Because _summary is re-encoded by JSON.stringify (wrapping quotes +
  // escapes for any embedded quotes/backslashes in the raw json), compute the
  // cap by measuring the actual serialized stub length and shrinking until it
  // fits — exact, no off-by-one from digit-count or escape-count estimation.
  const stubBase = { _truncated: true, _original_chars: json.length };
  let summaryLen = Math.min(500, Math.max(0, maxChars - JSON.stringify({ ...stubBase, _summary: '' }).length));
  while (summaryLen > 0) {
    const stub = { ...stubBase, _summary: json.slice(0, summaryLen) };
    if (JSON.stringify(stub).length <= maxChars) return stub;
    summaryLen -= 1;
  }
  return { ...stubBase, _summary: '' };
}
