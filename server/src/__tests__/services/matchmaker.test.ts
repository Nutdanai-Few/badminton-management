import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Player } from '@badminton/shared';
import { createDatabase } from '../../db.js';
import {
  generateMatchups,
  initializeQueue,
  rotateQueue,
  generateMatchupsFromQueue,
  generateUpcomingRounds,
  saveQueue,
  loadQueue,
  saveMatchups,
  getActiveCourts,
} from '../../services/matchmaker.js';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Player${i + 1}`,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    points: 0,
  }));
}

describe('Matchmaker - generateMatchups', () => {
  describe('singles mode', () => {
    it('should create the correct number of courts for singles', () => {
      const players = makePlayers(6);
      const result = generateMatchups(players, 3, 'singles');
      expect(result.courts).toHaveLength(3);
    });

    it('should assign 2 players per court in singles', () => {
      const players = makePlayers(4);
      const result = generateMatchups(players, 2, 'singles');

      for (const court of result.courts) {
        expect(court.teamA).toHaveLength(1);
        expect(court.teamB).toHaveLength(1);
      }
    });

    it('should handle exactly minimum players for singles (2 players, 1 court)', () => {
      const players = makePlayers(2);
      const result = generateMatchups(players, 1, 'singles');
      expect(result.courts).toHaveLength(1);
      expect(result.sittingOut).toHaveLength(0);
    });

    it('should sit out extra players in singles', () => {
      const players = makePlayers(5);
      const result = generateMatchups(players, 2, 'singles');
      // 2 courts * 2 players = 4, so 1 sitting out
      expect(result.courts).toHaveLength(2);
      expect(result.sittingOut).toHaveLength(1);
    });

    it('should reduce courts when not enough players for all courts in singles', () => {
      const players = makePlayers(3);
      const result = generateMatchups(players, 3, 'singles');
      // Only 3 players, need 2 per court, so only 1 full court possible
      // The third player is sliced into activePlayers but can't fill a court
      expect(result.courts).toHaveLength(1);
      expect(result.sittingOut).toHaveLength(0);
    });
  });

  describe('doubles mode', () => {
    it('should create the correct number of courts for doubles', () => {
      const players = makePlayers(8);
      const result = generateMatchups(players, 2, 'doubles');
      expect(result.courts).toHaveLength(2);
    });

    it('should assign 4 players per court in doubles (2 per team)', () => {
      const players = makePlayers(8);
      const result = generateMatchups(players, 2, 'doubles');

      for (const court of result.courts) {
        expect(court.teamA).toHaveLength(2);
        expect(court.teamB).toHaveLength(2);
      }
    });

    it('should handle exactly minimum players for doubles (4 players, 1 court)', () => {
      const players = makePlayers(4);
      const result = generateMatchups(players, 1, 'doubles');
      expect(result.courts).toHaveLength(1);
      expect(result.sittingOut).toHaveLength(0);
    });

    it('should sit out extra players in doubles', () => {
      const players = makePlayers(10);
      const result = generateMatchups(players, 2, 'doubles');
      // 2 courts * 4 players = 8, so 2 sitting out
      expect(result.courts).toHaveLength(2);
      expect(result.sittingOut).toHaveLength(2);
    });

    it('should reduce courts when not enough players for all courts in doubles', () => {
      const players = makePlayers(6);
      const result = generateMatchups(players, 3, 'doubles');
      // 6 players, need 4 per court, only 1 full court possible
      // Remaining 2 are in activePlayers but can't fill a court
      expect(result.courts).toHaveLength(1);
      expect(result.sittingOut).toHaveLength(0);
    });
  });

  describe('common behavior', () => {
    it('should not have any player on multiple courts', () => {
      const players = makePlayers(12);
      const result = generateMatchups(players, 3, 'doubles');

      const allPlayerIds = new Set<number>();
      for (const court of result.courts) {
        for (const p of [...court.teamA, ...court.teamB]) {
          expect(allPlayerIds.has(p.id)).toBe(false);
          allPlayerIds.add(p.id);
        }
      }
    });

    it('should not have any player both playing and sitting out', () => {
      const players = makePlayers(10);
      const result = generateMatchups(players, 2, 'doubles');

      const playingIds = new Set<number>();
      for (const court of result.courts) {
        for (const p of [...court.teamA, ...court.teamB]) {
          playingIds.add(p.id);
        }
      }

      for (const p of result.sittingOut) {
        expect(playingIds.has(p.id)).toBe(false);
      }
    });

    it('should include all players (playing + sitting out)', () => {
      const players = makePlayers(10);
      const result = generateMatchups(players, 2, 'doubles');

      const allIds = new Set<number>();
      for (const court of result.courts) {
        for (const p of [...court.teamA, ...court.teamB]) {
          allIds.add(p.id);
        }
      }
      for (const p of result.sittingOut) {
        allIds.add(p.id);
      }

      expect(allIds.size).toBe(10);
    });

    it('should set courtNumber sequentially starting from 1', () => {
      const players = makePlayers(8);
      const result = generateMatchups(players, 2, 'doubles');
      expect(result.courts[0].courtNumber).toBe(1);
      expect(result.courts[1].courtNumber).toBe(2);
    });

    it('should return empty courts when fewer players than needed for 1 court', () => {
      const players = makePlayers(1);
      const result = generateMatchups(players, 1, 'singles');
      expect(result.courts).toHaveLength(0);
      // 1 player < maxPlayers (2), so player goes into activePlayers but can't fill a court
      expect(result.sittingOut).toHaveLength(0);
    });

    it('should return empty courts for 0 players', () => {
      const result = generateMatchups([], 2, 'doubles');
      expect(result.courts).toHaveLength(0);
      expect(result.sittingOut).toHaveLength(0);
    });

    it('should handle more courts requested than players can fill', () => {
      const players = makePlayers(4);
      const result = generateMatchups(players, 5, 'doubles');
      // Only 4 players, need 4 per court, can fill only 1 court
      expect(result.courts).toHaveLength(1);
      expect(result.sittingOut).toHaveLength(0);
    });
  });
});

describe('Matchmaker - saveMatchups and getActiveCourts', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('should save matchups and retrieve them with getActiveCourts', () => {
    // Insert players into the database first
    db.prepare("INSERT INTO players (name) VALUES ('Alice')").run();
    db.prepare("INSERT INTO players (name) VALUES ('Bob')").run();
    db.prepare("INSERT INTO players (name) VALUES ('Charlie')").run();
    db.prepare("INSERT INTO players (name) VALUES ('Diana')").run();

    const players: Player[] = [
      { id: 1, name: 'Alice', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
      { id: 2, name: 'Bob', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
      { id: 3, name: 'Charlie', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
      { id: 4, name: 'Diana', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
    ];

    const courts = [
      {
        id: 0,
        courtNumber: 1,
        teamA: [players[0], players[1]],
        teamB: [players[2], players[3]],
        scoreA: null,
        scoreB: null,
        roundNumber: 0,
      },
    ];

    saveMatchups(db, courts, 1);
    const retrieved = getActiveCourts(db);

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].courtNumber).toBe(1);
    expect(retrieved[0].roundNumber).toBe(1);
    expect(retrieved[0].teamA).toHaveLength(2);
    expect(retrieved[0].teamB).toHaveLength(2);
    expect(retrieved[0].teamA[0].name).toBe('Alice');
    expect(retrieved[0].teamA[1].name).toBe('Bob');
    expect(retrieved[0].teamB[0].name).toBe('Charlie');
    expect(retrieved[0].teamB[1].name).toBe('Diana');
    expect(retrieved[0].scoreA).toBeNull();
    expect(retrieved[0].scoreB).toBeNull();
  });

  it('should clear previous matchups when saving new ones', () => {
    db.prepare("INSERT INTO players (name) VALUES ('Alice')").run();
    db.prepare("INSERT INTO players (name) VALUES ('Bob')").run();

    const players: Player[] = [
      { id: 1, name: 'Alice', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
      { id: 2, name: 'Bob', matchesPlayed: 0, wins: 0, losses: 0, points: 0 },
    ];

    const courts1 = [
      {
        id: 0,
        courtNumber: 1,
        teamA: [players[0]],
        teamB: [players[1]],
        scoreA: null,
        scoreB: null,
        roundNumber: 0,
      },
    ];

    saveMatchups(db, courts1, 1);
    let retrieved = getActiveCourts(db);
    expect(retrieved).toHaveLength(1);

    // Save again with different round
    saveMatchups(db, courts1, 2);
    retrieved = getActiveCourts(db);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].roundNumber).toBe(2);
  });

  it('should save multiple courts', () => {
    for (let i = 1; i <= 4; i++) {
      db.prepare('INSERT INTO players (name) VALUES (?)').run(`Player${i}`);
    }

    const players: Player[] = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      name: `Player${i + 1}`,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      points: 0,
    }));

    const courts = [
      {
        id: 0,
        courtNumber: 1,
        teamA: [players[0]],
        teamB: [players[1]],
        scoreA: null,
        scoreB: null,
        roundNumber: 0,
      },
      {
        id: 0,
        courtNumber: 2,
        teamA: [players[2]],
        teamB: [players[3]],
        scoreA: null,
        scoreB: null,
        roundNumber: 0,
      },
    ];

    saveMatchups(db, courts, 3);
    const retrieved = getActiveCourts(db);
    expect(retrieved).toHaveLength(2);
    expect(retrieved[0].courtNumber).toBe(1);
    expect(retrieved[1].courtNumber).toBe(2);
  });

  it('should return empty array when no active courts', () => {
    const retrieved = getActiveCourts(db);
    expect(retrieved).toHaveLength(0);
  });

  it('should map unknown player IDs to placeholder', () => {
    // Save matchups referencing non-existent player IDs
    db.prepare(
      `INSERT INTO active_courts (court_number, team_a_player_ids, team_b_player_ids, round_number)
       VALUES (1, '[999]', '[998]', 1)`
    ).run();

    const retrieved = getActiveCourts(db);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].teamA[0].name).toBe('Unknown');
    expect(retrieved[0].teamB[0].name).toBe('Unknown');
  });
});

describe('Queue-based matchmaking', () => {
  describe('initializeQueue', () => {
    it('should return all player IDs', () => {
      const players = makePlayers(6);
      const queue = initializeQueue(players);
      expect(queue).toHaveLength(6);
      expect(new Set(queue).size).toBe(6);
      for (const p of players) {
        expect(queue).toContain(p.id);
      }
    });

    it('should return empty array for empty players', () => {
      const queue = initializeQueue([]);
      expect(queue).toEqual([]);
    });
  });

  describe('rotateQueue', () => {
    it('should move played players to the back in singles', () => {
      // 2 courts, singles = 4 players play
      const queue = [1, 2, 3, 4, 5, 6];
      const rotated = rotateQueue(queue, 2, 'singles');
      expect(rotated).toEqual([5, 6, 1, 2, 3, 4]);
    });

    it('should move played players to the back in doubles', () => {
      // 1 court, doubles = 4 players play
      const queue = [1, 2, 3, 4, 5, 6];
      const rotated = rotateQueue(queue, 1, 'doubles');
      expect(rotated).toEqual([5, 6, 1, 2, 3, 4]);
    });

    it('should handle queue smaller than players needed', () => {
      // 3 courts singles = 6 needed, but only 4 in queue
      const queue = [1, 2, 3, 4];
      const rotated = rotateQueue(queue, 3, 'singles');
      // All 4 are "played", so they all rotate to back (same order)
      expect(rotated).toEqual([1, 2, 3, 4]);
    });

    it('should handle exact fit (no sitting out)', () => {
      const queue = [1, 2, 3, 4];
      const rotated = rotateQueue(queue, 2, 'singles');
      // All 4 play, all rotate
      expect(rotated).toEqual([1, 2, 3, 4]);
    });
  });

  describe('generateMatchupsFromQueue', () => {
    it('should create matchups in queue order for singles', () => {
      const players = makePlayers(6);
      const queue = [1, 2, 3, 4, 5, 6];
      const result = generateMatchupsFromQueue(queue, players, 2, 'singles');

      expect(result.courts).toHaveLength(2);
      // Court 1: player 1 vs player 2
      expect(result.courts[0].teamA[0].id).toBe(1);
      expect(result.courts[0].teamB[0].id).toBe(2);
      // Court 2: player 3 vs player 4
      expect(result.courts[1].teamA[0].id).toBe(3);
      expect(result.courts[1].teamB[0].id).toBe(4);
      // Sitting out: player 5, 6
      expect(result.sittingOut).toHaveLength(2);
      expect(result.sittingOut.map(p => p.id)).toEqual([5, 6]);
    });

    it('should create matchups in queue order for doubles', () => {
      const players = makePlayers(6);
      const queue = [3, 1, 4, 2, 6, 5];
      const result = generateMatchupsFromQueue(queue, players, 1, 'doubles');

      expect(result.courts).toHaveLength(1);
      expect(result.courts[0].teamA.map(p => p.id)).toEqual([3, 1]);
      expect(result.courts[0].teamB.map(p => p.id)).toEqual([4, 2]);
      expect(result.sittingOut.map(p => p.id)).toEqual([6, 5]);
    });

    it('should skip unknown player IDs in queue', () => {
      const players = makePlayers(4);
      const queue = [1, 999, 2, 3, 4]; // 999 doesn't exist
      const result = generateMatchupsFromQueue(queue, players, 2, 'singles');
      // Only 4 valid players, 2 courts singles = 4 needed
      expect(result.courts).toHaveLength(2);
    });
  });

  describe('generateUpcomingRounds', () => {
    it('should generate correct number of upcoming rounds', () => {
      const players = makePlayers(6);
      const queue = [1, 2, 3, 4, 5, 6];
      const rounds = generateUpcomingRounds(queue, players, 2, 'singles', 3);
      expect(rounds).toHaveLength(3);
    });

    it('should have correct roundOffset values', () => {
      const players = makePlayers(6);
      const queue = [1, 2, 3, 4, 5, 6];
      const rounds = generateUpcomingRounds(queue, players, 2, 'singles', 3);
      expect(rounds[0].roundOffset).toBe(1);
      expect(rounds[1].roundOffset).toBe(2);
      expect(rounds[2].roundOffset).toBe(3);
    });

    it('should rotate different players into upcoming rounds', () => {
      const players = makePlayers(6);
      // Queue: 1,2,3,4 play now; 5,6 sit out
      const queue = [1, 2, 3, 4, 5, 6];
      const rounds = generateUpcomingRounds(queue, players, 2, 'singles', 2);

      // After rotation: [5, 6, 1, 2, 3, 4]
      // Round+1: 5,6,1,2 play; 3,4 sit out
      const round1Ids = new Set<number>();
      for (const court of rounds[0].courts) {
        for (const p of [...court.teamA, ...court.teamB]) {
          round1Ids.add(p.id);
        }
      }
      expect(round1Ids.has(5)).toBe(true);
      expect(round1Ids.has(6)).toBe(true);
      // Players who sat out (5,6) should be in next round
    });

    it('should include sitting out players', () => {
      const players = makePlayers(6);
      const queue = [1, 2, 3, 4, 5, 6];
      const rounds = generateUpcomingRounds(queue, players, 2, 'singles', 1);
      // After first rotation: [5,6,1,2,3,4] → plays 5,6,1,2 → sits 3,4
      expect(rounds[0].sittingOut.map(p => p.id)).toEqual([3, 4]);
    });

    it('should default to 3 rounds', () => {
      const players = makePlayers(6);
      const queue = [1, 2, 3, 4, 5, 6];
      const rounds = generateUpcomingRounds(queue, players, 2, 'singles');
      expect(rounds).toHaveLength(3);
    });
  });

  describe('saveQueue and loadQueue', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createDatabase(':memory:');
    });

    it('should save and load queue', () => {
      const queue = [3, 1, 4, 2, 5];
      saveQueue(db, queue);
      const loaded = loadQueue(db);
      expect(loaded).toEqual([3, 1, 4, 2, 5]);
    });

    it('should load empty queue by default', () => {
      const loaded = loadQueue(db);
      expect(loaded).toEqual([]);
    });

    it('should overwrite previous queue', () => {
      saveQueue(db, [1, 2, 3]);
      saveQueue(db, [4, 5, 6]);
      const loaded = loadQueue(db);
      expect(loaded).toEqual([4, 5, 6]);
    });
  });
});
