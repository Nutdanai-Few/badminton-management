import React from 'react';
import type { ActiveCourt } from '@badminton/shared';

interface CourtCardProps {
  court: ActiveCourt;
  scoreA: string;
  scoreB: string;
  onScoreAChange: (value: string) => void;
  onScoreBChange: (value: string) => void;
}

export default function CourtCard({ court, scoreA, scoreB, onScoreAChange, onScoreBChange }: CourtCardProps) {
  const teamANames = court.teamA.map(p => p.name).join(' + ');
  const teamBNames = court.teamB.map(p => p.name).join(' + ');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="text-center mb-3">
        <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
          สนาม {court.courtNumber}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Team A */}
        <div className="flex-1 text-right">
          <p className="font-medium text-gray-800 text-sm mb-2">{teamANames}</p>
          <input
            type="number"
            min={0}
            value={scoreA}
            onChange={e => onScoreAChange(e.target.value)}
            placeholder="0"
            className="w-20 ml-auto px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {/* VS */}
        <div className="text-gray-400 font-bold text-sm flex-shrink-0">VS</div>

        {/* Team B */}
        <div className="flex-1 text-left">
          <p className="font-medium text-gray-800 text-sm mb-2">{teamBNames}</p>
          <input
            type="number"
            min={0}
            value={scoreB}
            onChange={e => onScoreBChange(e.target.value)}
            placeholder="0"
            className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
