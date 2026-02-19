import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MatchHistoryEntry } from '@badminton/shared';
import MatchHistoryList from '../../components/MatchHistoryList';

function makeMatch(overrides?: Partial<MatchHistoryEntry>): MatchHistoryEntry {
  return {
    id: 1,
    roundNumber: 1,
    courtNumber: 1,
    teamANames: ['Alice', 'Bob'],
    teamBNames: ['Charlie', 'Diana'],
    scoreA: 21,
    scoreB: 15,
    winner: 'a',
    playedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('MatchHistoryList', () => {
  it('renders empty state', () => {
    render(<MatchHistoryList matches={[]} />);

    expect(screen.getByText('ยังไม่มีแมตช์')).toBeInTheDocument();
  });

  it('renders matches with teams and scores', () => {
    const matches: MatchHistoryEntry[] = [
      makeMatch({ id: 1, teamANames: ['Alice', 'Bob'], teamBNames: ['Charlie', 'Diana'], scoreA: 21, scoreB: 15 }),
      makeMatch({ id: 2, roundNumber: 2, teamANames: ['Eve'], teamBNames: ['Frank'], scoreA: 18, scoreB: 21, winner: 'b' }),
    ];

    render(<MatchHistoryList matches={matches} />);

    expect(screen.getByText('Alice + Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie + Diana')).toBeInTheDocument();
    expect(screen.getByText('21 - 15')).toBeInTheDocument();
    expect(screen.getByText('Eve')).toBeInTheDocument();
    expect(screen.getByText('Frank')).toBeInTheDocument();
    expect(screen.getByText('18 - 21')).toBeInTheDocument();
  });

  it('highlights winner team', () => {
    const matches: MatchHistoryEntry[] = [
      makeMatch({ id: 1, winner: 'a' }),
    ];

    const { container } = render(<MatchHistoryList matches={matches} />);

    // Team A cell should have green color (winner)
    const teamACells = container.querySelectorAll('td');
    // Team A is at index 2 (round, court, teamA, score, teamB)
    const teamACell = teamACells[2];
    const teamBCell = teamACells[4];

    expect(teamACell.className).toContain('text-green-600');
    expect(teamBCell.className).toContain('text-gray-600');
  });
});
