const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Players
  getPlayers: () => request('/players'),
  addPlayers: (names: string[]) =>
    request('/players', { method: 'POST', body: JSON.stringify({ names }) }),
  removePlayer: (id: number) =>
    request(`/players/${id}`, { method: 'DELETE' }),
  removeAllPlayers: () =>
    request('/players', { method: 'DELETE' }),

  // Tournament
  getTournament: () => request('/tournament'),
  updateConfig: (config: { courts?: number; mode?: string; winPoints?: number }) =>
    request('/tournament/config', { method: 'PUT', body: JSON.stringify(config) }),
  startTournament: () =>
    request('/tournament/start', { method: 'POST' }),
  resetTournament: () =>
    request('/tournament/reset', { method: 'POST' }),

  // Courts
  getCourts: () => request('/courts'),
  shuffle: () => request('/courts/shuffle', { method: 'POST' }),
  submitScores: (scores: { courtId: number; scoreA: number; scoreB: number }[]) =>
    request('/courts/submit-scores', { method: 'POST', body: JSON.stringify({ scores }) }),

  // Leaderboard & History
  getLeaderboard: () => request('/leaderboard'),
  getHistory: () => request('/history'),
};
