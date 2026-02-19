import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TournamentProvider } from './context/TournamentContext';
import Layout from './components/Layout';
import SetupPage from './pages/SetupPage';
import CourtsPage from './pages/CourtsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <TournamentProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<SetupPage />} />
            <Route path="/courts" element={<CourtsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TournamentProvider>
  );
}
