import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import {
  getTournament,
  updateTournamentConfig,
  startTournament,
  resetTournament,
  getPlayers,
} from '../services/tournament.js';
import {
  initializeQueue,
  generateMatchupsFromQueue,
  generateUpcomingRounds,
  saveMatchups,
  saveQueue,
  loadQueue,
  getActiveCourts,
} from '../services/matchmaker.js';

export function createTournamentRoutes(db: Database.Database, io: Server): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const tournament = getTournament(db);
    res.json(tournament);
  });

  router.put('/config', (req, res) => {
    const { courts, mode, winPoints } = req.body;
    const tournament = updateTournamentConfig(db, { courts, mode, winPoints });
    io.emit('tournament:updated', tournament);
    res.json(tournament);
  });

  router.post('/start', (_req, res) => {
    const players = getPlayers(db);
    const tournamentBefore = getTournament(db);
    const playersPerMatch = tournamentBefore.mode === 'singles' ? 2 : 4;
    const minPlayers = tournamentBefore.courts * playersPerMatch;

    if (players.length < minPlayers) {
      res.status(400).json({
        error: `ต้องมีผู้เล่นอย่างน้อย ${minPlayers} คน (${tournamentBefore.courts} สนาม x ${playersPerMatch} คน/สนาม)`,
      });
      return;
    }

    // Initialize queue and start
    const queue = initializeQueue(players);
    saveQueue(db, queue);

    const tournament = startTournament(db);
    const { courts } = generateMatchupsFromQueue(queue, players, tournament.courts, tournament.mode);
    saveMatchups(db, courts, tournament.currentRound);

    const activeCourts = getActiveCourts(db);
    const upcomingRounds = generateUpcomingRounds(queue, players, tournament.courts, tournament.mode);

    io.emit('tournament:updated', tournament);
    io.emit('courts:updated', activeCourts);
    io.emit('upcoming:updated', upcomingRounds);
    res.json({ tournament, courts: activeCourts, upcomingRounds });
  });

  router.post('/reset', (_req, res) => {
    resetTournament(db);
    const tournament = getTournament(db);
    io.emit('tournament:reset', null);
    io.emit('tournament:updated', tournament);
    io.emit('players:updated', []);
    io.emit('courts:updated', []);
    io.emit('upcoming:updated', []);
    io.emit('leaderboard:updated', []);
    io.emit('history:updated', []);
    res.json({ success: true });
  });

  return router;
}
