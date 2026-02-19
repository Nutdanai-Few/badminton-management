import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../../components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Test Title"
        message="Test Message"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders title and message when open', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete All"
        message="Are you sure you want to delete everything?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText('Delete All')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete everything?')).toBeInTheDocument();
  });

  it('calls onConfirm when clicking confirm button', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Proceed?"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    await user.click(screen.getByText('ยืนยัน'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when clicking cancel button', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Proceed?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText('ยกเลิก'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
