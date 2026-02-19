import { io, Socket } from 'socket.io-client';

const URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

export const socket: Socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});
