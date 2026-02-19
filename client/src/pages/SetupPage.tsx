import React, { useState } from 'react';
import { useTournament } from '../context/TournamentContext';
import { api } from '../api';
import PlayerList from '../components/PlayerList';
import ConfigForm from '../components/ConfigForm';
import ConfirmDialog from '../components/ConfirmDialog';

export default function SetupPage() {
  const { tournament, players } = useTournament();
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const isPlaying = tournament.status === 'playing';
  const playersPerMatch = tournament.mode === 'singles' ? 2 : 4;
  const minPlayers = tournament.courts * playersPerMatch;

  async function handleAddPlayers() {
    const names = nameInput
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);
    if (names.length === 0) return;

    setError('');
    try {
      await api.addPlayers(names);
      setNameInput('');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRemovePlayer(id: number) {
    try {
      await api.removePlayer(id);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleConfigChange(config: { courts?: number; mode?: string; winPoints?: number }) {
    try {
      await api.updateConfig(config);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleStart() {
    setError('');
    setLoading(true);
    try {
      await api.startTournament();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setShowResetDialog(false);
    setError('');
    try {
      await api.resetTournament();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">รายชื่อผู้เล่น</h2>

        {!isPlaying && (
          <div className="mb-4">
            <textarea
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder={"พิมพ์ชื่อผู้เล่น 1 คนต่อ 1 บรรทัด\nเช่น:\nสมชาย\nสมหญิง\nสมศักดิ์"}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            />
            <button
              onClick={handleAddPlayers}
              disabled={!nameInput.trim()}
              className="mt-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              เพิ่มผู้เล่น
            </button>
          </div>
        )}

        <div className="mb-2 text-sm text-gray-500">
          ผู้เล่นทั้งหมด: {players.length} คน
          {!isPlaying && players.length < minPlayers && (
            <span className="text-amber-600 ml-2">
              (ต้องมีอย่างน้อย {minPlayers} คน)
            </span>
          )}
        </div>
        <PlayerList
          players={players}
          onRemove={handleRemovePlayer}
          disabled={isPlaying}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">ตั้งค่าการแข่งขัน</h2>
        <ConfigForm
          config={tournament}
          onChange={handleConfigChange}
          disabled={isPlaying}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {!isPlaying ? (
          <button
            onClick={handleStart}
            disabled={players.length < minPlayers || loading}
            className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'กำลังเริ่ม...' : 'เริ่มการแข่งขัน'}
          </button>
        ) : (
          <button
            onClick={() => setShowResetDialog(true)}
            className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors"
          >
            รีเซ็ตการแข่งขัน
          </button>
        )}
      </div>

      <ConfirmDialog
        open={showResetDialog}
        title="รีเซ็ตการแข่งขัน"
        message="ข้อมูลทั้งหมด (ผู้เล่น, คะแนน, ประวัติ) จะถูกลบหมด ยืนยันหรือไม่?"
        onConfirm={handleReset}
        onCancel={() => setShowResetDialog(false)}
      />
    </div>
  );
}
