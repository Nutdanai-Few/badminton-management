import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock socket before anything else
vi.mock('../../socket', () => ({
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: false,
  },
}));

// Mock useTournament
vi.mock('../../context/TournamentContext', () => ({
  useTournament: vi.fn(),
}));

import { useTournament } from '../../context/TournamentContext';
import HistoryPage from '../../pages/HistoryPage';

const mockUseTournament = vi.mocked(useTournament);

describe('HistoryPage', () => {
  it('renders history list with data from context', () => {
    mockUseTournament.mockReturnValue({
      tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 3, status: 'playing' },
      players: [],
      courts: [],
      upcomingRounds: [],
      leaderboard: [],
      history: [
        {
          id: 1,
          roundNumber: 1,
          courtNumber: 1,
          teamANames: ['Alice', 'Bob'],
          teamBNames: ['Charlie', 'Diana'],
          scoreA: 21,
          scoreB: 15,
          winner: 'a' as const,
          playedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          roundNumber: 2,
          courtNumber: 1,
          teamANames: ['Eve'],
          teamBNames: ['Frank'],
          scoreA: 10,
          scoreB: 21,
          winner: 'b' as const,
          playedAt: '2026-01-01T01:00:00Z',
        },
      ],
      connected: true,
    });

    render(<HistoryPage />);

    // Page heading
    expect(screen.getByText('ประวัติการแข่งขัน')).toBeInTheDocument();

    // Match data
    expect(screen.getByText('Alice + Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie + Diana')).toBeInTheDocument();
    expect(screen.getByText('21 - 15')).toBeInTheDocument();
    expect(screen.getByText('Eve')).toBeInTheDocument();
    expect(screen.getByText('Frank')).toBeInTheDocument();
    expect(screen.getByText('10 - 21')).toBeInTheDocument();
  });
});
