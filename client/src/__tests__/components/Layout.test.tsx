import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../components/Layout';

// Mock the socket module before importing anything that uses it
vi.mock('../../socket', () => ({
  socket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: false,
  },
}));

// Mock useTournament to control connected state
vi.mock('../../context/TournamentContext', () => ({
  useTournament: vi.fn(),
}));

import { useTournament } from '../../context/TournamentContext';

const mockUseTournament = vi.mocked(useTournament);

function renderLayout(connected: boolean) {
  mockUseTournament.mockReturnValue({
    tournament: { courts: 2, mode: 'doubles', winPoints: 1, currentRound: 0, status: 'setup' },
    players: [],
    courts: [],
    upcomingRounds: [],
    leaderboard: [],
    history: [],
    connected,
  });

  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  it('renders nav bar with all 4 tabs', () => {
    renderLayout(true);

    expect(screen.getByText('ตั้งค่า')).toBeInTheDocument();
    expect(screen.getByText('สนามแข่ง')).toBeInTheDocument();
    expect(screen.getByText('อันดับ')).toBeInTheDocument();
    expect(screen.getByText('ประวัติ')).toBeInTheDocument();
  });

  it('shows connection status', () => {
    // Connected state
    renderLayout(true);
    expect(screen.getByText('เชื่อมต่อแล้ว')).toBeInTheDocument();

    // Disconnected state
    renderLayout(false);
    expect(screen.getByText('ขาดการเชื่อมต่อ')).toBeInTheDocument();
  });
});
