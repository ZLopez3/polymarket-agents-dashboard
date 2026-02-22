import sharp from 'sharp';
import path from 'path';

import { readdirSync } from 'fs';

// Find the actual project path dynamically
let avatarsDir;
const candidates = [
  '/vercel/share/v0-project/public/avatars',
  '/home/user/public/avatars',
  './public/avatars',
];
for (const c of candidates) {
  try {
    readdirSync(c);
    avatarsDir = c;
    break;
  } catch {}
}
if (!avatarsDir) {
  // list what's in common locations to debug
  try { console.log('/vercel/share:', readdirSync('/vercel/share')); } catch(e) { console.log('/vercel/share not found'); }
  try { console.log('/home/user:', readdirSync('/home/user')); } catch(e) { console.log('/home/user not found'); }
  throw new Error('Cannot find avatars directory');
}
console.log('[v0] Using avatars dir:', avatarsDir);
console.log('[v0] Files:', readdirSync(avatarsDir));

const files = [
  { src: 'bond-ladder-src.jpg', out: 'bond-ladder.png' },
  { src: 'ai-contrarian-src.jpg', out: 'ai-contrarian.png' },
  { src: 'copy-trader-src.jpg', out: 'copy-trader.png' },
  { src: 'fin-src.jpg', out: 'fin.png' },
  { src: 'audi-src.jpg', out: 'audi.png' },
];

const THRESHOLD = 240; // pixels with R, G, B all above this become transparent

for (const { src, out } of files) {
  const inputPath = path.join(avatarsDir, src);
  const outputPath = path.join(avatarsDir, out);

  const image = sharp(inputPath);
  const { width, height } = await image.metadata();
  const { data, info } = await image
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < info.width * info.height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    if (r > THRESHOLD && g > THRESHOLD && b > THRESHOLD) {
      data[idx + 3] = 0; // set alpha to 0 (transparent)
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(outputPath);

  console.log(`[v0] Created ${out} (${info.width}x${info.height})`);
}

console.log('[v0] Done - all PNGs created with transparent backgrounds');
