import React from 'react';
import type { Tournament } from '@badminton/shared';

interface ConfigFormProps {
  config: Tournament;
  onChange: (config: { courts?: number; mode?: 'singles' | 'doubles'; winPoints?: number }) => void;
  disabled?: boolean;
}

export default function ConfigForm({ config, onChange, disabled }: ConfigFormProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          จำนวนสนาม
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={config.courts}
          onChange={e => onChange({ courts: parseInt(e.target.value, 10) || 1 })}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          โหมด
        </label>
        <select
          value={config.mode}
          onChange={e => onChange({ mode: e.target.value as 'singles' | 'doubles' })}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
        >
          <option value="singles">เดี่ยว (Singles)</option>
          <option value="doubles">คู่ (Doubles)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          คะแนนเมื่อชนะ
        </label>
        <input
          type="number"
          min={1}
          max={100}
          value={config.winPoints}
          onChange={e => onChange({ winPoints: parseInt(e.target.value, 10) || 1 })}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
        />
      </div>
    </div>
  );
}
