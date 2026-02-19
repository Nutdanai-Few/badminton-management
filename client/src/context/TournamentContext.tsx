import React, { createContext, useContext, useEffect, useReducer } from 'react';
import type {
  Tournament,
  Player,
  ActiveCourt,
  UpcomingRound,
  LeaderboardEntry,
  MatchHistoryEntry,
  FullState,
} from '@badminton/shared';
import { socket } from '../socket';

interface TournamentState {
  tournament: Tournament;
  players: Player[];
  courts: ActiveCourt[];
  upcomingRounds: UpcomingRound[];
  leaderboard: LeaderboardEntry[];
  history: MatchHistoryEntry[];
  connected: boolean;
}

type Action =
  | { type: 'SYNC_FULL_STATE'; payload: FullState }
  | { type: 'SET_TOURNAMENT'; payload: Tournament }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'SET_COURTS'; payload: ActiveCourt[] }
  | { type: 'SET_UPCOMING'; payload: UpcomingRound[] }
  | { type: 'SET_LEADERBOARD'; payload: LeaderboardEntry[] }
  | { type: 'SET_HISTORY'; payload: MatchHistoryEntry[] }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'RESET' };

const defaultTournament: Tournament = {
  courts: 2,
  mode: 'doubles',
  winPoints: 1,
  currentRound: 0,
  status: 'setup',
};

const initialState: TournamentState = {
  tournament: defaultTournament,
  players: [],
  courts: [],
  upcomingRounds: [],
  leaderboard: [],
  history: [],
  connected: false,
};

function reducer(state: TournamentState, action: Action): TournamentState {
  switch (action.type) {
    case 'SYNC_FULL_STATE':
      return {
        ...state,
        tournament: action.payload.tournament,
        players: action.payload.players,
        courts: action.payload.courts,
        upcomingRounds: action.payload.upcomingRounds,
        leaderboard: action.payload.leaderboard,
        history: action.payload.history,
      };
    case 'SET_TOURNAMENT':
      return { ...state, tournament: action.payload };
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    case 'SET_COURTS':
      return { ...state, courts: action.payload };
    case 'SET_UPCOMING':
      return { ...state, upcomingRounds: action.payload };
    case 'SET_LEADERBOARD':
      return { ...state, leaderboard: action.payload };
    case 'SET_HISTORY':
      return { ...state, history: action.payload };
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };
    case 'RESET':
      return { ...initialState, connected: state.connected };
    default:
      return state;
  }
}

const TournamentContext = createContext<TournamentState>(initialState);

export function TournamentProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    function onConnect() {
      dispatch({ type: 'SET_CONNECTED', payload: true });
    }
    function onDisconnect() {
      dispatch({ type: 'SET_CONNECTED', payload: false });
    }
    function onFullState(data: FullState) {
      dispatch({ type: 'SYNC_FULL_STATE', payload: data });
    }
    function onTournamentUpdated(data: Tournament) {
      dispatch({ type: 'SET_TOURNAMENT', payload: data });
    }
    function onPlayersUpdated(data: Player[]) {
      dispatch({ type: 'SET_PLAYERS', payload: data });
    }
    function onCourtsUpdated(data: ActiveCourt[]) {
      dispatch({ type: 'SET_COURTS', payload: data });
    }
    function onUpcomingUpdated(data: UpcomingRound[]) {
      dispatch({ type: 'SET_UPCOMING', payload: data });
    }
    function onLeaderboardUpdated(data: LeaderboardEntry[]) {
      dispatch({ type: 'SET_LEADERBOARD', payload: data });
    }
    function onHistoryUpdated(data: MatchHistoryEntry[]) {
      dispatch({ type: 'SET_HISTORY', payload: data });
    }
    function onTournamentReset() {
      dispatch({ type: 'RESET' });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('sync:full-state', onFullState);
    socket.on('tournament:updated', onTournamentUpdated);
    socket.on('players:updated', onPlayersUpdated);
    socket.on('courts:updated', onCourtsUpdated);
    socket.on('upcoming:updated', onUpcomingUpdated);
    socket.on('leaderboard:updated', onLeaderboardUpdated);
    socket.on('history:updated', onHistoryUpdated);
    socket.on('tournament:reset', onTournamentReset);

    if (socket.connected) {
      dispatch({ type: 'SET_CONNECTED', payload: true });
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('sync:full-state', onFullState);
      socket.off('tournament:updated', onTournamentUpdated);
      socket.off('players:updated', onPlayersUpdated);
      socket.off('courts:updated', onCourtsUpdated);
      socket.off('upcoming:updated', onUpcomingUpdated);
      socket.off('leaderboard:updated', onLeaderboardUpdated);
      socket.off('history:updated', onHistoryUpdated);
      socket.off('tournament:reset', onTournamentReset);
    };
  }, []);

  return (
    <TournamentContext.Provider value={state}>
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  return useContext(TournamentContext);
}
