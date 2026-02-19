import React from 'react';
import { useTournament } from '../context/TournamentContext';
import LeaderboardTable from '../components/LeaderboardTable';

export default function LeaderboardPage() {
  const { leaderboard } = useTournament();

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-800 mb-4">ตารางคะแนน</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <LeaderboardTable entries={leaderboard} />
      </div>
    </div>
  );
}
