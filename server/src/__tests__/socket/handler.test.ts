import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createDatabase } from '../../db.js';
import { setupSocketHandlers } from '../../socket/handler.js';
import { addPlayers, startTournament } from '../../services/tournament.js';
import { generateMatchups, saveMatchups } from '../../services/matchmaker.js';
import type Database from 'better-sqlite3';

describe('Socket Handler', () => {
  let db: Database.Database;
  let httpServer: Server;
  let io: SocketServer;
  let clientSocket: ClientSocket;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    httpServer = createServer();
    io = new SocketServer(httpServer, { cors: { origin: '*' } });
    setupSocketHandlers(io, db);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as AddressInfo).port;
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
  });

  afterEach(async () => {
    clientSocket.disconnect();
    io.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('should emit sync:full-state on connection with default empty state', async () => {
    // The client already connected in beforeEach, so we need to reconnect to capture the event
    clientSocket.disconnect();

    const port = (httpServer.address() as AddressInfo).port;
    const newClient = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    const fullState = await new Promise<any>((resolve) => {
      newClient.on('sync:full-state', (state: any) => {
        resolve(state);
      });
    });

    expect(fullState).toBeDefined();
    expect(fullState.tournament).toEqual({
      courts: 2,
      mode: 'doubles',
      winPoints: 1,
      currentRound: 0,
      status: 'setup',
    });
    expect(fullState.players).toEqual([]);
    expect(fullState.courts).toEqual([]);
    expect(fullState.leaderboard).toEqual([]);
    expect(fullState.history).toEqual([]);

    newClient.disconnect();
  });

  it('should emit full state including players when players exist', async () => {
    addPlayers(db, ['Alice', 'Bob', 'Charlie', 'Diana']);

    clientSocket.disconnect();

    const port = (httpServer.address() as AddressInfo).port;
    const newClient = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    const fullState = await new Promise<any>((resolve) => {
      newClient.on('sync:full-state', (state: any) => {
        resolve(state);
      });
    });

    expect(fullState.players).toHaveLength(4);
    expect(fullState.players.map((p: any) => p.name)).toEqual([
      'Alice',
      'Bob',
      'Charlie',
      'Diana',
    ]);

    newClient.disconnect();
  });

  it('should emit full state including active courts when tournament is playing', async () => {
    const players = addPlayers(db, ['Alice', 'Bob', 'Charlie', 'Diana']);
    // Configure for singles, 2 courts
    db.prepare('UPDATE tournament SET mode = ?, courts = ? WHERE id = 1').run('singles', 2);
    startTournament(db);
    const { courts } = generateMatchups(players, 2, 'singles');
    saveMatchups(db, courts, 1);

    clientSocket.disconnect();

    const port = (httpServer.address() as AddressInfo).port;
    const newClient = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    const fullState = await new Promise<any>((resolve) => {
      newClient.on('sync:full-state', (state: any) => {
        resolve(state);
      });
    });

    expect(fullState.tournament.status).toBe('playing');
    expect(fullState.courts.length).toBeGreaterThan(0);

    newClient.disconnect();
  });
});
