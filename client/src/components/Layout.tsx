import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTournament } from '../context/TournamentContext';

const navItems = [
  { to: '/', label: 'ตั้งค่า' },
  { to: '/courts', label: 'สนามแข่ง' },
  { to: '/leaderboard', label: 'อันดับ' },
  { to: '/history', label: 'ประวัติ' },
];

export default function Layout() {
  const { connected } = useTournament();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-600 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Badminton Manager</h1>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                connected ? 'bg-green-300' : 'bg-red-400'
              }`}
            />
            <span className="hidden sm:inline">
              {connected ? 'เชื่อมต่อแล้ว' : 'ขาดการเชื่อมต่อ'}
            </span>
          </div>
        </div>
        <nav className="max-w-4xl mx-auto px-4">
          <div className="flex gap-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    isActive
                      ? 'bg-white text-emerald-700'
                      : 'text-emerald-100 hover:bg-emerald-500'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
