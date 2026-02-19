import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import { submitScores } from '../services/scoring.js';
import {
  initializeQueue,
  generateMatchupsFromQueue,
  generateUpcomingRounds,
  rotateQueue,
  saveMatchups,
  saveQueue,
  loadQueue,
  getActiveCourts,
} from '../services/matchmaker.js';
import { getTournament, advanceRound, getPlayers, getLeaderboard, getHistory } from '../services/tournament.js';
import type { ScoreSubmission } from '@badminton/shared';

export function createMatchRoutes(db: Database.Database, io: Server): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const courts = getActiveCourts(db);
    res.json(courts);
  });

  router.get('/upcoming', (_req, res) => {
    const tournament = getTournament(db);
    const players = getPlayers(db);
    const queue = loadQueue(db);
    const upcomingRounds = generateUpcomingRounds(queue, players, tournament.courts, tournament.mode);
    res.json(upcomingRounds);
  });

  router.post('/shuffle', (_req, res) => {
    const tournament = getTournament(db);
    const players = getPlayers(db);

    // Re-randomize the queue
    const queue = initializeQueue(players);
    saveQueue(db, queue);

    const { courts } = generateMatchupsFromQueue(queue, players, tournament.courts, tournament.mode);
    saveMatchups(db, courts, tournament.currentRound);

    const activeCourts = getActiveCourts(db);
    const upcomingRounds = generateUpcomingRounds(queue, players, tournament.courts, tournament.mode);

    io.emit('courts:updated', activeCourts);
    io.emit('upcoming:updated', upcomingRounds);
    res.json({ courts: activeCourts, upcomingRounds });
  });

  router.post('/submit-scores', (req, res) => {
    const { scores } = req.body as { scores: ScoreSubmission[] };

    if (!Array.isArray(scores) || scores.length === 0) {
      res.status(400).json({ error: 'scores must be a non-empty array' });
      return;
    }

    for (const s of scores) {
      if (typeof s.scoreA !== 'number' || typeof s.scoreB !== 'number') {
        res.status(400).json({ error: 'scoreA and scoreB must be numbers' });
        return;
      }
      if (s.scoreA === s.scoreB) {
        res.status(400).json({ error: 'คะแนนเท่ากันไม่ได้ ต้องมีผู้ชนะ' });
        return;
      }
      if (s.scoreA < 0 || s.scoreB < 0) {
        res.status(400).json({ error: 'คะแนนต้องไม่ติดลบ' });
        return;
      }
    }

    submitScores(db, scores);

    // Rotate queue: played players go to the back
    const tournamentBefore = getTournament(db);
    let queue = loadQueue(db);
    queue = rotateQueue(queue, tournamentBefore.courts, tournamentBefore.mode);
    saveQueue(db, queue);

    // Advance round and generate new matchups from rotated queue
    const tournament = advanceRound(db);
    const players = getPlayers(db);
    const { courts } = generateMatchupsFromQueue(queue, players, tournament.courts, tournament.mode);
    saveMatchups(db, courts, tournament.currentRound);

    const activeCourts = getActiveCourts(db);
    const upcomingRounds = generateUpcomingRounds(queue, players, tournament.courts, tournament.mode);
    const leaderboard = getLeaderboard(db);
    const history = getHistory(db);

    io.emit('tournament:updated', tournament);
    io.emit('courts:updated', activeCourts);
    io.emit('upcoming:updated', upcomingRounds);
    io.emit('leaderboard:updated', leaderboard);
    io.emit('history:updated', history);

    res.json({ courts: activeCourts, upcomingRounds, leaderboard, history });
  });

  return router;
}
