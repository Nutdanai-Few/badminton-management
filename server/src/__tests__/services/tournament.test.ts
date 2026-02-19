import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../../db.js';
import {
  getTournament,
  updateTournamentConfig,
  startTournament,
  advanceRound,
  resetTournament,
  getPlayers,
  addPlayers,
  removePlayer,
  removeAllPlayers,
  getLeaderboard,
  getHistory,
} from '../../services/tournament.js';

describe('Tournament Service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  describe('getTournament', () => {
    it('should return default tournament values', () => {
      const tournament = getTournament(db);
      expect(tournament.courts).toBe(2);
      expect(tournament.mode).toBe('doubles');
      expect(tournament.winPoints).toBe(1);
      expect(tournament.currentRound).toBe(0);
      expect(tournament.status).toBe('setup');
    });
  });

  describe('updateTournamentConfig', () => {
    it('should update courts count', () => {
      const result = updateTournamentConfig(db, { courts: 4 });
      expect(result.courts).toBe(4);
      expect(result.mode).toBe('doubles'); // unchanged
      expect(result.winPoints).toBe(1); // unchanged
    });

    it('should update mode', () => {
      const result = updateTournamentConfig(db, { mode: 'singles' });
      expect(result.mode).toBe('singles');
      expect(result.courts).toBe(2); // unchanged
    });

    it('should update winPoints', () => {
      const result = updateTournamentConfig(db, { winPoints: 3 });
      expect(result.winPoints).toBe(3);
    });

    it('should update multiple fields at once', () => {
      const result = updateTournamentConfig(db, {
        courts: 3,
        mode: 'singles',
        winPoints: 2,
      });
      expect(result.courts).toBe(3);
      expect(result.mode).toBe('singles');
      expect(result.winPoints).toBe(2);
    });

    it('should keep existing values when no config provided', () => {
      updateTournamentConfig(db, { courts: 5, mode: 'singles', winPoints: 10 });
      const result = updateTournamentConfig(db, {});
      expect(result.courts).toBe(5);
      expect(result.mode).toBe('singles');
      expect(result.winPoints).toBe(10);
    });

    it('should persist changes across getTournament calls', () => {
      updateTournamentConfig(db, { courts: 3 });
      const tournament = getTournament(db);
      expect(tournament.courts).toBe(3);
    });
  });

  describe('startTournament', () => {
    it('should change status to playing', () => {
      const result = startTournament(db);
      expect(result.status).toBe('playing');
    });

    it('should set currentRound to 1', () => {
      const result = startTournament(db);
      expect(result.currentRound).toBe(1);
    });

    it('should preserve other config values', () => {
      updateTournamentConfig(db, { courts: 3, mode: 'singles', winPoints: 5 });
      const result = startTournament(db);
      expect(result.courts).toBe(3);
      expect(result.mode).toBe('singles');
      expect(result.winPoints).toBe(5);
    });
  });

  describe('advanceRound', () => {
    it('should increment currentRound', () => {
      startTournament(db); // sets currentRound = 1
      const result = advanceRound(db);
      expect(result.currentRound).toBe(2);
    });

    it('should increment multiple times', () => {
      startTournament(db);
      advanceRound(db);
      advanceRound(db);
      const result = advanceRound(db);
      expect(result.currentRound).toBe(4);
    });

    it('should not change status', () => {
      startTournament(db);
      const result = advanceRound(db);
      expect(result.status).toBe('playing');
    });
  });

  describe('resetTournament', () => {
    it('should reset tournament config to defaults', () => {
      updateTournamentConfig(db, { courts: 5, mode: 'singles', winPoints: 10 });
      startTournament(db);
      advanceRound(db);

      resetTournament(db);
      const tournament = getTournament(db);

      expect(tournament.courts).toBe(2);
      expect(tournament.mode).toBe('doubles');
      expect(tournament.winPoints).toBe(1);
      expect(tournament.currentRound).toBe(0);
      expect(tournament.status).toBe('setup');
    });

    it('should clear all players', () => {
      addPlayers(db, ['Alice', 'Bob']);
      resetTournament(db);
      const players = getPlayers(db);
      expect(players).toHaveLength(0);
    });

    it('should clear active courts', () => {
      db.prepare(
        `INSERT INTO active_courts (court_number, team_a_player_ids, team_b_player_ids, round_number)
         VALUES (1, '[1]', '[2]', 1)`
      ).run();

      resetTournament(db);
      const courts = db.prepare('SELECT * FROM active_courts').all();
      expect(courts).toHaveLength(0);
    });

    it('should clear match history', () => {
      db.prepare(
        `INSERT INTO match_history (round_number, court_number, team_a_names, team_b_names, score_a, score_b, winner)
         VALUES (1, 1, '["Alice"]', '["Bob"]', 21, 15, 'a')`
      ).run();

      resetTournament(db);
      const history = db.prepare('SELECT * FROM match_history').all();
      expect(history).toHaveLength(0);
    });
  });

  describe('Player CRUD', () => {
    describe('addPlayers', () => {
      it('should add players and return all players', () => {
        const players = addPlayers(db, ['Alice', 'Bob', 'Charlie']);
        expect(players).toHaveLength(3);
        expect(players.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Charlie']);
      });

      it('should trim whitespace from names', () => {
        const players = addPlayers(db, ['  Alice  ', ' Bob ']);
        expect(players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
      });

      it('should skip empty strings', () => {
        const players = addPlayers(db, ['Alice', '', '  ', 'Bob']);
        expect(players).toHaveLength(2);
        expect(players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
      });

      it('should ignore duplicate names (INSERT OR IGNORE)', () => {
        addPlayers(db, ['Alice', 'Bob']);
        const players = addPlayers(db, ['Alice', 'Charlie']);
        expect(players).toHaveLength(3);
      });

      it('should initialize player stats to zero', () => {
        const players = addPlayers(db, ['Alice']);
        expect(players[0].matchesPlayed).toBe(0);
        expect(players[0].wins).toBe(0);
        expect(players[0].losses).toBe(0);
        expect(players[0].points).toBe(0);
      });

      it('should assign unique IDs to players', () => {
        const players = addPlayers(db, ['Alice', 'Bob']);
        expect(players[0].id).not.toBe(players[1].id);
      });

      it('should return players sorted by name', () => {
        const players = addPlayers(db, ['Charlie', 'Alice', 'Bob']);
        expect(players.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Charlie']);
      });
    });

    describe('getPlayers', () => {
      it('should return empty array when no players exist', () => {
        const players = getPlayers(db);
        expect(players).toHaveLength(0);
      });

      it('should return all players sorted by name', () => {
        addPlayers(db, ['Zara', 'Alice', 'Mike']);
        const players = getPlayers(db);
        expect(players.map((p) => p.name)).toEqual(['Alice', 'Mike', 'Zara']);
      });
    });

    describe('removePlayer', () => {
      it('should remove a specific player by ID', () => {
        const players = addPlayers(db, ['Alice', 'Bob', 'Charlie']);
        const bobId = players.find((p) => p.name === 'Bob')!.id;
        removePlayer(db, bobId);

        const remaining = getPlayers(db);
        expect(remaining).toHaveLength(2);
        expect(remaining.map((p) => p.name)).toEqual(['Alice', 'Charlie']);
      });

      it('should not throw when removing non-existent player', () => {
        expect(() => removePlayer(db, 9999)).not.toThrow();
      });
    });

    describe('removeAllPlayers', () => {
      it('should remove all players', () => {
        addPlayers(db, ['Alice', 'Bob', 'Charlie']);
        removeAllPlayers(db);
        const players = getPlayers(db);
        expect(players).toHaveLength(0);
      });

      it('should not throw when no players exist', () => {
        expect(() => removeAllPlayers(db)).not.toThrow();
      });
    });
  });

  describe('getLeaderboard', () => {
    it('should return empty leaderboard when no players', () => {
      const leaderboard = getLeaderboard(db);
      expect(leaderboard).toHaveLength(0);
    });

    it('should sort by points descending', () => {
      addPlayers(db, ['Alice', 'Bob', 'Charlie']);
      db.prepare('UPDATE players SET points = 5 WHERE name = ?').run('Alice');
      db.prepare('UPDATE players SET points = 10 WHERE name = ?').run('Bob');
      db.prepare('UPDATE players SET points = 3 WHERE name = ?').run('Charlie');

      const leaderboard = getLeaderboard(db);
      expect(leaderboard[0].name).toBe('Bob');
      expect(leaderboard[1].name).toBe('Alice');
      expect(leaderboard[2].name).toBe('Charlie');
    });

    it('should break ties by wins descending', () => {
      addPlayers(db, ['Alice', 'Bob']);
      db.prepare('UPDATE players SET points = 5, wins = 3 WHERE name = ?').run('Alice');
      db.prepare('UPDATE players SET points = 5, wins = 5 WHERE name = ?').run('Bob');

      const leaderboard = getLeaderboard(db);
      expect(leaderboard[0].name).toBe('Bob');
      expect(leaderboard[1].name).toBe('Alice');
    });

    it('should break further ties by name ascending', () => {
      addPlayers(db, ['Charlie', 'Alice', 'Bob']);
      // All same points and wins
      db.prepare('UPDATE players SET points = 5, wins = 3 WHERE name = ?').run('Alice');
      db.prepare('UPDATE players SET points = 5, wins = 3 WHERE name = ?').run('Bob');
      db.prepare('UPDATE players SET points = 5, wins = 3 WHERE name = ?').run('Charlie');

      const leaderboard = getLeaderboard(db);
      expect(leaderboard[0].name).toBe('Alice');
      expect(leaderboard[1].name).toBe('Bob');
      expect(leaderboard[2].name).toBe('Charlie');
    });

    it('should assign ranks starting from 1', () => {
      addPlayers(db, ['Alice', 'Bob', 'Charlie']);
      db.prepare('UPDATE players SET points = 10 WHERE name = ?').run('Alice');
      db.prepare('UPDATE players SET points = 5 WHERE name = ?').run('Bob');
      db.prepare('UPDATE players SET points = 1 WHERE name = ?').run('Charlie');

      const leaderboard = getLeaderboard(db);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[2].rank).toBe(3);
    });

    it('should include all player fields', () => {
      addPlayers(db, ['Alice']);
      db.prepare(
        'UPDATE players SET matches_played = 10, wins = 7, losses = 3, points = 7 WHERE name = ?'
      ).run('Alice');

      const leaderboard = getLeaderboard(db);
      expect(leaderboard[0]).toMatchObject({
        rank: 1,
        name: 'Alice',
        matchesPlayed: 10,
        wins: 7,
        losses: 3,
        points: 7,
      });
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history', () => {
      const history = getHistory(db);
      expect(history).toHaveLength(0);
    });

    it('should return matches in reverse order (newest first)', () => {
      db.prepare(
        `INSERT INTO match_history (round_number, court_number, team_a_names, team_b_names, score_a, score_b, winner)
         VALUES (1, 1, '["Alice"]', '["Bob"]', 21, 15, 'a')`
      ).run();
      db.prepare(
        `INSERT INTO match_history (round_number, court_number, team_a_names, team_b_names, score_a, score_b, winner)
         VALUES (2, 1, '["Charlie"]', '["Diana"]', 10, 21, 'b')`
      ).run();
      db.prepare(
        `INSERT INTO match_history (round_number, court_number, team_a_names, team_b_names, score_a, score_b, winner)
         VALUES (3, 1, '["Eve"]', '["Frank"]', 21, 18, 'a')`
      ).run();

      const history = getHistory(db);
      expect(history).toHaveLength(3);
      expect(history[0].roundNumber).toBe(3); // newest first
      expect(history[1].roundNumber).toBe(2);
      expect(history[2].roundNumber).toBe(1); // oldest last
    });

    it('should parse team names from JSON', () => {
      db.prepare(
        `INSERT INTO match_history (round_number, court_number, team_a_names, team_b_names, score_a, score_b, winner)
         VALUES (1, 1, '["Alice","Bob"]', '["Charlie","Diana"]', 21, 15, 'a')`
      ).run();

      const history = getHistory(db);
      expect(history[0].teamANames).toEqual(['Alice', 'Bob']);
      expect(history[0].teamBNames).toEqual(['Charlie', 'Diana']);
    });

    it('should include all match fields', () => {
      db.prepare(
        `INSERT INTO match_history (round_number, court_number, team_a_names, team_b_names, score_a, score_b, winner)
         VALUES (5, 3, '["Alice"]', '["Bob"]', 21, 18, 'a')`
      ).run();

      const history = getHistory(db);
      expect(history[0]).toMatchObject({
        roundNumber: 5,
        courtNumber: 3,
        teamANames: ['Alice'],
        teamBNames: ['Bob'],
        scoreA: 21,
        scoreB: 18,
        winner: 'a',
      });
      expect(history[0].id).toBeDefined();
      expect(history[0].playedAt).toBeDefined();
    });
  });
});
