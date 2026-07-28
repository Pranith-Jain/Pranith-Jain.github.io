import { describe, it, expect } from 'vitest';
import { createVersionedReport, addVersion, getVersion, getVersionDiff } from '../../src/lib/agent/report-versioning';

describe('report-versioning', () => {
  it('starts empty at version 0', () => {
    const vr = createVersionedReport('inv-1');
    expect(vr.versions).toEqual([]);
    expect(vr.currentVersion).toBe(0);
  });

  it('numbers versions sequentially and tracks current', () => {
    let vr = createVersionedReport('inv-1');
    vr = addVersion(vr, 'draft one', { qualityScore: 55, modelUsed: 'm1', reason: 'initial' });
    vr = addVersion(vr, 'draft two', { qualityScore: 80, modelUsed: 'm2', reason: 'correction' });
    expect(vr.currentVersion).toBe(2);
    expect(getVersion(vr, 1)?.report).toBe('draft one');
    expect(getVersion(vr, 2)?.qualityScore).toBe(80);
    expect(getVersion(vr, 3)).toBeNull();
  });

  it('diffs two versions line-by-line with add/delete counts', () => {
    let vr = createVersionedReport('inv-1');
    vr = addVersion(vr, 'line1\nline2\nline3', { qualityScore: 50, modelUsed: 'm1', reason: 'a' });
    vr = addVersion(vr, 'line1\nCHANGED\nline3\nline4', { qualityScore: 75, modelUsed: 'm2', reason: 'b' });
    const diff = getVersionDiff(vr, 1, 2);
    expect(diff).not.toBeNull();
    expect(diff!.fromScore).toBe(50);
    expect(diff!.toScore).toBe(75);
    expect(diff!.additions).toBeGreaterThanOrEqual(2);
    expect(diff!.deletions).toBeGreaterThanOrEqual(1);
  });

  it('returns null diff for missing versions', () => {
    const vr = createVersionedReport('inv-1');
    expect(getVersionDiff(vr, 1, 2)).toBeNull();
  });
});
