import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LeaderboardEntry } from '@badminton/shared';
import LeaderboardTable from '../../components/LeaderboardTable';

function makeEntry(overrides: Partial<LeaderboardEntry> & { id: number; rank: number; name: string }): LeaderboardEntry {
  return {
    matchesPlayed: 5,
    wins: 3,
    losses: 2,
    points: 3,
    ...overrides,
  };
}

describe('LeaderboardTable', () => {
  it('renders empty state', () => {
    render(<LeaderboardTable entries={[]} />);

    expect(screen.getByText('ยังไม่มีข้อมูล')).toBeInTheDocument();
  });

  it('renders player data in table', () => {
    const entries: LeaderboardEntry[] = [
      makeEntry({ id: 1, rank: 1, name: 'Alice', matchesPlayed: 10, wins: 7, losses: 3, points: 7 }),
      makeEntry({ id: 2, rank: 2, name: 'Bob', matchesPlayed: 10, wins: 5, losses: 5, points: 5 }),
    ];

    const { container } = render(<LeaderboardTable entries={entries} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    // Verify data shows up in rows by checking rows directly
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);

    // Alice's row: rank=1, name=Alice, matchesPlayed=10, wins=7, losses=3, points=7
    expect(rows[0].textContent).toContain('Alice');
    expect(rows[0].textContent).toContain('10');
    expect(rows[0].textContent).toContain('7');
    expect(rows[0].textContent).toContain('3');

    // Bob's row: rank=2, name=Bob, matchesPlayed=10, wins=5, losses=5, points=5
    expect(rows[1].textContent).toContain('Bob');
    expect(rows[1].textContent).toContain('5');
  });

  it('shows medal emojis for top 3', () => {
    const entries: LeaderboardEntry[] = [
      makeEntry({ id: 1, rank: 1, name: 'Gold', points: 10 }),
      makeEntry({ id: 2, rank: 2, name: 'Silver', points: 8 }),
      makeEntry({ id: 3, rank: 3, name: 'Bronze', points: 6 }),
      makeEntry({ id: 4, rank: 4, name: 'Fourth', points: 4 }),
    ];

    const { container } = render(<LeaderboardTable entries={entries} />);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);

    // First row (rank 1) should have gold medal emoji
    expect(rows[0].textContent).toContain('\u{1F947}'); // gold medal
    // Second row (rank 2) should have silver medal emoji
    expect(rows[1].textContent).toContain('\u{1F948}'); // silver medal
    // Third row (rank 3) should have bronze medal emoji
    expect(rows[2].textContent).toContain('\u{1F949}'); // bronze medal
    // Fourth row should show number 4, no medal emoji
    expect(rows[3].textContent).toContain('4');
    expect(rows[3].textContent).not.toContain('\u{1F947}');
    expect(rows[3].textContent).not.toContain('\u{1F948}');
    expect(rows[3].textContent).not.toContain('\u{1F949}');
  });
});
