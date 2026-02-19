import type Database from 'better-sqlite3';
import type { Player, ActiveCourt, UpcomingRound } from '@badminton/shared';

interface MatchupResult {
  courts: ActiveCourt[];
  sittingOut: Player[];
}

function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Build courts from an ordered list of players (queue order)
function buildCourtsFromOrder(
  orderedPlayers: Player[],
  courtCount: number,
  mode: 'singles' | 'doubles'
): MatchupResult {
  const playersPerMatch = mode === 'singles' ? 2 : 4;
  const maxPlayers = courtCount * playersPerMatch;

  const activePlayers = orderedPlayers.slice(0, maxPlayers);
  const sittingOut = orderedPlayers.slice(maxPlayers);

  const courts: ActiveCourt[] = [];

  for (let i = 0; i < courtCount; i++) {
    const start = i * playersPerMatch;
    const group = activePlayers.slice(start, start + playersPerMatch);

    if (group.length < playersPerMatch) break;

    const teamA = mode === 'singles' ? [group[0]] : [group[0], group[1]];
    const teamB = mode === 'singles' ? [group[1]] : [group[2], group[3]];

    courts.push({
      id: 0,
      courtNumber: i + 1,
      teamA,
      teamB,
      scoreA: null,
      scoreB: null,
      roundNumber: 0,
    });
  }

  return { courts, sittingOut };
}

// Initialize queue: shuffle all players randomly
export function initializeQueue(players: Player[]): number[] {
  return shuffle(players).map(p => p.id);
}

// Rotate queue after a round: move played players to the back
export function rotateQueue(
  queue: number[],
  courtCount: number,
  mode: 'singles' | 'doubles'
): number[] {
  const playersPerMatch = mode === 'singles' ? 2 : 4;
  const playedCount = Math.min(courtCount * playersPerMatch, queue.length);
  const played = queue.slice(0, playedCount);
  const rest = queue.slice(playedCount);
  return [...rest, ...played];
}

// Generate matchups from queue order
export function generateMatchupsFromQueue(
  queue: number[],
  players: Player[],
  courtCount: number,
  mode: 'singles' | 'doubles'
): MatchupResult {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const orderedPlayers = queue
    .map(id => playerMap.get(id))
    .filter((p): p is Player => p !== undefined);

  return buildCourtsFromOrder(orderedPlayers, courtCount, mode);
}

// Generate upcoming rounds by simulating queue rotations
export function generateUpcomingRounds(
  queue: number[],
  players: Player[],
  courtCount: number,
  mode: 'singles' | 'doubles',
  numRounds: number = 3
): UpcomingRound[] {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const rounds: UpcomingRound[] = [];
  let currentQueue = [...queue];

  // Skip the current round (rotate once first)
  currentQueue = rotateQueue(currentQueue, courtCount, mode);

  for (let i = 0; i < numRounds; i++) {
    const orderedPlayers = currentQueue
      .map(id => playerMap.get(id))
      .filter((p): p is Player => p !== undefined);

    const playersPerMatch = mode === 'singles' ? 2 : 4;
    const maxPlayers = courtCount * playersPerMatch;
    const active = orderedPlayers.slice(0, maxPlayers);
    const sittingOut = orderedPlayers.slice(maxPlayers);

    const courts: UpcomingRound['courts'] = [];
    for (let c = 0; c < courtCount; c++) {
      const start = c * playersPerMatch;
      const group = active.slice(start, start + playersPerMatch);
      if (group.length < playersPerMatch) break;

      const teamA = mode === 'singles' ? [group[0]] : [group[0], group[1]];
      const teamB = mode === 'singles' ? [group[1]] : [group[2], group[3]];
      courts.push({ courtNumber: c + 1, teamA, teamB });
    }

    rounds.push({ roundOffset: i + 1, courts, sittingOut });

    // Rotate for next iteration
    currentQueue = rotateQueue(currentQueue, courtCount, mode);
  }

  return rounds;
}

// Legacy random matchups (kept for backwards compatibility)
export function generateMatchups(
  players: Player[],
  courtCount: number,
  mode: 'singles' | 'doubles'
): MatchupResult {
  const shuffled = shuffle(players);
  return buildCourtsFromOrder(shuffled, courtCount, mode);
}

// Save/load queue to tournament table
export function saveQueue(db: Database.Database, queue: number[]): void {
  db.prepare('UPDATE tournament SET player_queue = ? WHERE id = 1').run(JSON.stringify(queue));
}

export function loadQueue(db: Database.Database): number[] {
  const row = db.prepare('SELECT player_queue FROM tournament WHERE id = 1').get() as any;
  return row ? JSON.parse(row.player_queue) : [];
}

export function saveMatchups(
  db: Database.Database,
  courts: ActiveCourt[],
  roundNumber: number
): void {
  const deleteStmt = db.prepare('DELETE FROM active_courts');
  const insertStmt = db.prepare(
    `INSERT INTO active_courts (court_number, team_a_player_ids, team_b_player_ids, score_a, score_b, round_number)
     VALUES (?, ?, ?, NULL, NULL, ?)`
  );

  const transaction = db.transaction(() => {
    deleteStmt.run();
    for (const court of courts) {
      insertStmt.run(
        court.courtNumber,
        JSON.stringify(court.teamA.map(p => p.id)),
        JSON.stringify(court.teamB.map(p => p.id)),
        roundNumber
      );
    }
  });

  transaction();
}

export function getActiveCourts(db: Database.Database): ActiveCourt[] {
  const rows = db.prepare('SELECT * FROM active_courts ORDER BY court_number').all() as any[];
  const players = db.prepare('SELECT * FROM players').all() as any[];
  const playerMap = new Map(players.map(p => [p.id, p]));

  return rows.map(row => {
    const teamAIds: number[] = JSON.parse(row.team_a_player_ids);
    const teamBIds: number[] = JSON.parse(row.team_b_player_ids);

    return {
      id: row.id,
      courtNumber: row.court_number,
      teamA: teamAIds.map(id => mapPlayer(playerMap.get(id))),
      teamB: teamBIds.map(id => mapPlayer(playerMap.get(id))),
      scoreA: row.score_a,
      scoreB: row.score_b,
      roundNumber: row.round_number,
    };
  });
}

function mapPlayer(row: any): Player {
  if (!row) return { id: 0, name: 'Unknown', matchesPlayed: 0, wins: 0, losses: 0, points: 0 };
  return {
    id: row.id,
    name: row.name,
    matchesPlayed: row.matches_played,
    wins: row.wins,
    losses: row.losses,
    points: row.points,
  };
}
