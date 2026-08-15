# PWA: ติดตั้งเป็นแอป + ลากลงเพื่อรีเฟรช

## Feature specification

ทำให้ Badminton Scheduler ติดตั้งลงหน้าจอหลัก (Add to Home Screen) ได้เหมือนแอป และเพิ่มท่าทาง
"ลากลงเพื่อรีเฟรช" (pull-to-refresh) บนมือถือ

1. **แบนเนอร์ติดตั้ง** — เด้งขึ้นด้านล่างจอเมื่อเบราว์เซอร์บอกว่าติดตั้งได้ (`beforeinstallprompt`)
   หรือเมื่ออยู่บน iOS Safari (ซึ่งไม่มี event นั้น จึงต้องบอกวิธีทำเอง)
2. **ปิดแบนเนอร์ได้** — มีปุ่มกากบาท กดแล้วแบนเนอร์หาย และ *ไม่* กลับมากวนอีกเป็นเวลา 7 วัน
   (จำไว้ใน localStorage)
3. **ไอคอนติดตั้งค้างไว้** — เมื่อปิดแบนเนอร์แล้ว แต่ยังไม่ได้ติดตั้ง จะมีไอคอนติดตั้งเล็ก ๆ
   อยู่บน header ตลอด กดเมื่อไหร่ก็ติดตั้งได้ ไอคอนจะหายไปเองเมื่อติดตั้งสำเร็จ
   หรือเมื่อเปิดจากแอปที่ติดตั้งแล้ว (standalone)
4. **ลากลงเพื่อรีเฟรช** — ลากนิ้วลงตอนอยู่บนสุดของหน้า เกินระยะที่กำหนดแล้วปล่อย = โหลดหน้าใหม่

## Scope

ในขอบเขต:
- `manifest.webmanifest` + ไอคอน PNG (192/512/maskable/apple-touch)
- Service worker สำหรับ installability + offline fallback ของ app shell
- แบนเนอร์ติดตั้ง + ปุ่มไอคอนบน header + คำแนะนำสำหรับ iOS
- Pull-to-refresh พร้อมตัวบ่งชี้ (indicator) และ haptic-free UX
- โมดูลตรรกะบริสุทธิ์ `pwa.js` + เทสต์

นอกขอบเขต (ตั้งใจไม่ทำ):
- **Offline write / queue** — แอปพึ่ง Firebase Realtime DB เป็นแหล่งความจริง การแก้ไขตอนออฟไลน์
  แล้ว sync ทีหลังไม่อยู่ในงานนี้ (SW แคชแค่ไฟล์ static ไม่แตะข้อมูล)
- Push notification / background sync
- ปุ่ม "อัปเดตเวอร์ชันใหม่" แบบมี prompt (SW ใช้ network-first อยู่แล้ว เปิดใหม่ก็ได้ของใหม่)
- Pull-to-refresh บนเดสก์ท็อป (เมาส์) — ทำเฉพาะ touch

## User stories

- **As a** ผู้จัดก๊วน, **I want** กดติดตั้งแอปลงหน้าจอโฮม **so that** เปิดใช้งานเร็วโดยไม่ต้องหาลิงก์
- **As a** คนที่ไม่อยากติดตั้ง, **I want** ปิดแบนเนอร์ได้ **so that** มันไม่บังหน้าจอทุกครั้งที่เข้า
- **As a** คนที่ปิดแบนเนอร์ไปแล้วแต่เปลี่ยนใจ, **I want** ไอคอนติดตั้งที่ยังอยู่ **so that** ติดตั้งได้ทีหลัง
- **As a** คนดูตารางระหว่างเล่น, **I want** ลากลงเพื่อรีเฟรช **so that** ดึงข้อมูลล่าสุดได้เหมือนแอปทั่วไป

## Acceptance criteria

- [x] เปิดผ่าน https (หรือ localhost) แล้ว Chrome/Edge Android เสนอให้ติดตั้งได้จริง
- [x] แบนเนอร์แสดงเฉพาะเมื่อ "ติดตั้งได้ + ยังไม่ติดตั้ง + ยังไม่ถูกปิดภายใน 7 วัน"
- [x] กดปิดแบนเนอร์ → แบนเนอร์หาย, ไอคอนบน header โผล่แทน
- [x] ติดตั้งสำเร็จ (`appinstalled`) หรือเปิดแบบ standalone → ทั้งแบนเนอร์และไอคอนหายถาวร
- [x] iOS Safari → แบนเนอร์บอกวิธี (แชร์ → เพิ่มไปยังหน้าจอโฮม) ปิดได้เหมือนกัน
- [x] ลากลงจากบนสุด > 70px แล้วปล่อย → หน้าโหลดใหม่; ลากไม่ถึงเกณฑ์ → เด้งกลับ ไม่รีโหลด
- [x] ลากลงตอนไม่ได้อยู่บนสุด / ตอนเปิด live scorer หรือ QR modal → ไม่ทำงาน
- [x] `npm test` ผ่านทั้งหมด รวมเทสต์ใหม่ของ `pwa.js`

## Architecture & technical design

ยึดแนวเดิมของโปรเจกต์: **ตรรกะบริสุทธิ์แยกไฟล์ + เทสต์** ส่วน DOM/side-effect อยู่ใน `script.js`

| ไฟล์ | หน้าที่ |
| --- | --- |
| `pwa.js` (global `PWA`) | ตรรกะบริสุทธิ์: ควรโชว์แบนเนอร์/ไอคอนไหม, ตรวจ standalone, ตรวจ iOS, คณิตศาสตร์ของ pull-to-refresh (`createPullTracker`) |
| `pwa.test.js` | เทสต์ของข้างบน (`node --test`) |
| `manifest.webmanifest` | ชื่อแอป, ไอคอน, `display: standalone`, สี |
| `sw.js` | service worker: precache app shell, network-first (same-origin), stale-while-revalidate (CDN) |
| `icons/*.png` | ไอคอน 192 / 512 / maskable 512 / apple-touch 180 |
| `tools/make-icons.js` | สคริปต์สร้างไฟล์ไอคอนซ้ำได้ (ใช้ `zlib` ของ Node ล้วน ๆ ไม่มี dependency) |
| `index.html` | `<link rel=manifest>`, meta ต่าง ๆ, markup ของแบนเนอร์ / ปุ่ม header / indicator |
| `style.css` | สไตล์แบนเนอร์, ปุ่มติดตั้ง, PTR indicator (ใช้ design token เดิม + รองรับ dark) |
| `script.js` | wiring: `beforeinstallprompt`, `appinstalled`, ปุ่มปิด, ปุ่มติดตั้ง, touch handler ของ PTR, register SW |

Data flow ของแบนเนอร์:

```
beforeinstallprompt ──► เก็บ event ไว้ ──┐
เป็น iOS Safari ────────────────────────┼─► PWA.installAvailability() ─► 'prompt' | 'ios' | 'none'
เปิดแบบ standalone / appinstalled ─────┘                │
                                                        ├─► PWA.shouldShowBanner(..., dismissedAt, now)
                                                        └─► PWA.shouldShowIcon(...)
```

### Pull-to-refresh

`createPullTracker` เป็น state machine บริสุทธิ์ (ไม่มี DOM):
`start(y, atTop)` → `move(y)` → `end()` คืน `{ refresh }`
ระยะที่แสดงผลผ่าน "resistance" (ลากจริง 2 หน่วย ได้ระยะ 1 หน่วย) และ clamp ที่ค่าสูงสุด
`script.js` แค่แปะ `touchstart/touchmove/touchend` แล้วเอา `distance`/`ready` ไปวาด indicator

หน้าเว็บ scroll ที่ `document` (ไม่มี scroll container ซ้อน) เงื่อนไข "อยู่บนสุด" จึงเป็น
`window.scrollY <= 0` **และ** element ที่นิ้วแตะไม่ได้อยู่ในกล่องที่เลื่อนอยู่ (`scrollTop > 0`)
และปิด native pull-to-refresh ของเบราว์เซอร์ด้วย `overscroll-behavior-y: contain` เพื่อไม่ให้ซ้อนกัน

## Database changes

ไม่มี — ไม่แตะ Firebase state, ไม่แตะ `sync-guard.js`
localStorage เพิ่มคีย์เดียว: `bmInstallDismissedAt` (timestamp ที่กดปิดแบนเนอร์)

## UI/UX considerations

- แบนเนอร์อยู่ล่างจอ (fixed) เว้น `env(safe-area-inset-bottom)` ให้ iPhone; สไลด์ขึ้นตอนโผล่
- ซ่อนแบนเนอร์อัตโนมัติเมื่อ live scorer เปิด (`body.live-open`) เพราะเป็นโหมดเต็มจอ
- ปุ่มไอคอนติดตั้งอยู่ข้างปุ่ม QR บน header ใช้สไตล์เดียวกัน (`.btn-qr`) เพื่อความกลมกลืน
- PTR indicator เป็นวงกลมมีลูกศร หมุนตามระยะลาก และเปลี่ยนเป็นสปินเนอร์ตอนกำลังรีเฟรช
- a11y: แบนเนอร์เป็น `role="region"` + `aria-label`, ปุ่มทุกตัวมี `aria-label`, indicator `aria-hidden`
- ข้อความไทยทั้งหมด

## Security considerations

- ไม่มีข้อมูลผู้ใช้เพิ่ม; localStorage เก็บแค่ timestamp
- SW แคชเฉพาะ GET, เฉพาะ same-origin + CDN ที่ whitelist ไว้ — **ไม่แคช** โดเมน Firebase
  (`*.firebaseio.com`, `firebasedatabase.app`, `googleapis.com`) เพื่อไม่ให้ข้อมูลก๊วนถูกเก็บค้าง
- `manifest` ใช้ `start_url: "./"` (relative) จึงไม่ผูกกับโดเมนใดโดยเฉพาะ

## Performance considerations

- SW = network-first สำหรับ same-origin: โหลดของใหม่เสมอเมื่อออนไลน์, มีแคชเป็น fallback เท่านั้น
- CDN (Tailwind/qrcode/Firebase SDK) = cache-first + revalidate เบื้องหลัง → เปิดครั้งถัดไปเร็วขึ้นมาก
- touch handler ใช้ `passive: true` ตอน `touchstart` และ non-passive เฉพาะ `touchmove`
  ตอนที่กำลังลากจริง เพื่อไม่ให้กระทบ scroll performance

## Edge cases & error handling

| กรณี | พฤติกรรม |
| --- | --- |
| เปิดจาก `file://` | `navigator.serviceWorker` ใช้ไม่ได้ → ครอบ try/catch, แอปทำงานปกติ ไม่มีแบนเนอร์ |
| เบราว์เซอร์ไม่ยิง `beforeinstallprompt` (Firefox desktop) | ไม่มีแบนเนอร์/ไอคอน — ไม่หลอกผู้ใช้ |
| iOS แต่อยู่ใน standalone อยู่แล้ว | `navigator.standalone === true` → ไม่โชว์อะไร |
| localStorage ถูกปิด | อ่าน/เขียนครอบ try/catch, ถือว่ายังไม่เคยปิดแบนเนอร์ |
| กด "ติดตั้ง" แล้วผู้ใช้กด cancel | ถือว่าปิดแบนเนอร์ (snooze) แต่ไอคอนยังอยู่ให้กดใหม่ได้ |
| ลากลงตอนเปิด QR modal / live scorer | PTR ไม่ทำงาน |
| ลากลงในตารางที่เลื่อนแนวนอน/แนวตั้งอยู่ | ตรวจ scroll ancestor ก่อน ถ้าไม่ได้อยู่บนสุดก็ไม่เริ่ม |
| หลายนิ้ว (pinch) | ยกเลิกการลากทันที |

## Testing strategy

- Unit (`pwa.test.js`): `isStandaloneDisplay`, `isIOS`, `installAvailability`, `shouldShowBanner`
  (รวมกรณี snooze หมดอายุ/ยังไม่หมด), `shouldShowIcon`, `createPullTracker` ทุกเส้นทาง
  (ไม่ได้อยู่บนสุด, ลากขึ้น, ลากไม่ถึงเกณฑ์, ถึงเกณฑ์, ยกเลิก, clamp ที่ max)
- Manual: Chrome Android (ติดตั้งจริง), iOS Safari (ข้อความแนะนำ), เดสก์ท็อป Chrome (ไอคอนติดตั้ง)

## Dependencies

ไม่มี package ใหม่ — ไอคอนสร้างด้วย `zlib` ที่มากับ Node

## Migration & rollback plan

- Deploy = คัดลอกไฟล์ static ตามปกติ
- Rollback: ลบ `<link rel=manifest>` และการ register SW ออก แล้วเผยแพร่ `sw.js` ที่เรียก
  `self.registration.unregister()` เพื่อถอน SW ที่ค้างอยู่ในเครื่องผู้ใช้

## Open questions

- ระยะ snooze 7 วันเหมาะไหม? (ตอนนี้ตั้งเป็นค่าคงที่ `SNOOZE_MS` ใน `pwa.js` แก้ที่เดียว)

## Todo list

- [x] `pwa.js` + `pwa.test.js`
- [x] ไอคอน + `tools/make-icons.js`
- [x] `manifest.webmanifest`
- [x] `sw.js`
- [x] markup + CSS แบนเนอร์ / ปุ่ม header / PTR indicator
- [x] wiring ใน `script.js`
- [x] `npm test` ผ่าน
- [x] อัปเดต `CLAUDE.md`
