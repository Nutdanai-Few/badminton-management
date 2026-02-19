import React from 'react';
import type { LeaderboardEntry } from '@badminton/shared';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
}

export default function LeaderboardTable({ entries }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return <p className="text-gray-400 text-center py-8">ยังไม่มีข้อมูล</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-600">
            <th className="px-4 py-3 text-center font-medium">อันดับ</th>
            <th className="px-4 py-3 text-left font-medium">ชื่อ</th>
            <th className="px-4 py-3 text-center font-medium">แข่ง</th>
            <th className="px-4 py-3 text-center font-medium">ชนะ</th>
            <th className="px-4 py-3 text-center font-medium">แพ้</th>
            <th className="px-4 py-3 text-center font-medium">คะแนน</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr
              key={entry.id}
              className={`border-t border-gray-100 ${
                entry.rank === 1
                  ? 'bg-yellow-50'
                  : entry.rank === 2
                    ? 'bg-gray-50'
                    : entry.rank === 3
                      ? 'bg-orange-50'
                      : ''
              }`}
            >
              <td className="px-4 py-3 text-center font-bold">
                {entry.rank === 1 && '🥇 '}
                {entry.rank === 2 && '🥈 '}
                {entry.rank === 3 && '🥉 '}
                {entry.rank > 3 && entry.rank}
              </td>
              <td className="px-4 py-3 font-medium text-gray-800">{entry.name}</td>
              <td className="px-4 py-3 text-center text-gray-600">{entry.matchesPlayed}</td>
              <td className="px-4 py-3 text-center text-green-600 font-medium">{entry.wins}</td>
              <td className="px-4 py-3 text-center text-red-500 font-medium">{entry.losses}</td>
              <td className="px-4 py-3 text-center font-bold text-emerald-700">{entry.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
