import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActiveCourt, Player } from '@badminton/shared';
import CourtCard from '../../components/CourtCard';

function makePlayer(id: number, name: string): Player {
  return { id, name, matchesPlayed: 0, wins: 0, losses: 0, points: 0 };
}

function makeCourt(overrides?: Partial<ActiveCourt>): ActiveCourt {
  return {
    id: 1,
    courtNumber: 1,
    teamA: [makePlayer(1, 'Alice'), makePlayer(2, 'Bob')],
    teamB: [makePlayer(3, 'Charlie'), makePlayer(4, 'Diana')],
    scoreA: null,
    scoreB: null,
    roundNumber: 1,
    ...overrides,
  };
}

describe('CourtCard', () => {
  it('renders court number and team names', () => {
    const court = makeCourt({ courtNumber: 3 });

    render(
      <CourtCard
        court={court}
        scoreA=""
        scoreB=""
        onScoreAChange={() => {}}
        onScoreBChange={() => {}}
      />,
    );

    expect(screen.getByText('สนาม 3')).toBeInTheDocument();
    expect(screen.getByText('Alice + Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie + Diana')).toBeInTheDocument();
  });

  it('renders score inputs', () => {
    const court = makeCourt();

    render(
      <CourtCard
        court={court}
        scoreA="21"
        scoreB="15"
        onScoreAChange={() => {}}
        onScoreBChange={() => {}}
      />,
    );

    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue(21);
    expect(inputs[1]).toHaveValue(15);
  });

  it('calls onScoreAChange/onScoreBChange on input change', async () => {
    const user = userEvent.setup();
    const onScoreAChange = vi.fn();
    const onScoreBChange = vi.fn();
    const court = makeCourt();

    render(
      <CourtCard
        court={court}
        scoreA=""
        scoreB=""
        onScoreAChange={onScoreAChange}
        onScoreBChange={onScoreBChange}
      />,
    );

    const inputs = screen.getAllByRole('spinbutton');

    await user.type(inputs[0], '21');
    expect(onScoreAChange).toHaveBeenCalled();

    await user.type(inputs[1], '15');
    expect(onScoreBChange).toHaveBeenCalled();
  });
});
