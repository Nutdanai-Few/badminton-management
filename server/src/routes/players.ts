import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import { getPlayers, addPlayers, removePlayer, removeAllPlayers } from '../services/tournament.js';

export function createPlayerRoutes(db: Database.Database, io: Server): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const players = getPlayers(db);
    res.json(players);
  });

  router.post('/', (req, res) => {
    const { names } = req.body;
    if (!Array.isArray(names) || names.length === 0) {
      res.status(400).json({ error: 'names must be a non-empty array of strings' });
      return;
    }
    const players = addPlayers(db, names);
    io.emit('players:updated', players);
    res.json(players);
  });

  router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid player id' });
      return;
    }
    removePlayer(db, id);
    const players = getPlayers(db);
    io.emit('players:updated', players);
    res.json({ success: true });
  });

  router.delete('/', (_req, res) => {
    removeAllPlayers(db);
    io.emit('players:updated', []);
    res.json({ success: true });
  });

  return router;
}
