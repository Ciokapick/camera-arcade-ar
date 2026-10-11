// cannon-es pentru testele de fizică: îl luăm o dată din CDN și îl ținem în tests/.cache
import fs from 'node:fs';
const CDN = 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';
const file = new URL('./.cache/cannon-es.js', import.meta.url);
if (!fs.existsSync(file)) {
  fs.mkdirSync(new URL('./.cache/', import.meta.url), { recursive: true });
  fs.writeFileSync(file, await (await fetch(CDN)).text());
}
export const CANNON = await import(file.href);
