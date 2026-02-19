import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Player } from '@badminton/shared';
import PlayerList from '../../components/PlayerList';

function makePlayer(id: number, name: string): Player {
  return { id, name, matchesPlayed: 0, wins: 0, losses: 0, points: 0 };
}

describe('PlayerList', () => {
  it('renders players with names', () => {
    const players: Player[] = [
      makePlayer(1, 'Alice'),
      makePlayer(2, 'Bob'),
      makePlayer(3, 'Charlie'),
    ];
    render(<PlayerList players={players} onRemove={() => {}} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('shows empty state when no players', () => {
    render(<PlayerList players={[]} onRemove={() => {}} />);

    expect(screen.getByText('ยังไม่มีผู้เล่น')).toBeInTheDocument();
  });

  it('calls onRemove when clicking remove button', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const players: Player[] = [makePlayer(1, 'Alice'), makePlayer(2, 'Bob')];

    render(<PlayerList players={players} onRemove={onRemove} />);

    const removeAliceBtn = screen.getByRole('button', { name: 'ลบ Alice' });
    await user.click(removeAliceBtn);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('hides remove buttons when disabled', () => {
    const players: Player[] = [makePlayer(1, 'Alice'), makePlayer(2, 'Bob')];

    render(<PlayerList players={players} onRemove={() => {}} disabled />);

    expect(screen.queryByRole('button', { name: 'ลบ Alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ลบ Bob' })).not.toBeInTheDocument();
    // Names should still show
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
