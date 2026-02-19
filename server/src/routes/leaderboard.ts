import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getLeaderboard, getHistory } from '../services/tournament.js';

export function createLeaderboardRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const leaderboard = getLeaderboard(db);
    res.json(leaderboard);
  });

  return router;
}

export function createHistoryRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const history = getHistory(db);
    res.json(history);
  });

  return router;
}
