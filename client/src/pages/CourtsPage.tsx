import React, { useState, useEffect } from 'react';
import { useTournament } from '../context/TournamentContext';
import { api } from '../api';
import CourtCard from '../components/CourtCard';
import ConfirmDialog from '../components/ConfirmDialog';
import type { UpcomingRound } from '@badminton/shared';

export default function CourtsPage() {
  const { tournament, courts, players, upcomingRounds } = useTournament();
  const [scores, setScores] = useState<Record<number, { a: string; b: string }>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showShuffleDialog, setShowShuffleDialog] = useState(false);

  // Reset scores when courts change
  useEffect(() => {
    const initial: Record<number, { a: string; b: string }> = {};
    for (const court of courts) {
      initial[court.id] = { a: '', b: '' };
    }
    setScores(initial);
  }, [courts]);

  if (tournament.status !== 'playing') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">ยังไม่ได้เริ่มการแข่งขัน</p>
        <p className="text-gray-400 text-sm mt-1">ไปที่แท็บ "ตั้งค่า" เพื่อเริ่มต้น</p>
      </div>
    );
  }

  // Determine sitting-out players
  const activePlayerIds = new Set<number>();
  for (const court of courts) {
    court.teamA.forEach(p => activePlayerIds.add(p.id));
    court.teamB.forEach(p => activePlayerIds.add(p.id));
  }
  const sittingOut = players.filter(p => !activePlayerIds.has(p.id));

  const allScoresFilled = courts.every(court => {
    const s = scores[court.id];
    return s && s.a !== '' && s.b !== '' && s.a !== s.b;
  });

  async function handleSubmitScores() {
    setError('');
    setLoading(true);
    try {
      const scoreData = courts.map(court => ({
        courtId: court.id,
        scoreA: parseInt(scores[court.id]?.a || '0', 10),
        scoreB: parseInt(scores[court.id]?.b || '0', 10),
      }));
      await api.submitScores(scoreData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleShuffle() {
    setShowShuffleDialog(false);
    setError('');
    try {
      await api.shuffle();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">
          รอบที่ {tournament.currentRound}
        </h2>
        <span className="text-sm text-gray-500">
          {tournament.mode === 'singles' ? 'เดี่ยว' : 'คู่'} | {tournament.courts} สนาม
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courts.map(court => (
          <CourtCard
            key={court.id}
            court={court}
            scoreA={scores[court.id]?.a || ''}
            scoreB={scores[court.id]?.b || ''}
            onScoreAChange={val =>
              setScores(prev => ({
                ...prev,
                [court.id]: { ...prev[court.id], a: val },
              }))
            }
            onScoreBChange={val =>
              setScores(prev => ({
                ...prev,
                [court.id]: { ...prev[court.id], b: val },
              }))
            }
          />
        ))}
      </div>

      {sittingOut.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <span className="font-medium text-amber-700">พักรอบนี้: </span>
          <span className="text-amber-600">{sittingOut.map(p => p.name).join(', ')}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSubmitScores}
          disabled={!allScoresFilled || loading}
          className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'กำลังบันทึก...' : 'บันทึกผลรอบนี้'}
        </button>
        <button
          onClick={() => setShowShuffleDialog(true)}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors"
        >
          สุ่มใหม่
        </button>
      </div>

      {/* Upcoming rounds queue */}
      {upcomingRounds.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-base font-bold text-gray-700">คิวรอบถัดไป</h3>
          {upcomingRounds.map(round => (
            <UpcomingRoundCard
              key={round.roundOffset}
              round={round}
              currentRound={tournament.currentRound}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showShuffleDialog}
        title="สุ่มคู่ใหม่"
        message="จะสุ่มคู่ใหม่โดยไม่บันทึกคะแนนรอบนี้ ยืนยันหรือไม่?"
        onConfirm={handleShuffle}
        onCancel={() => setShowShuffleDialog(false)}
      />
    </div>
  );
}

function UpcomingRoundCard({
  round,
  currentRound,
}: {
  round: UpcomingRound;
  currentRound: number;
}) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-blue-700">
          รอบที่ {currentRound + round.roundOffset}
        </span>
        {round.sittingOut.length > 0 && (
          <span className="text-xs text-blue-500">
            พัก: {round.sittingOut.map(p => p.name).join(', ')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {round.courts.map(court => (
          <div
            key={court.courtNumber}
            className="bg-white rounded-lg p-3 text-sm border border-blue-100"
          >
            <div className="text-center text-xs text-blue-500 font-medium mb-1">
              สนาม {court.courtNumber}
            </div>
            <div className="flex items-center justify-center gap-2 text-gray-700">
              <span className="font-medium text-right flex-1">
                {court.teamA.map(p => p.name).join(' + ')}
              </span>
              <span className="text-gray-400 text-xs flex-shrink-0">vs</span>
              <span className="font-medium text-left flex-1">
                {court.teamB.map(p => p.name).join(' + ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
