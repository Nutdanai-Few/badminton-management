import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import type { Server } from 'http';
import { createDatabase } from '../../db.js';
import { createPlayerRoutes } from '../../routes/players.js';
import { createTournamentRoutes } from '../../routes/tournament.js';
import { createMatchRoutes } from '../../routes/matches.js';
import { createLeaderboardRoutes, createHistoryRoutes } from '../../routes/leaderboard.js';

/**
 * Build a fresh app + in-memory DB for each test.
 * We intentionally avoid importing index.ts to prevent the module-level
 * `httpServer.listen()` from firing and causing EADDRINUSE errors.
 */
function buildTestApp() {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, { cors: { origin: '*' } });
  const db = createDatabase(':memory:');

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/players', createPlayerRoutes(db, io));
  app.use('/api/tournament', createTournamentRoutes(db, io));
  app.use('/api/courts', createMatchRoutes(db, io));
  app.use('/api/leaderboard', createLeaderboardRoutes(db));
  app.use('/api/history', createHistoryRoutes(db));

  return { app, httpServer, io, db };
}

describe('API Integration Tests', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  let httpServer: Server;
  let io: SocketServer;

  beforeEach(() => {
    const result = buildTestApp();
    app = result.app;
    httpServer = result.httpServer;
    io = result.io;
  });

  afterEach(() => {
    io.close();
    httpServer.close();
  });

  // ─── Health Check ────────────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('should return status ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  // ─── Player CRUD ────────────────────────────────────────────────────

  describe('Player endpoints', () => {
    describe('GET /api/players', () => {
      it('should return empty array initially', async () => {
        const res = await request(app).get('/api/players');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });
    });

    describe('POST /api/players', () => {
      it('should add players and return the full list', async () => {
        const res = await request(app)
          .post('/api/players')
          .send({ names: ['Alice', 'Bob', 'Charlie'] });
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(3);
        expect(res.body.map((p: any) => p.name)).toEqual(['Alice', 'Bob', 'Charlie']);
      });

      it('should return 400 when names is missing', async () => {
        const res = await request(app).post('/api/players').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 when names is empty array', async () => {
        const res = await request(app).post('/api/players').send({ names: [] });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 when names is not an array', async () => {
        const res = await request(app).post('/api/players').send({ names: 'Alice' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should skip duplicate names without error', async () => {
        await request(app).post('/api/players').send({ names: ['Alice'] });
        const res = await request(app).post('/api/players').send({ names: ['Alice', 'Bob'] });
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
      });
    });

    describe('DELETE /api/players/:id', () => {
      it('should delete a specific player', async () => {
        const addRes = await request(app)
          .post('/api/players')
          .send({ names: ['Alice', 'Bob'] });
        const aliceId = addRes.body.find((p: any) => p.name === 'Alice').id;

        const res = await request(app).delete(`/api/players/${aliceId}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });

        const getRes = await request(app).get('/api/players');
        expect(getRes.body).toHaveLength(1);
        expect(getRes.body[0].name).toBe('Bob');
      });

      it('should return 400 for invalid id', async () => {
        const res = await request(app).delete('/api/players/abc');
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });
    });

    describe('DELETE /api/players', () => {
      it('should remove all players', async () => {
        await request(app).post('/api/players').send({ names: ['Alice', 'Bob'] });
        const res = await request(app).delete('/api/players');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });

        const getRes = await request(app).get('/api/players');
        expect(getRes.body).toEqual([]);
      });
    });
  });

  // ─── Tournament Config ──────────────────────────────────────────────

  describe('Tournament endpoints', () => {
    describe('GET /api/tournament', () => {
      it('should return default tournament config', async () => {
        const res = await request(app).get('/api/tournament');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          courts: 2,
          mode: 'doubles',
          winPoints: 1,
          currentRound: 0,
          status: 'setup',
        });
      });
    });

    describe('PUT /api/tournament/config', () => {
      it('should update tournament config', async () => {
        const res = await request(app)
          .put('/api/tournament/config')
          .send({ courts: 3, mode: 'singles', winPoints: 2 });
        expect(res.status).toBe(200);
        expect(res.body.courts).toBe(3);
        expect(res.body.mode).toBe('singles');
        expect(res.body.winPoints).toBe(2);
      });

      it('should partially update config', async () => {
        const res = await request(app)
          .put('/api/tournament/config')
          .send({ courts: 5 });
        expect(res.status).toBe(200);
        expect(res.body.courts).toBe(5);
        expect(res.body.mode).toBe('doubles'); // unchanged
      });
    });

    describe('POST /api/tournament/start', () => {
      it('should start tournament with enough players (doubles)', async () => {
        // Default: 2 courts, doubles mode => need 8 players
        await request(app).post('/api/players').send({
          names: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
        });

        const res = await request(app).post('/api/tournament/start');
        expect(res.status).toBe(200);
        expect(res.body.tournament.status).toBe('playing');
        expect(res.body.tournament.currentRound).toBe(1);
        expect(res.body.courts).toBeDefined();
        expect(res.body.courts.length).toBeGreaterThan(0);
      });

      it('should start tournament with enough players (singles)', async () => {
        // Set to 2 courts, singles => need 4 players
        await request(app)
          .put('/api/tournament/config')
          .send({ mode: 'singles', courts: 2 });
        await request(app).post('/api/players').send({
          names: ['P1', 'P2', 'P3', 'P4'],
        });

        const res = await request(app).post('/api/tournament/start');
        expect(res.status).toBe(200);
        expect(res.body.tournament.status).toBe('playing');
      });

      it('should return 400 when not enough players for doubles', async () => {
        // Default: 2 courts, doubles => need 8 players
        await request(app).post('/api/players').send({
          names: ['P1', 'P2', 'P3'],
        });

        const res = await request(app).post('/api/tournament/start');
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 when not enough players for singles', async () => {
        await request(app)
          .put('/api/tournament/config')
          .send({ mode: 'singles', courts: 2 });
        await request(app).post('/api/players').send({
          names: ['P1', 'P2', 'P3'],
        });

        const res = await request(app).post('/api/tournament/start');
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 with zero players', async () => {
        const res = await request(app).post('/api/tournament/start');
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });
    });

    describe('POST /api/tournament/reset', () => {
      it('should reset tournament to defaults', async () => {
        await request(app).post('/api/players').send({
          names: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'],
        });
        await request(app).post('/api/tournament/start');

        const res = await request(app).post('/api/tournament/reset');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });

        const tournamentRes = await request(app).get('/api/tournament');
        expect(tournamentRes.body.status).toBe('setup');
        expect(tournamentRes.body.currentRound).toBe(0);

        const playersRes = await request(app).get('/api/players');
        expect(playersRes.body).toEqual([]);
      });
    });
  });

  // ─── Courts / Matches ───────────────────────────────────────────────

  describe('Courts / Matches endpoints', () => {
    async function setupTournament() {
      await request(app)
        .put('/api/tournament/config')
        .send({ mode: 'singles', courts: 2 });
      await request(app).post('/api/players').send({
        names: ['Alice', 'Bob', 'Charlie', 'Diana'],
      });
      await request(app).post('/api/tournament/start');
    }

    describe('GET /api/courts', () => {
      it('should return empty array before tournament starts', async () => {
        const res = await request(app).get('/api/courts');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });

      it('should return active courts after tournament starts', async () => {
        await setupTournament();
        const res = await request(app).get('/api/courts');
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        // Each court should have teamA and teamB
        for (const court of res.body) {
          expect(court.teamA).toBeDefined();
          expect(court.teamB).toBeDefined();
          expect(court.courtNumber).toBeGreaterThan(0);
        }
      });
    });

    describe('POST /api/courts/shuffle', () => {
      it('should reshuffle matchups', async () => {
        await setupTournament();
        const res = await request(app).post('/api/courts/shuffle');
        expect(res.status).toBe(200);
        expect(res.body.courts.length).toBeGreaterThan(0);
        expect(res.body.upcomingRounds).toBeDefined();
      });
    });

    describe('POST /api/courts/submit-scores', () => {
      it('should submit scores and advance round', async () => {
        await setupTournament();

        // Get current courts
        const courtsRes = await request(app).get('/api/courts');
        const courts = courtsRes.body;

        const scores = courts.map((court: any) => ({
          courtId: court.id,
          scoreA: 21,
          scoreB: 15,
        }));

        const res = await request(app)
          .post('/api/courts/submit-scores')
          .send({ scores });

        expect(res.status).toBe(200);
        expect(res.body.courts).toBeDefined();
        expect(res.body.leaderboard).toBeDefined();
        expect(res.body.history).toBeDefined();
        expect(res.body.history.length).toBeGreaterThan(0);
      });

      it('should update leaderboard after scoring', async () => {
        await setupTournament();

        const courtsRes = await request(app).get('/api/courts');
        const courts = courtsRes.body;

        const scores = courts.map((court: any) => ({
          courtId: court.id,
          scoreA: 21,
          scoreB: 15,
        }));

        const res = await request(app)
          .post('/api/courts/submit-scores')
          .send({ scores });

        // Check leaderboard has entries with points
        const leaderboard = res.body.leaderboard;
        expect(leaderboard.length).toBeGreaterThan(0);
        const totalWins = leaderboard.reduce((sum: number, e: any) => sum + e.wins, 0);
        const totalLosses = leaderboard.reduce((sum: number, e: any) => sum + e.losses, 0);
        // Wins and losses should be balanced
        expect(totalWins).toBe(totalLosses);
      });

      it('should return 400 when scores is missing', async () => {
        const res = await request(app)
          .post('/api/courts/submit-scores')
          .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 when scores is empty array', async () => {
        const res = await request(app)
          .post('/api/courts/submit-scores')
          .send({ scores: [] });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 when scores are equal (tie)', async () => {
        await setupTournament();
        const courtsRes = await request(app).get('/api/courts');
        const courts = courtsRes.body;

        const res = await request(app)
          .post('/api/courts/submit-scores')
          .send({
            scores: [{ courtId: courts[0].id, scoreA: 15, scoreB: 15 }],
          });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 when scores are negative', async () => {
        await setupTournament();
        const courtsRes = await request(app).get('/api/courts');
        const courts = courtsRes.body;

        const res = await request(app)
          .post('/api/courts/submit-scores')
          .send({
            scores: [{ courtId: courts[0].id, scoreA: -1, scoreB: 21 }],
          });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should return 400 when scoreA is not a number', async () => {
        await setupTournament();
        const courtsRes = await request(app).get('/api/courts');
        const courts = courtsRes.body;

        const res = await request(app)
          .post('/api/courts/submit-scores')
          .send({
            scores: [{ courtId: courts[0].id, scoreA: 'abc', scoreB: 21 }],
          });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      });

      it('should advance the round number after scoring', async () => {
        await setupTournament();

        // Get tournament before
        const beforeRes = await request(app).get('/api/tournament');
        const roundBefore = beforeRes.body.currentRound;

        // Submit scores
        const courtsRes = await request(app).get('/api/courts');
        const courts = courtsRes.body;
        const scores = courts.map((court: any) => ({
          courtId: court.id,
          scoreA: 21,
          scoreB: 15,
        }));
        await request(app).post('/api/courts/submit-scores').send({ scores });

        // Get tournament after
        const afterRes = await request(app).get('/api/tournament');
        expect(afterRes.body.currentRound).toBe(roundBefore + 1);
      });
    });
  });

  // ─── Leaderboard ────────────────────────────────────────────────────

  describe('Leaderboard endpoints', () => {
    describe('GET /api/leaderboard', () => {
      it('should return empty leaderboard initially', async () => {
        const res = await request(app).get('/api/leaderboard');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });

      it('should return leaderboard with ranks after scores', async () => {
        // Setup and play a round
        await request(app)
          .put('/api/tournament/config')
          .send({ mode: 'singles', courts: 1 });
        await request(app).post('/api/players').send({
          names: ['Alice', 'Bob'],
        });
        await request(app).post('/api/tournament/start');

        const courtsRes = await request(app).get('/api/courts');
        const scores = courtsRes.body.map((c: any) => ({
          courtId: c.id,
          scoreA: 21,
          scoreB: 10,
        }));
        await request(app).post('/api/courts/submit-scores').send({ scores });

        const res = await request(app).get('/api/leaderboard');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].rank).toBe(1);
        expect(res.body[0].points).toBe(1);
        expect(res.body[1].rank).toBe(2);
        expect(res.body[1].points).toBe(0);
      });
    });
  });

  // ─── History ────────────────────────────────────────────────────────

  describe('History endpoints', () => {
    describe('GET /api/history', () => {
      it('should return empty history initially', async () => {
        const res = await request(app).get('/api/history');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });

      it('should return match history after scores are submitted', async () => {
        // Setup and play a round
        await request(app)
          .put('/api/tournament/config')
          .send({ mode: 'singles', courts: 1 });
        await request(app).post('/api/players').send({
          names: ['Alice', 'Bob'],
        });
        await request(app).post('/api/tournament/start');

        const courtsRes = await request(app).get('/api/courts');
        const scores = courtsRes.body.map((c: any) => ({
          courtId: c.id,
          scoreA: 21,
          scoreB: 15,
        }));
        await request(app).post('/api/courts/submit-scores').send({ scores });

        const res = await request(app).get('/api/history');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].scoreA).toBe(21);
        expect(res.body[0].scoreB).toBe(15);
        expect(res.body[0].winner).toBe('a');
        expect(res.body[0].teamANames).toBeDefined();
        expect(res.body[0].teamBNames).toBeDefined();
      });
    });
  });

  // ─── Full Tournament Flow ───────────────────────────────────────────

  describe('Full tournament flow', () => {
    it('should complete a multi-round singles tournament', async () => {
      // Configure
      await request(app)
        .put('/api/tournament/config')
        .send({ mode: 'singles', courts: 1, winPoints: 2 });

      // Add players
      await request(app).post('/api/players').send({
        names: ['Alice', 'Bob'],
      });

      // Start
      const startRes = await request(app).post('/api/tournament/start');
      expect(startRes.body.tournament.status).toBe('playing');
      expect(startRes.body.tournament.currentRound).toBe(1);

      // Round 1: Submit scores (team A wins)
      let courts = startRes.body.courts;
      expect(courts).toHaveLength(1);

      let scores = courts.map((c: any) => ({
        courtId: c.id,
        scoreA: 21,
        scoreB: 18,
      }));
      const round1Res = await request(app)
        .post('/api/courts/submit-scores')
        .send({ scores });
      expect(round1Res.body.history).toHaveLength(1);

      // Round 2: Submit scores (team A wins again since we don't know which player is which after shuffle)
      courts = round1Res.body.courts;
      scores = courts.map((c: any) => ({
        courtId: c.id,
        scoreA: 21,
        scoreB: 15,
      }));
      const round2Res = await request(app)
        .post('/api/courts/submit-scores')
        .send({ scores });
      expect(round2Res.body.history).toHaveLength(2);

      // Check tournament state
      const tournamentRes = await request(app).get('/api/tournament');
      expect(tournamentRes.body.currentRound).toBe(3);

      // Check leaderboard - both players played 2 matches
      const leaderboardRes = await request(app).get('/api/leaderboard');
      expect(leaderboardRes.body).toHaveLength(2);
      for (const entry of leaderboardRes.body) {
        expect(entry.matchesPlayed).toBe(2);
      }
      // Total wins across all players should be 2 (one winner per round)
      const totalWins = leaderboardRes.body.reduce((sum: number, e: any) => sum + e.wins, 0);
      expect(totalWins).toBe(2);
      // Total points should be 4 (2 wins * 2 winPoints each)
      const totalPoints = leaderboardRes.body.reduce((sum: number, e: any) => sum + e.points, 0);
      expect(totalPoints).toBe(4);

      // Reset
      await request(app).post('/api/tournament/reset');
      const afterReset = await request(app).get('/api/tournament');
      expect(afterReset.body.status).toBe('setup');
      expect(afterReset.body.currentRound).toBe(0);

      const playersAfterReset = await request(app).get('/api/players');
      expect(playersAfterReset.body).toEqual([]);

      const historyAfterReset = await request(app).get('/api/history');
      expect(historyAfterReset.body).toEqual([]);
    });

    it('should handle doubles tournament with sitting out players', async () => {
      // 1 court doubles = 4 players, add 5 so 1 sits out
      await request(app)
        .put('/api/tournament/config')
        .send({ mode: 'doubles', courts: 1 });
      await request(app).post('/api/players').send({
        names: ['P1', 'P2', 'P3', 'P4', 'P5'],
      });

      const startRes = await request(app).post('/api/tournament/start');
      expect(startRes.body.tournament.status).toBe('playing');
      expect(startRes.body.courts).toHaveLength(1);

      const court = startRes.body.courts[0];
      expect(court.teamA).toHaveLength(2);
      expect(court.teamB).toHaveLength(2);
    });
  });
});
