import React from 'react';
import type { Player } from '@badminton/shared';

interface PlayerListProps {
  players: Player[];
  onRemove: (id: number) => void;
  disabled?: boolean;
}

export default function PlayerList({ players, onRemove, disabled }: PlayerListProps) {
  if (players.length === 0) {
    return <p className="text-gray-400 text-sm py-4 text-center">ยังไม่มีผู้เล่น</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {players.map(player => (
        <span
          key={player.id}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-full text-sm font-medium"
        >
          {player.name}
          {!disabled && (
            <button
              onClick={() => onRemove(player.id)}
              className="ml-1 text-emerald-400 hover:text-red-500 transition-colors"
              aria-label={`ลบ ${player.name}`}
            >
              &times;
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
