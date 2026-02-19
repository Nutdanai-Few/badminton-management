export interface Player {
  id: number;
  name: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
}

export interface Tournament {
  courts: number;
  mode: 'singles' | 'doubles';
  winPoints: number;
  currentRound: number;
  status: 'setup' | 'playing';
}

export interface ActiveCourt {
  id: number;
  courtNumber: number;
  teamA: Player[];
  teamB: Player[];
  scoreA: number | null;
  scoreB: number | null;
  roundNumber: number;
}

export interface MatchHistoryEntry {
  id: number;
  roundNumber: number;
  courtNumber: number;
  teamANames: string[];
  teamBNames: string[];
  scoreA: number;
  scoreB: number;
  winner: 'a' | 'b';
  playedAt: string;
}

export interface LeaderboardEntry extends Player {
  rank: number;
}

export interface UpcomingRound {
  roundOffset: number;
  courts: { courtNumber: number; teamA: Player[]; teamB: Player[] }[];
  sittingOut: Player[];
}

export interface FullState {
  tournament: Tournament;
  players: Player[];
  courts: ActiveCourt[];
  upcomingRounds: UpcomingRound[];
  leaderboard: LeaderboardEntry[];
  history: MatchHistoryEntry[];
}

export interface ScoreSubmission {
  courtId: number;
  scoreA: number;
  scoreB: number;
}
