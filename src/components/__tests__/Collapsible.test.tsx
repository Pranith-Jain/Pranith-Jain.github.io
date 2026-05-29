import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Collapsible } from '../ui/Collapsible';

describe('Collapsible', () => {
  it('renders title', () => {
    render(<Collapsible title="Section Title">Content</Collapsible>);
    expect(screen.getByText('Section Title')).toBeInTheDocument();
  });

  it('does not show content by default', () => {
    render(<Collapsible title="Section">Hidden content</Collapsible>);
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('shows content when defaultOpen is true', () => {
    render(
      <Collapsible title="Section" defaultOpen>
        Visible content
      </Collapsible>
    );
    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('toggles content on click', async () => {
    render(<Collapsible title="Section">Toggle content</Collapsible>);
    expect(screen.queryByText('Toggle content')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Section'));
    expect(screen.getByText('Toggle content')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Section'));
    expect(screen.queryByText('Toggle content')).not.toBeInTheDocument();
  });

  it('sets aria-expanded based on open state', async () => {
    render(<Collapsible title="Section">Content</Collapsible>);
    const button = screen.getByRole('button', { name: /section/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders content region with aria-labelledby', async () => {
    render(
      <Collapsible title="Section" defaultOpen>
        Content
      </Collapsible>
    );
    const region = screen.getByRole('region');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-labelledby');
  });
});
