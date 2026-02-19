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

// Mock api module
vi.mock('../../api', () => ({
  api: {
    addPlayers: vi.fn().mockResolvedValue({}),
    removePlayer: vi.fn().mockResolvedValue({}),
    updateConfig: vi.fn().mockResolvedValue({}),
    startTournament: vi.fn().mockResolvedValue({}),
    resetTournament: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useTournament
vi.mock('../../context/TournamentContext', () => ({
  useTournament: vi.fn(),
}));

import { useTournament } from '../../context/TournamentContext';
import SetupPage from '../../pages/SetupPage';

const mockUseTournament = vi.mocked(useTournament);

function setupMock(overrides: Partial<ReturnType<typeof useTournament>> = {}) {
  mockUseTournament.mockReturnValue({
    tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 0, status: 'setup' },
    players: [],
    courts: [],
    upcomingRounds: [],
    leaderboard: [],
    history: [],
    connected: true,
    ...overrides,
  });
}

describe('SetupPage', () => {
  it('renders player input textarea', () => {
    setupMock();
    render(<SetupPage />);

    const textarea = screen.getByPlaceholderText(/พิมพ์ชื่อผู้เล่น/);
    expect(textarea).toBeInTheDocument();
  });

  it('renders config form', () => {
    setupMock();
    render(<SetupPage />);

    // Labels are rendered as text within <label> elements (no htmlFor association)
    expect(screen.getByText('จำนวนสนาม')).toBeInTheDocument();
    expect(screen.getByText('โหมด')).toBeInTheDocument();
    expect(screen.getByText('คะแนนเมื่อชนะ')).toBeInTheDocument();
  });

  it('start button disabled when not enough players', () => {
    // Doubles mode, 2 courts = need 8 players minimum
    setupMock({
      tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 0, status: 'setup' },
      players: [
        { id: 1, name: 'Alice', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
        { id: 2, name: 'Bob', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
      ],
    });
    render(<SetupPage />);

    const startButton = screen.getByText('เริ่มการแข่งขัน');
    expect(startButton).toBeDisabled();
  });

  it('shows reset button when tournament is playing', () => {
    setupMock({
      tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 1, status: 'playing' },
      players: Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `Player ${i + 1}`,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        points: 0,
      })),
    });
    render(<SetupPage />);

    expect(screen.getByText('รีเซ็ตการแข่งขัน')).toBeInTheDocument();
    // The start button should not be visible during playing
    expect(screen.queryByText('เริ่มการแข่งขัน')).not.toBeInTheDocument();
  });
});
