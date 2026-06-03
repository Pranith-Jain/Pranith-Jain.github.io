import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeaturesState } from '../../../lib/features';

// Drive useFeatures() per-test via a mutable value; keep the real
// toolVisible helper so we exercise the actual gating logic.
let mockFeatures: FeaturesState = { cape: false, recon: false, loaded: true };
vi.mock('../../../lib/features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/features')>();
  return { ...actual, useFeatures: () => mockFeatures };
});

import { ToolGrid } from '../ToolGrid';

function renderGrid() {
  return render(
    <MemoryRouter>
      <ToolGrid />
    </MemoryRouter>
  );
}

describe('ToolGrid dormant-tool gating', () => {
  beforeEach(() => {
    mockFeatures = { cape: false, recon: false, loaded: true };
  });

  it('hides CAPE Sandbox and Recon Bridge when the bridges are unconfigured', () => {
    renderGrid();
    // A normal, always-on tool still renders…
    expect(screen.getByText('Malware Scanner')).toBeInTheDocument();
    // …but the dormant self-hosted bridges do not.
    expect(screen.queryByText('CAPE Sandbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Recon Bridge')).not.toBeInTheDocument();
  });

  it('shows each tool once its matching flag is enabled', () => {
    mockFeatures = { cape: true, recon: true, loaded: true };
    renderGrid();
    expect(screen.getByText('CAPE Sandbox')).toBeInTheDocument();
    expect(screen.getByText('Recon Bridge')).toBeInTheDocument();
  });

  it('gates each flag independently', () => {
    mockFeatures = { cape: true, recon: false, loaded: true };
    renderGrid();
    expect(screen.getByText('CAPE Sandbox')).toBeInTheDocument();
    expect(screen.queryByText('Recon Bridge')).not.toBeInTheDocument();
  });
});
