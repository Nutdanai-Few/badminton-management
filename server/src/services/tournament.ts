import type Database from 'better-sqlite3';
import type { Tournament, Player, LeaderboardEntry, MatchHistoryEntry } from '@badminton/shared';

export function getTournament(db: Database.Database): Tournament {
  const row = db.prepare('SELECT * FROM tournament WHERE id = 1').get() as any;
  return {
    courts: row.courts,
    mode: row.mode,
    winPoints: row.win_points,
    currentRound: row.current_round,
    status: row.status,
  };
}

export function updateTournamentConfig(
  db: Database.Database,
  config: { courts?: number; mode?: 'singles' | 'doubles'; winPoints?: number }
): Tournament {
  const current = getTournament(db);
  const courts = config.courts ?? current.courts;
  const mode = config.mode ?? current.mode;
  const winPoints = config.winPoints ?? current.winPoints;

  db.prepare(
    'UPDATE tournament SET courts = ?, mode = ?, win_points = ? WHERE id = 1'
  ).run(courts, mode, winPoints);

  return getTournament(db);
}

export function startTournament(db: Database.Database): Tournament {
  db.prepare(
    'UPDATE tournament SET status = ?, current_round = 1 WHERE id = 1'
  ).run('playing');
  return getTournament(db);
}

export function advanceRound(db: Database.Database): Tournament {
  db.prepare(
    'UPDATE tournament SET current_round = current_round + 1 WHERE id = 1'
  ).run();
  return getTournament(db);
}

export function resetTournament(db: Database.Database): void {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM active_courts').run();
    db.prepare('DELETE FROM match_history').run();
    db.prepare('DELETE FROM players').run();
    db.prepare(
      'UPDATE tournament SET courts = 2, mode = \'doubles\', win_points = 1, current_round = 0, status = \'setup\', player_queue = \'[]\' WHERE id = 1'
    ).run();
  });
  transaction();
}

export function getPlayers(db: Database.Database): Player[] {
  const rows = db.prepare('SELECT * FROM players ORDER BY name').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    matchesPlayed: row.matches_played,
    wins: row.wins,
    losses: row.losses,
    points: row.points,
  }));
}

export function addPlayers(db: Database.Database, names: string[]): Player[] {
  const stmt = db.prepare('INSERT OR IGNORE INTO players (name) VALUES (?)');
  const transaction = db.transaction(() => {
    for (const name of names) {
      const trimmed = name.trim();
      if (trimmed) stmt.run(trimmed);
    }
  });
  transaction();
  return getPlayers(db);
}

export function removePlayer(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM players WHERE id = ?').run(id);
}

export function removeAllPlayers(db: Database.Database): void {
  db.prepare('DELETE FROM players').run();
}

export function getLeaderboard(db: Database.Database): LeaderboardEntry[] {
  const rows = db.prepare(
    'SELECT * FROM players ORDER BY points DESC, wins DESC, name ASC'
  ).all() as any[];

  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    name: row.name,
    matchesPlayed: row.matches_played,
    wins: row.wins,
    losses: row.losses,
    points: row.points,
  }));
}

export function getHistory(db: Database.Database): MatchHistoryEntry[] {
  const rows = db.prepare(
    'SELECT * FROM match_history ORDER BY id DESC'
  ).all() as any[];

  return rows.map(row => ({
    id: row.id,
    roundNumber: row.round_number,
    courtNumber: row.court_number,
    teamANames: JSON.parse(row.team_a_names),
    teamBNames: JSON.parse(row.team_b_names),
    scoreA: row.score_a,
    scoreB: row.score_b,
    winner: row.winner,
    playedAt: row.played_at,
  }));
}
