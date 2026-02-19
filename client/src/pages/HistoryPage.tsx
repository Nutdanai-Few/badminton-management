import React from 'react';
import { useTournament } from '../context/TournamentContext';
import MatchHistoryList from '../components/MatchHistoryList';

export default function HistoryPage() {
  const { history } = useTournament();

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-800 mb-4">ประวัติการแข่งขัน</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <MatchHistoryList matches={history} />
      </div>
    </div>
  );
}
