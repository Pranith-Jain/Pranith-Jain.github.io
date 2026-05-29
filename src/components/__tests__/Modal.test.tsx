import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ModalFooter } from '../ui/Modal';

describe('Modal', () => {
  it('does not render when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Test">
        Content
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test">
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders title and content', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test Title">
        Test Content
      </Modal>
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );
    await userEvent.click(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );
    const overlay = screen.getByRole('dialog').querySelector('.fixed.inset-0');
    if (overlay) await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose on overlay click when closeOnOverlay is false', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test" closeOnOverlay={false}>
        Content
      </Modal>
    );
    const overlay = screen.getByRole('dialog').querySelector('.fixed.inset-0');
    if (overlay) await userEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders ModalFooter', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test">
        <ModalFooter>Footer content</ModalFooter>
      </Modal>
    );
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('sets aria-modal on dialog', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test">
        Content
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('hides close button when showCloseButton is false', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test" showCloseButton={false}>
        Content
      </Modal>
    );
    expect(screen.queryByLabelText('Close dialog')).not.toBeInTheDocument();
  });

  it('applies size class', () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="Test" size="sm">
        Content
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.max-w-sm')).toBeInTheDocument();
  });
});
