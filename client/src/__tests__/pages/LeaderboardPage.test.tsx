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
import LeaderboardPage from '../../pages/LeaderboardPage';

const mockUseTournament = vi.mocked(useTournament);

describe('LeaderboardPage', () => {
  it('renders leaderboard table with data from context', () => {
    mockUseTournament.mockReturnValue({
      tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 3, status: 'playing' },
      players: [],
      courts: [],
      upcomingRounds: [],
      leaderboard: [
        { id: 1, rank: 1, name: 'Alice', matchesPlayed: 5, wins: 4, losses: 1, points: 4 },
        { id: 2, rank: 2, name: 'Bob', matchesPlayed: 5, wins: 3, losses: 2, points: 3 },
        { id: 3, rank: 3, name: 'Charlie', matchesPlayed: 5, wins: 2, losses: 3, points: 2 },
      ],
      history: [],
      connected: true,
    });

    render(<LeaderboardPage />);

    // Page heading
    expect(screen.getByText('ตารางคะแนน')).toBeInTheDocument();

    // Player names from leaderboard
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });
});
