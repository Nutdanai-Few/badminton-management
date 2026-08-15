// tools/make-icons.js
// Regenerates the PWA icons in icons/ — run with:  node tools/make-icons.js
//
// This project has no build step and no dependencies, so the icons are rasterised
// by hand: a shuttlecock in white on the app's accent gradient, drawn with 4x4
// supersampling for smooth edges and written out as PNG using Node's own zlib.
// Keeping the generator in the repo means the artwork stays reproducible and
// tweakable without pulling in an image library.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

// rgba: Uint8Array of size w*h*4
function encodePNG(rgba, w, h) {
    const raw = Buffer.alloc(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;                                  // filter: none
        Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4)
            .copy(raw, y * (w * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // colour type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// ---- artwork ----------------------------------------------------------------

const ACCENT_FROM = [16, 185, 129];    // #10B981
const ACCENT_TO = [5, 150, 105];       // #059669

const lerp = (a, b, t) => a + (b - a) * t;

// Background: the same 135° accent gradient the UI uses.
function bgColor(u, v) {
    const t = Math.min(1, Math.max(0, (u + v) / 2));
    return [
        lerp(ACCENT_FROM[0], ACCENT_TO[0], t),
        lerp(ACCENT_FROM[1], ACCENT_TO[1], t),
        lerp(ACCENT_FROM[2], ACCENT_TO[2], t),
    ];
}

function inRoundedSquare(u, v, radius) {
    if (radius <= 0) return true;
    const dx = Math.abs(u - 0.5) - (0.5 - radius);
    const dy = Math.abs(v - 0.5) - (0.5 - radius);
    if (dx <= 0 || dy <= 0) return true;
    return dx * dx + dy * dy <= radius * radius;
}

// Shuttlecock in art-box coordinates (0..1, y down).
const SKIRT_TOP = 0.20, SKIRT_BOT = 0.775;
const HALF_TOP = 0.335, HALF_BOT = 0.145;
const CAP_RY = 0.085;
const HEAD_CY = 0.795, HEAD_R = 0.155;

function skirtHalfWidth(v) {
    const t = (SKIRT_BOT - v) / (SKIRT_BOT - SKIRT_TOP);
    return lerp(HALF_BOT, HALF_TOP, t);
}

function inShuttle(u, v) {
    const dx = u - 0.5;
    // cork head
    if (dx * dx + (v - HEAD_CY) ** 2 <= HEAD_R * HEAD_R) return true;
    // feather skirt
    if (v >= SKIRT_TOP && v <= SKIRT_BOT) return Math.abs(dx) <= skirtHalfWidth(v);
    // rounded top of the skirt
    if (v < SKIRT_TOP) {
        return (dx / HALF_TOP) ** 2 + ((v - SKIRT_TOP) / CAP_RY) ** 2 <= 1;
    }
    return false;
}

// The gaps between feathers + the string band, carved back out to the background
// so the shuttle reads as feathers rather than a solid cone.
const APEX = { u: 0.5, v: 1.02 };
const GAP_HALF = 0.017;
const GAP_ANGLES = [-0.30, -0.10, 0.10, 0.30];   // radians off vertical

function inGap(u, v) {
    if (v > SKIRT_BOT - 0.035) return false;      // never cut into the cork
    for (const a of GAP_ANGLES) {
        // Distance from the point to the ray leaving APEX at angle `a` from straight up.
        const dirU = Math.sin(a), dirV = -Math.cos(a);
        const pu = u - APEX.u, pv = v - APEX.v;
        const proj = pu * dirU + pv * dirV;
        if (proj <= 0) continue;
        const perp = Math.abs(pu * dirV - pv * dirU);
        if (perp <= GAP_HALF) return true;
    }
    // string band: a gently curved line across the skirt
    const bandV = 0.455 + 0.035 * (1 - Math.min(1, ((u - 0.5) / HALF_TOP) ** 2));
    return Math.abs(v - bandV) <= 0.014;
}

// Render one icon.  `inset` shrinks the artwork (maskable icons must keep their
// content inside the 80% safe zone); `radius` rounds the plate (0 = full bleed).
function render(size, { inset = 0.14, radius = 0.22, samples = 4 } = {}) {
    const px = new Uint8Array(size * size * 4);
    const step = 1 / samples;
    const art = 1 - inset * 2;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let sy = 0; sy < samples; sy++) {
                for (let sx = 0; sx < samples; sx++) {
                    const u = (x + (sx + 0.5) * step) / size;
                    const v = (y + (sy + 0.5) * step) / size;
                    if (!inRoundedSquare(u, v, radius)) continue;   // transparent corner
                    let c = bgColor(u, v);
                    const au = (u - inset) / art, av = (v - inset) / art;
                    if (au >= 0 && au <= 1 && av >= 0 && av <= 1 && inShuttle(au, av) && !inGap(au, av)) {
                        c = [255, 255, 255];
                    }
                    r += c[0]; g += c[1]; b += c[2]; a += 255;
                }
            }
            const n = samples * samples;
            const i = (y * size + x) * 4;
            // Un-premultiply: colour is the average of the covered subsamples only.
            const cov = a / 255;
            px[i] = cov ? Math.round(r / cov) : 0;
            px[i + 1] = cov ? Math.round(g / cov) : 0;
            px[i + 2] = cov ? Math.round(b / cov) : 0;
            px[i + 3] = Math.round(a / n);
        }
    }
    return encodePNG(px, size, size);
}

// ---- outputs ----------------------------------------------------------------

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const TARGETS = [
    ['icon-192.png', 192, { inset: 0.16, radius: 0.22 }],
    ['icon-512.png', 512, { inset: 0.16, radius: 0.22 }],
    // Maskable: full-bleed plate, artwork well inside the 80% safe circle.
    ['icon-maskable-512.png', 512, { inset: 0.26, radius: 0 }],
    // iOS home screen: square plate (iOS applies its own mask), a little tighter.
    ['apple-touch-icon.png', 180, { inset: 0.17, radius: 0 }],
];

for (const [name, size, opts] of TARGETS) {
    const buf = render(size, opts);
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log(`wrote icons/${name}  (${size}x${size}, ${buf.length} bytes)`);
}
