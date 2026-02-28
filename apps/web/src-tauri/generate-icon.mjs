/**
 * 임시 플레이스홀더 아이콘 생성 스크립트 (1024x1024 PNG)
 * 실행: node apps/web/src-tauri/generate-icon.mjs
 *
 * 생성 후:
 *   cd apps/web && npx @tauri-apps/cli icon src-tauri/icons/icon.png
 * 로 모든 플랫폼 크기 아이콘 자동 생성
 */

import { createWriteStream, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;

// #e94560 = rgb(233, 69, 96)
const BG_R = 233, BG_G = 69, BG_B = 96;

// Build raw RGBA pixel data
const raw = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    // Rounded rectangle mask (corner radius = 22%)
    const cx = SIZE / 2, cy = SIZE / 2, r = SIZE * 0.22;
    const dx = Math.max(0, Math.abs(x - cx) - (SIZE / 2 - r));
    const dy = Math.max(0, Math.abs(y - cy) - (SIZE / 2 - r));
    const inside = dx * dx + dy * dy <= r * r;
    if (!inside) { raw[i] = 0; raw[i+1] = 0; raw[i+2] = 0; raw[i+3] = 0; continue; }

    // Center "T" glyph (simple pixel art)
    const nx = x - cx, ny = y - cy;
    const s = SIZE * 0.08; // stroke width
    const th = SIZE * 0.3; // half-height of T vertical bar
    const tw = SIZE * 0.32; // half-width of T top bar
    const tb = s * 0.9;    // half-height of T top bar
    const isT = (Math.abs(ny + SIZE * 0.02) < th && Math.abs(nx) < s) ||
                (ny > -(th) && ny < -(th - tb * 2) && Math.abs(nx) < tw);

    if (isT) {
      raw[i] = 255; raw[i+1] = 255; raw[i+2] = 255; raw[i+3] = 255;
    } else {
      raw[i] = BG_R; raw[i+1] = BG_G; raw[i+2] = BG_B; raw[i+3] = 255;
    }
  }
}

// Encode as PNG manually
function pngChunk(type, data) {
  const buf = Buffer.alloc(12 + data.length);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 'ascii');
  data.copy(buf, 8);
  // CRC32
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  buf.writeInt32BE(crc, 8 + data.length);
  return buf;
}

function crc32(buf) {
  let crc = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) | 0;
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type: RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// IDAT - filter each row with None filter (0)
const rows = [];
for (let y = 0; y < SIZE; y++) {
  rows.push(Buffer.from([0])); // filter type = None
  rows.push(raw.slice(y * SIZE * 4, (y + 1) * SIZE * 4));
}
const idat = deflateSync(Buffer.concat(rows));

// Write PNG
const outDir = join(__dirname, 'icons');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'icon.png');
const ws = createWriteStream(outPath);
ws.write(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); // PNG signature
ws.write(pngChunk('IHDR', ihdr));
ws.write(pngChunk('IDAT', idat));
ws.write(pngChunk('IEND', Buffer.alloc(0)));
ws.end();
ws.on('finish', () => {
  console.log(`✅ 아이콘 생성 완료: ${outPath}`);
  console.log('');
  console.log('다음 명령으로 모든 플랫폼 크기 생성:');
  console.log('  cd apps/web && npx @tauri-apps/cli icon src-tauri/icons/icon.png');
});
