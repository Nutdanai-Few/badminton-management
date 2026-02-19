import type { Server, Socket } from 'socket.io';
import type Database from 'better-sqlite3';
import { getTournament, getPlayers, getLeaderboard, getHistory } from '../services/tournament.js';
import { getActiveCourts, loadQueue, generateUpcomingRounds } from '../services/matchmaker.js';
import type { FullState } from '@badminton/shared';

export function setupSocketHandlers(io: Server, db: Database.Database): void {
  io.on('connection', (socket: Socket) => {
    const tournament = getTournament(db);
    const players = getPlayers(db);
    const queue = loadQueue(db);

    const fullState: FullState = {
      tournament,
      players,
      courts: getActiveCourts(db),
      upcomingRounds: tournament.status === 'playing'
        ? generateUpcomingRounds(queue, players, tournament.courts, tournament.mode)
        : [],
      leaderboard: getLeaderboard(db),
      history: getHistory(db),
    };
    socket.emit('sync:full-state', fullState);
  });
}
