import type Database from 'better-sqlite3';
import type { ScoreSubmission } from '@badminton/shared';

export function submitScores(db: Database.Database, scores: ScoreSubmission[]): void {
  const getCourt = db.prepare('SELECT * FROM active_courts WHERE id = ?');
  const getPlayer = db.prepare('SELECT * FROM players WHERE id = ?');
  const updatePlayer = db.prepare(
    `UPDATE players SET matches_played = matches_played + 1, wins = wins + ?, losses = losses + ?, points = points + ? WHERE id = ?`
  );
  const insertHistory = db.prepare(
    `INSERT INTO match_history (round_number, court_number, team_a_names, team_b_names, score_a, score_b, winner)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const getTournament = db.prepare('SELECT * FROM tournament WHERE id = 1');

  const tournament = getTournament.get() as any;
  const winPoints = tournament.win_points;

  const transaction = db.transaction(() => {
    for (const score of scores) {
      const court = getCourt.get(score.courtId) as any;
      if (!court) throw new Error(`Court ${score.courtId} not found`);

      const teamAIds: number[] = JSON.parse(court.team_a_player_ids);
      const teamBIds: number[] = JSON.parse(court.team_b_player_ids);

      const teamANames = teamAIds.map(id => {
        const p = getPlayer.get(id) as any;
        return p?.name || 'Unknown';
      });
      const teamBNames = teamBIds.map(id => {
        const p = getPlayer.get(id) as any;
        return p?.name || 'Unknown';
      });

      const winner: 'a' | 'b' = score.scoreA > score.scoreB ? 'a' : 'b';

      // Update team A players
      for (const id of teamAIds) {
        const isWin = winner === 'a' ? 1 : 0;
        const isLoss = winner === 'b' ? 1 : 0;
        const pts = winner === 'a' ? winPoints : 0;
        updatePlayer.run(isWin, isLoss, pts, id);
      }

      // Update team B players
      for (const id of teamBIds) {
        const isWin = winner === 'b' ? 1 : 0;
        const isLoss = winner === 'a' ? 1 : 0;
        const pts = winner === 'b' ? winPoints : 0;
        updatePlayer.run(isWin, isLoss, pts, id);
      }

      insertHistory.run(
        court.round_number,
        court.court_number,
        JSON.stringify(teamANames),
        JSON.stringify(teamBNames),
        score.scoreA,
        score.scoreB,
        winner
      );
    }
  });

  transaction();
}
