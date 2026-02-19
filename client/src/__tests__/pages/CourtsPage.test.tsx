import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Player, ActiveCourt, UpcomingRound } from '@badminton/shared';

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
    submitScores: vi.fn().mockResolvedValue({}),
    shuffle: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useTournament
vi.mock('../../context/TournamentContext', () => ({
  useTournament: vi.fn(),
}));

import { useTournament } from '../../context/TournamentContext';
import CourtsPage from '../../pages/CourtsPage';

const mockUseTournament = vi.mocked(useTournament);

function makePlayer(id: number, name: string): Player {
  return { id, name, matchesPlayed: 0, wins: 0, losses: 0, points: 0 };
}

function makeCourt(id: number, courtNumber: number, teamA: Player[], teamB: Player[]): ActiveCourt {
  return { id, courtNumber, teamA, teamB, scoreA: null, scoreB: null, roundNumber: 1 };
}

function setupMock(overrides: Partial<ReturnType<typeof useTournament>> = {}) {
  mockUseTournament.mockReturnValue({
    tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 1, status: 'playing' },
    players: [],
    courts: [],
    upcomingRounds: [],
    leaderboard: [],
    history: [],
    connected: true,
    ...overrides,
  });
}

describe('CourtsPage', () => {
  it('shows "not started" message when status is setup', () => {
    setupMock({
      tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 0, status: 'setup' },
    });
    render(<CourtsPage />);

    expect(screen.getByText('ยังไม่ได้เริ่มการแข่งขัน')).toBeInTheDocument();
  });

  it('renders court cards when playing', () => {
    const players = Array.from({ length: 8 }, (_, i) => makePlayer(i + 1, `P${i + 1}`));
    const courts: ActiveCourt[] = [
      makeCourt(1, 1, [players[0], players[1]], [players[2], players[3]]),
      makeCourt(2, 2, [players[4], players[5]], [players[6], players[7]]),
    ];

    setupMock({
      tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 1, status: 'playing' },
      players,
      courts,
    });
    render(<CourtsPage />);

    expect(screen.getByText('สนาม 1')).toBeInTheDocument();
    expect(screen.getByText('สนาม 2')).toBeInTheDocument();
    expect(screen.getByText('P1 + P2')).toBeInTheDocument();
    expect(screen.getByText('P3 + P4')).toBeInTheDocument();
  });

  it('submit button disabled when scores not filled', () => {
    const players = Array.from({ length: 8 }, (_, i) => makePlayer(i + 1, `P${i + 1}`));
    const courts: ActiveCourt[] = [
      makeCourt(1, 1, [players[0], players[1]], [players[2], players[3]]),
    ];

    setupMock({
      tournament: { courts: 1, mode: 'doubles', winPoints: 1, currentRound: 1, status: 'playing' },
      players,
      courts,
    });
    render(<CourtsPage />);

    const submitButton = screen.getByText('บันทึกผลรอบนี้');
    expect(submitButton).toBeDisabled();
  });

  it('shows sitting out players', () => {
    const players = Array.from({ length: 6 }, (_, i) => makePlayer(i + 1, `Player${i + 1}`));
    // Only 4 players are on court, 2 are sitting out
    const courts: ActiveCourt[] = [
      makeCourt(1, 1, [players[0], players[1]], [players[2], players[3]]),
    ];

    setupMock({
      tournament: { courts: 1, mode: 'doubles', winPoints: 1, currentRound: 1, status: 'playing' },
      players,
      courts,
    });
    render(<CourtsPage />);

    expect(screen.getByText('พักรอบนี้:')).toBeInTheDocument();
    expect(screen.getByText('Player5, Player6')).toBeInTheDocument();
  });

  it('shows upcoming rounds queue', () => {
    const players = Array.from({ length: 6 }, (_, i) => makePlayer(i + 1, `P${i + 1}`));
    const courts: ActiveCourt[] = [
      makeCourt(1, 1, [players[0], players[1]], [players[2], players[3]]),
    ];
    const upcomingRounds: UpcomingRound[] = [
      {
        roundOffset: 1,
        courts: [
          {
            courtNumber: 1,
            teamA: [players[4], players[0]],
            teamB: [players[1], players[2]],
          },
        ],
        sittingOut: [players[3], players[5]],
      },
    ];

    setupMock({
      tournament: { courts: 1, mode: 'doubles', winPoints: 1, currentRound: 1, status: 'playing' },
      players,
      courts,
      upcomingRounds,
    });
    render(<CourtsPage />);

    expect(screen.getByText('คิวรอบถัดไป')).toBeInTheDocument();
    expect(screen.getByText('รอบที่ 2')).toBeInTheDocument();
    expect(screen.getByText('P5 + P1')).toBeInTheDocument();
    expect(screen.getByText('P2 + P3')).toBeInTheDocument();
  });

  it('does not show upcoming rounds section when empty', () => {
    const players = Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, `P${i + 1}`));
    const courts: ActiveCourt[] = [
      makeCourt(1, 1, [players[0], players[1]], [players[2], players[3]]),
    ];

    setupMock({
      tournament: { courts: 1, mode: 'doubles', winPoints: 1, currentRound: 1, status: 'playing' },
      players,
      courts,
      upcomingRounds: [],
    });
    render(<CourtsPage />);

    expect(screen.queryByText('คิวรอบถัดไป')).not.toBeInTheDocument();
  });
});
