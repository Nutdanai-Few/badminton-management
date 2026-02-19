import React from 'react';
import type { MatchHistoryEntry } from '@badminton/shared';

interface MatchHistoryListProps {
  matches: MatchHistoryEntry[];
}

export default function MatchHistoryList({ matches }: MatchHistoryListProps) {
  if (matches.length === 0) {
    return <p className="text-gray-400 text-center py-8">ยังไม่มีแมตช์</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-600">
            <th className="px-3 py-3 text-center font-medium">รอบ</th>
            <th className="px-3 py-3 text-center font-medium">สนาม</th>
            <th className="px-3 py-3 text-right font-medium">ทีม A</th>
            <th className="px-3 py-3 text-center font-medium">สกอร์</th>
            <th className="px-3 py-3 text-left font-medium">ทีม B</th>
          </tr>
        </thead>
        <tbody>
          {matches.map(match => (
            <tr key={match.id} className="border-t border-gray-100">
              <td className="px-3 py-3 text-center text-gray-500">{match.roundNumber}</td>
              <td className="px-3 py-3 text-center text-gray-500">{match.courtNumber}</td>
              <td
                className={`px-3 py-3 text-right font-medium ${
                  match.winner === 'a' ? 'text-green-600' : 'text-gray-600'
                }`}
              >
                {match.teamANames.join(' + ')}
              </td>
              <td className="px-3 py-3 text-center font-bold text-gray-800">
                {match.scoreA} - {match.scoreB}
              </td>
              <td
                className={`px-3 py-3 text-left font-medium ${
                  match.winner === 'b' ? 'text-green-600' : 'text-gray-600'
                }`}
              >
                {match.teamBNames.join(' + ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
