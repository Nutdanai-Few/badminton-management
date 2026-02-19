import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../../db.js';
import { submitScores } from '../../services/scoring.js';
import type { ScoreSubmission } from '@badminton/shared';

describe('Scoring - submitScores', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  function insertPlayers(...names: string[]): number[] {
    const ids: number[] = [];
    for (const name of names) {
      const result = db.prepare('INSERT INTO players (name) VALUES (?)').run(name);
      ids.push(Number(result.lastInsertRowid));
    }
    return ids;
  }

  function insertCourt(
    courtNumber: number,
    teamAIds: number[],
    teamBIds: number[],
    roundNumber: number
  ): number {
    const result = db
      .prepare(
        `INSERT INTO active_courts (court_number, team_a_player_ids, team_b_player_ids, round_number)
         VALUES (?, ?, ?, ?)`
      )
      .run(courtNumber, JSON.stringify(teamAIds), JSON.stringify(teamBIds), roundNumber);
    return Number(result.lastInsertRowid);
  }

  function getPlayer(id: number) {
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as any;
  }

  function getHistory() {
    return db.prepare('SELECT * FROM match_history ORDER BY id').all() as any[];
  }

  describe('winner determination', () => {
    it('should determine team A as winner when scoreA > scoreB', () => {
      const [p1, p2] = insertPlayers('Alice', 'Bob');
      const courtId = insertCourt(1, [p1], [p2], 1);

      submitScores(db, [{ courtId, scoreA: 21, scoreB: 15 }]);

      const history = getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].winner).toBe('a');
    });

    it('should determine team B as winner when scoreB > scoreA', () => {
      const [p1, p2] = insertPlayers('Alice', 'Bob');
      const courtId = insertCourt(1, [p1], [p2], 1);

      submitScores(db, [{ courtId, scoreA: 10, scoreB: 21 }]);

      const history = getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].winner).toBe('b');
    });
  });

  describe('player stats updates', () => {
    it('should increment wins, matchesPlayed, and points for winning team', () => {
      const [p1, p2] = insertPlayers('Alice', 'Bob');
      const courtId = insertCourt(1, [p1], [p2], 1);

      submitScores(db, [{ courtId, scoreA: 21, scoreB: 15 }]);

      const winner = getPlayer(p1);
      expect(winner.matches_played).toBe(1);
      expect(winner.wins).toBe(1);
      expect(winner.losses).toBe(0);
      expect(winner.points).toBe(1); // default win_points = 1
    });

    it('should increment losses and matchesPlayed for losing team', () => {
      const [p1, p2] = insertPlayers('Alice', 'Bob');
      const courtId = insertCourt(1, [p1], [p2], 1);

      submitScores(db, [{ courtId, scoreA: 21, scoreB: 15 }]);

      const loser = getPlayer(p2);
      expect(loser.matches_played).toBe(1);
      expect(loser.wins).toBe(0);
      expect(loser.losses).toBe(1);
      expect(loser.points).toBe(0);
    });

    it('should use custom win_points from tournament config', () => {
      db.prepare('UPDATE tournament SET win_points = 3 WHERE id = 1').run();
      const [p1, p2] = insertPlayers('Alice', 'Bob');
      const courtId = insertCourt(1, [p1], [p2], 1);

      submitScores(db, [{ courtId, scoreA: 21, scoreB: 15 }]);

      const winner = getPlayer(p1);
      expect(winner.points).toBe(3);
      const loser = getPlayer(p2);
      expect(loser.points).toBe(0);
    });

    it('should update all players in doubles teams', () => {
      const [p1, p2, p3, p4] = insertPlayers('Alice', 'Bob', 'Charlie', 'Diana');
      const courtId = insertCourt(1, [p1, p2], [p3, p4], 1);

      submitScores(db, [{ courtId, scoreA: 21, scoreB: 19 }]);

      // Team A winners
      const alice = getPlayer(p1);
      expect(alice.wins).toBe(1);
      expect(alice.losses).toBe(0);
      expect(alice.points).toBe(1);
      expect(alice.matches_played).toBe(1);

      const bob = getPlayer(p2);
      expect(bob.wins).toBe(1);
      expect(bob.losses).toBe(0);
      expect(bob.points).toBe(1);

      // Team B losers
      const charlie = getPlayer(p3);
      expect(charlie.wins).toBe(0);
      expect(charlie.losses).toBe(1);
      expect(charlie.points).toBe(0);

      const diana = getPlayer(p4);
      expect(diana.wins).toBe(0);
      expect(diana.losses).toBe(1);
      expect(diana.points).toBe(0);
    });

    it('should accumulate stats over multiple rounds', () => {
      const [p1, p2] = insertPlayers('Alice', 'Bob');

      // Round 1: Alice wins
      const courtId1 = insertCourt(1, [p1], [p2], 1);
      submitScores(db, [{ courtId: courtId1, scoreA: 21, scoreB: 15 }]);

      // Round 2: Bob wins (need to clear and re-insert court)
      db.prepare('DELETE FROM active_courts').run();
      const courtId2 = insertCourt(1, [p1], [p2], 2);
      submitScores(db, [{ courtId: courtId2, scoreA: 10, scoreB: 21 }]);

      const alice = getPlayer(p1);
      expect(alice.matches_played).toBe(2);
      expect(alice.wins).toBe(1);
      expect(alice.losses).toBe(1);
      expect(alice.points).toBe(1);

      const bob = getPlayer(p2);
      expect(bob.matches_played).toBe(2);
      expect(bob.wins).toBe(1);
      expect(bob.losses).toBe(1);
      expect(bob.points).toBe(1);
    });
  });

  describe('match history', () => {
    it('should create a match history record with correct data', () => {
      const [p1, p2] = insertPlayers('Alice', 'Bob');
      const courtId = insertCourt(1, [p1], [p2], 3);

      submitScores(db, [{ courtId, scoreA: 21, scoreB: 18 }]);

      const history = getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].round_number).toBe(3);
      expect(history[0].court_number).toBe(1);
      expect(history[0].score_a).toBe(21);
      expect(history[0].score_b).toBe(18);
      expect(history[0].winner).toBe('a');
      expect(JSON.parse(history[0].team_a_names)).toEqual(['Alice']);
      expect(JSON.parse(history[0].team_b_names)).toEqual(['Bob']);
      expect(history[0].played_at).toBeDefined();
    });

    it('should store team names for doubles', () => {
      const [p1, p2, p3, p4] = insertPlayers('Alice', 'Bob', 'Charlie', 'Diana');
      const courtId = insertCourt(1, [p1, p2], [p3, p4], 1);

      submitScores(db, [{ courtId, scoreA: 15, scoreB: 21 }]);

      const history = getHistory();
      expect(JSON.parse(history[0].team_a_names)).toEqual(['Alice', 'Bob']);
      expect(JSON.parse(history[0].team_b_names)).toEqual(['Charlie', 'Diana']);
    });
  });

  describe('multiple court scores', () => {
    it('should handle multiple court scores in one submission', () => {
      const [p1, p2, p3, p4] = insertPlayers('Alice', 'Bob', 'Charlie', 'Diana');
      const courtId1 = insertCourt(1, [p1], [p2], 1);
      const courtId2 = insertCourt(2, [p3], [p4], 1);

      const scores: ScoreSubmission[] = [
        { courtId: courtId1, scoreA: 21, scoreB: 15 },
        { courtId: courtId2, scoreA: 10, scoreB: 21 },
      ];

      submitScores(db, scores);

      // Court 1: Alice wins
      expect(getPlayer(p1).wins).toBe(1);
      expect(getPlayer(p2).losses).toBe(1);

      // Court 2: Diana wins
      expect(getPlayer(p3).losses).toBe(1);
      expect(getPlayer(p4).wins).toBe(1);

      const history = getHistory();
      expect(history).toHaveLength(2);
    });

    it('should rollback all changes if any court submission fails', () => {
      const [p1, p2] = insertPlayers('Alice', 'Bob');
      const courtId = insertCourt(1, [p1], [p2], 1);

      const scores: ScoreSubmission[] = [
        { courtId, scoreA: 21, scoreB: 15 },
        { courtId: 999, scoreA: 21, scoreB: 10 }, // Non-existent court
      ];

      expect(() => submitScores(db, scores)).toThrow('Court 999 not found');

      // Player stats should not have changed (transaction rolled back)
      expect(getPlayer(p1).wins).toBe(0);
      expect(getPlayer(p1).matches_played).toBe(0);

      const history = getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should throw when court does not exist', () => {
      expect(() =>
        submitScores(db, [{ courtId: 999, scoreA: 21, scoreB: 10 }])
      ).toThrow('Court 999 not found');
    });
  });
});
