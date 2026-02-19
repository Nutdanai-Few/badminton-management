import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabase } from './db.js';
import { createPlayerRoutes } from './routes/players.js';
import { createTournamentRoutes } from './routes/tournament.js';
import { createMatchRoutes } from './routes/matches.js';
import { createLeaderboardRoutes, createHistoryRoutes } from './routes/leaderboard.js';
import { setupSocketHandlers } from './socket/handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(dbPath?: string): {
  app: ReturnType<typeof express>;
  httpServer: ReturnType<typeof createServer>;
  io: Server;
  db: ReturnType<typeof createDatabase>;
} {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  const db = createDatabase(dbPath);

  app.use(cors());
  app.use(express.json());

  // API routes
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/players', createPlayerRoutes(db, io));
  app.use('/api/tournament', createTournamentRoutes(db, io));
  app.use('/api/courts', createMatchRoutes(db, io));
  app.use('/api/leaderboard', createLeaderboardRoutes(db));
  app.use('/api/history', createHistoryRoutes(db));

  // Serve client in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDist, 'index.html'));
      }
    });
  }

  // Socket.io
  setupSocketHandlers(io, db);

  return { app, httpServer, io, db };
}

// Start server when run directly
const PORT = parseInt(process.env.PORT || '3000', 10);
const { httpServer } = createApp();
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
