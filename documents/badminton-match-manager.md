# Badminton Match Manager — Feature Specification

## Feature Specification

ระบบจัดการแข่งขันแบดมินตันแบบ real-time ที่ผู้ใช้หลายคนสามารถเข้าถึงผ่านเว็บเบราว์เซอร์พร้อมกันได้ รองรับการจับคู่อัตโนมัติ บันทึกคะแนน ตารางอันดับ และประวัติการแข่งขัน

## Scope & Out of Scope

### In Scope
- จับคู่สุ่มอัตโนมัติ (เดี่ยว/คู่)
- บันทึกคะแนนและคำนวณผลชนะ/แพ้
- ตารางอันดับ real-time
- ประวัติการแข่งขันย้อนหลัง
- รองรับ multi-user ผ่าน WebSocket
- Deploy ผ่านอินเทอร์เน็ต

### Out of Scope
- ระบบ login / authentication
- ระบบ Room (หลายทัวร์นาเมนต์พร้อมกัน)
- ป้องกันคู่ซ้ำ / จัดสมดุลฝีมือ
- Export ข้อมูลเป็น CSV/PDF
- รอบ Playoff

## User Stories

- As a tournament organizer, I want to add players and configure courts so that I can start a tournament quickly
- As a tournament organizer, I want to enter scores so that the leaderboard updates automatically
- As a player, I want to view the leaderboard on my phone so that I know my ranking in real-time
- As a player, I want to see match history so that I can verify past results

## Acceptance Criteria

- [x] เพิ่ม/ลบผู้เล่นได้
- [x] ตั้งค่าจำนวนสนาม, โหมด (เดี่ยว/คู่), คะแนนเมื่อชนะ
- [x] สุ่มจับคู่อัตโนมัติตามสนามที่ตั้งค่า
- [x] บันทึกคะแนน → อัปเดตสถิติอัตโนมัติ
- [x] ตารางคะแนนเรียงอันดับ real-time
- [x] ประวัติแมตช์ย้อนหลัง
- [x] สุ่มคู่ใหม่โดยไม่บันทึกคะแนน
- [x] รีเซ็ตการแข่งขันทั้งหมด
- [x] ข้อมูลแชร์ร่วมกันระหว่าง client ทุกเครื่อง
- [x] เข้าถึงผ่านอินเทอร์เน็ตได้

## Architecture & Technical Design

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Real-time**: Socket.io
- **Database**: SQLite (better-sqlite3)
- **Monorepo**: pnpm workspaces (shared, server, client)

### Data Flow
1. Client ส่ง REST API → Server ประมวลผล + บันทึก DB
2. Server broadcast ผ่าน Socket.io → ทุก Client อัปเดตพร้อมกัน
3. Client ใหม่เชื่อมต่อ → ได้รับ full state ทันที

## API Contract

### REST Endpoints (`/api`)
- `GET /api/health` → `{ status: 'ok' }`
- `GET/POST/DELETE /api/players` → Player CRUD
- `GET/PUT /api/tournament` → Tournament config
- `POST /api/tournament/start` → Start tournament
- `POST /api/tournament/reset` → Reset all
- `GET /api/courts` → Active matchups
- `POST /api/courts/shuffle` → Re-shuffle
- `POST /api/courts/submit-scores` → Submit scores
- `GET /api/leaderboard` → Rankings
- `GET /api/history` → Match history

### Socket.io Events
- `sync:full-state` → Full state on connect
- `tournament:updated`, `players:updated`, `courts:updated`, `leaderboard:updated`, `history:updated`, `tournament:reset`

## Database Changes

SQLite with 4 tables: `tournament` (singleton), `players`, `active_courts`, `match_history`

## Testing Strategy

- Server: 131 tests (Vitest + supertest, in-memory SQLite)
- Client: 32 tests (Vitest + React Testing Library + jsdom)
- Coverage target: 95%+

## Todo List

- [x] Initialize monorepo structure
- [x] Setup server (Express + Socket.io + SQLite)
- [x] Setup client (Vite + React + Tailwind)
- [x] Implement all backend services and routes
- [x] Implement all frontend pages and components
- [x] Write server tests (131 passing)
- [x] Write client tests (32 passing)
- [x] Create feature document
- [x] Update README
- [ ] Deploy to production (Render/Railway/VPS)
