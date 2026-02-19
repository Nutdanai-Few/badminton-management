# Badminton Match Manager

ระบบจัดคู่แข่งแบดมินตัน + บันทึกคะแนน + สรุปอันดับอัตโนมัติ แบบ **real-time**

เว็บแอปที่ผู้ใช้หลายคนสามารถเข้าถึงพร้อมกันผ่านเบราว์เซอร์ ทุกคนเห็นข้อมูลเดียวกัน อัปเดตทันที

<!-- เพิ่มภาพ screenshot หลังพัฒนาเสร็จ
## ภาพตัวอย่าง (Screenshots)
![หน้าตั้งค่า](docs/screenshots/setup.png)
![สนามแข่ง](docs/screenshots/courts.png)
![ตารางคะแนน](docs/screenshots/leaderboard.png)
-->

---

## สารบัญ (Table of Contents)

- [คุณสมบัติหลัก](#คุณสมบัติหลัก-features)
- [Tech Stack](#tech-stack)
- [ความต้องการของระบบ](#ความต้องการของระบบ-requirements)
- [วิธีติดตั้ง](#วิธีติดตั้ง-installation)
- [วิธีใช้งาน](#วิธีใช้งาน-usage)
- [ตารางคะแนน](#ตารางคะแนน-leaderboard)
- [ประวัติการแข่งขัน](#ประวัติการแข่งขัน-match-history)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์-project-structure)
- [API](#api)
- [การแก้ปัญหา](#การแก้ปัญหา-troubleshooting)
- [แนวทางพัฒนาต่อ](#แนวทางพัฒนาต่อ-roadmap)
- [เวอร์ชัน](#เวอร์ชัน-changelog)
- [ใบอนุญาต](#ใบอนุญาต-license)

---

## คุณสมบัติหลัก (Features)

| ฟีเจอร์ | รายละเอียด |
|---|---|
| จับคู่อัตโนมัติ | สุ่มจับคู่เดี่ยว (Singles) หรือ คู่ (Doubles) ตามจำนวนสนามที่ตั้งค่า |
| ตั้งค่าสนามได้ | กำหนดจำนวนสนามได้ตามต้องการ |
| บันทึกคะแนน | กรอกสกอร์แต่ละสนาม ระบบคำนวณผลชนะ/แพ้ให้อัตโนมัติ |
| ตารางอันดับ real-time | แสดงสถิติ แข่ง/ชนะ/แพ้/คะแนนรวม อัปเดตทันทีทุกเครื่อง |
| ประวัติแมตช์ | เก็บผลทุกแมตช์ย้อนหลัง ตรวจสอบได้ตลอด |
| สุ่มรอบใหม่ | เปลี่ยนคู่ได้ทันทีโดยไม่กระทบสถิติเดิม |
| Multi-user | ผู้ใช้หลายคนเข้าพร้อมกัน เห็นข้อมูลเดียวกัน real-time |
| รองรับมือถือ | Responsive design ใช้ได้ทั้งคอมพิวเตอร์และมือถือ |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Real-time | Socket.io (WebSocket) |
| Database | SQLite (better-sqlite3) |
| Package Manager | pnpm (workspaces) |
| Testing | Vitest + React Testing Library + Supertest |

---

## ความต้องการของระบบ (Requirements)

### สำหรับผู้ใช้งาน
- เว็บเบราว์เซอร์สมัยใหม่ (Chrome, Edge, Safari, Firefox)
- อินเทอร์เน็ต (เพื่อเชื่อมต่อกับ server)

### สำหรับ Developer / ผู้ติดตั้ง
- Node.js v18+
- pnpm v9+

---

## วิธีติดตั้ง (Installation)

### Development

```bash
# Clone repository
git clone <repository-url>
cd Badminton

# ติดตั้ง dependencies
pnpm install

# รัน development server (frontend + backend พร้อมกัน)
pnpm dev
```

เปิดเบราว์เซอร์ที่ `http://localhost:5173`

### Production Build

```bash
# Build ทุก package
pnpm build

# Start production server
pnpm start
```

เปิดเบราว์เซอร์ที่ `http://localhost:3000`

### Deploy

Server เดียวรันทั้ง API + static files ได้เลย

- **Build command:** `pnpm install && pnpm build`
- **Start command:** `pnpm start`
- **Environment:** `NODE_ENV=production`, `PORT=3000`

รองรับ Render, Railway, VPS หรือ hosting ใดก็ได้ที่รัน Node.js

---

## วิธีใช้งาน (Usage)

### ขั้นตอนตั้งค่า

1. ใส่รายชื่อผู้เล่น (1 คน ต่อ 1 บรรทัด)
2. ตั้งค่า:
   - **จำนวนสนาม** — กี่สนามที่ใช้แข่งพร้อมกัน
   - **โหมด** — เดี่ยว (Singles) หรือ คู่ (Doubles)
   - **คะแนนเมื่อชนะ** — คะแนนที่ผู้ชนะจะได้รับในแต่ละแมตช์
3. กด **เริ่มการแข่งขัน**

### ขั้นตอนแข่งขัน

1. ระบบจะสุ่มคู่และจัดลงสนามให้อัตโนมัติ
2. แข่งขันตามสนามที่กำหนด
3. กรอกคะแนนของแต่ละสนาม
4. กด **บันทึกผลรอบนี้**

ระบบจะทำสิ่งต่อไปนี้อัตโนมัติ:
- บันทึกผลแมตช์ลงประวัติการแข่งขัน
- อัปเดตสถิติ แข่ง/ชนะ/แพ้/คะแนน ของผู้เล่นแต่ละคน
- อัปเดตตารางอันดับ (ทุกเครื่องที่เชื่อมต่ออยู่จะเห็นทันที)
- สุ่มคู่ใหม่สำหรับรอบถัดไป

### ปุ่มเพิ่มเติม

| ปุ่ม | การทำงาน |
|---|---|
| **สุ่มใหม่** | เปลี่ยนคู่ทันทีโดยไม่กระทบสถิติ |
| **รีเซ็ตการแข่งขัน** | ลบข้อมูลทั้งหมด เริ่มต้นใหม่ |

---

## ตารางคะแนน (Leaderboard)

แสดงข้อมูลผู้เล่นทุกคนในรูปแบบตาราง:

| คอลัมน์ | ความหมาย |
|---|---|
| อันดับ | ลำดับตามคะแนนรวม (มากไปน้อย) |
| ชื่อ | ชื่อผู้เล่น |
| แข่ง | จำนวนแมตช์ที่ลงแข่ง |
| ชนะ | จำนวนแมตช์ที่ชนะ |
| แพ้ | จำนวนแมตช์ที่แพ้ |
| คะแนนรวม | คะแนนสะสมทั้งหมด |

---

## ประวัติการแข่งขัน (Match History)

บันทึกทุกแมตช์ที่แข่งเสร็จแล้ว แสดงในรูปแบบ:

| รอบ | สนาม | ทีม A | สกอร์ | ทีม B |
|---|---|---|---|---|
| 1 | 1 | สมชาย + สมหญิง | 21 - 18 | สมศักดิ์ + สมศรี |
| 1 | 2 | สมชาย | 15 - 21 | สมศักดิ์ |

ทีมที่ชนะจะแสดงสีเขียว ใช้สำหรับตรวจสอบผลย้อนหลัง

---

## โครงสร้างโปรเจกต์ (Project Structure)

```
Badminton/
├── shared/              # Shared TypeScript types
├── server/              # Express + Socket.io backend
│   └── src/
│       ├── routes/      # REST API endpoints
│       ├── services/    # Business logic (matchmaker, scoring, tournament)
│       └── socket/      # WebSocket event handlers
├── client/              # React + Vite frontend
│   └── src/
│       ├── pages/       # SetupPage, CourtsPage, LeaderboardPage, HistoryPage
│       ├── components/  # Reusable UI components
│       └── context/     # TournamentContext (global state)
└── documents/           # Feature specifications
```

---

## API

### REST Endpoints (`/api`)

| Method | Path | คำอธิบาย |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/players` | รายชื่อผู้เล่น |
| POST | `/api/players` | เพิ่มผู้เล่น `{ names: string[] }` |
| DELETE | `/api/players/:id` | ลบผู้เล่น |
| GET | `/api/tournament` | สถานะการแข่งขัน |
| PUT | `/api/tournament/config` | ตั้งค่า `{ courts, mode, winPoints }` |
| POST | `/api/tournament/start` | เริ่มแข่งขัน |
| POST | `/api/tournament/reset` | รีเซ็ตทั้งหมด |
| GET | `/api/courts` | สนามปัจจุบัน |
| POST | `/api/courts/shuffle` | สุ่มคู่ใหม่ |
| POST | `/api/courts/submit-scores` | บันทึกคะแนน |
| GET | `/api/leaderboard` | ตารางอันดับ |
| GET | `/api/history` | ประวัติแมตช์ |

### Real-time (Socket.io)

Server broadcast events ไปยังทุก client เมื่อมีการเปลี่ยนแปลง:
- `sync:full-state` — ส่ง state ทั้งหมดเมื่อเชื่อมต่อ
- `tournament:updated` / `players:updated` / `courts:updated` / `leaderboard:updated` / `history:updated`

---

## การแก้ปัญหา (Troubleshooting)

| ปัญหา | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| ข้อมูลไม่อัปเดต | WebSocket ขาดการเชื่อมต่อ | ดูสถานะจุดสีเขียว/แดง มุมบนขวา รีเฟรชหน้าเว็บ |
| กดบันทึกแล้วไม่มีผล | กรอกคะแนนไม่ครบหรือคะแนนเท่ากัน | ตรวจสอบว่ากรอกครบและไม่เสมอกัน |
| Server start ไม่ได้ | Port 3000 ถูกใช้อยู่ | เปลี่ยน port: `PORT=3001 pnpm start` |
| หน้าจอแสดงผลเพี้ยน | เบราว์เซอร์เวอร์ชันเก่า | อัปเดตเบราว์เซอร์เป็นเวอร์ชันล่าสุด |

---

## Testing

```bash
# รัน tests ทั้งหมด
pnpm test

# รัน tests พร้อม coverage
pnpm test:coverage
```

- Server: 131 tests (services, routes, socket, database)
- Client: 32 tests (components, pages)

---

## แนวทางพัฒนาต่อ (Roadmap)

- [ ] ระบบป้องกันคู่ซ้ำ — ลดโอกาสที่ผู้เล่นคนเดิมจะจับคู่กันบ่อยเกินไป
- [ ] จัดสมดุลฝีมือ — จับคู่โดยคำนึงถึงระดับคะแนนของผู้เล่น
- [ ] รอบชิงชนะเลิศ — จัดรอบ Playoff สำหรับผู้เล่นอันดับสูงสุดท้ายวัน
- [ ] Export ข้อมูล — ส่งออกตารางคะแนนและประวัติเป็นไฟล์ CSV หรือ PDF
- [ ] แสดงผลบนจอทีวี — โหมดหน้าจอขนาดใหญ่สำหรับแสดงหน้าสนาม
- [ ] ระบบ Room — รองรับหลายกลุ่ม/หลายทัวร์นาเมนต์พร้อมกัน

---

## เวอร์ชัน (Changelog)

| เวอร์ชัน | วันที่ | รายละเอียด |
|---|---|---|
| v1.0 | 2026-02-19 | เวอร์ชันแรก: จับคู่ real-time, บันทึกคะแนน, ตารางอันดับ, ประวัติแมตช์, WebSocket multi-user |

---

## ใบอนุญาต (License)

โปรเจกต์นี้เผยแพร่ภายใต้ **MIT License** — ใช้งานได้อิสระทั้งส่วนตัวและเชิงพาณิชย์ สามารถคัดลอก แก้ไข และแจกจ่ายต่อได้โดยไม่มีข้อจำกัด

---

## ผู้พัฒนา (Author)

<!-- เพิ่มข้อมูลผู้พัฒนาตรงนี้ -->
- **ชื่อ:** _ระบุชื่อผู้พัฒนา_
- **ติดต่อ:** _ระบุช่องทางติดต่อ เช่น Email, LINE_
