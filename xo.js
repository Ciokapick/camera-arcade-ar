// X și 0 în 3D: cub de 4×4×4, câștigă primul care face o linie de 4 (pe orizontală, verticală,
// prin niveluri sau pe orice diagonală). Fără DOM — testat în tests/xo.test.mjs.
export const N = 4;
export const CELLS = N * N * N;
export const index = (x, y, z) => x + N * y + N * N * z; // x, y = poziția pe nivel, z = nivelul

// toate cele 76 de linii: din fiecare celulă, în fiecare din cele 13 direcții „înainte”
export const LINES = (() => {
  const lines = [];
  const dirs = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
    if (dx || dy || dz) dirs.push([dx, dy, dz]);
  }
  const seen = new Set();
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) {
    for (const [dx, dy, dz] of dirs) {
      const cells = [];
      for (let k = 0; k < N; k++) {
        const cx = x + dx * k, cy = y + dy * k, cz = z + dz * k;
        if (cx < 0 || cy < 0 || cz < 0 || cx >= N || cy >= N || cz >= N) break;
        cells.push(index(cx, cy, cz));
      }
      if (cells.length !== N) continue;
      const key = [...cells].sort((a, b) => a - b).join(',');
      if (!seen.has(key)) { seen.add(key); lines.push(cells); }
    }
  }
  return lines;
})();

export function winner(cells) {
  for (const line of LINES) {
    const mark = cells[line[0]];
    if (mark && line.every(i => cells[i] === mark)) return { mark, line };
  }
  return null;
}

// Calculatorul: câștigă dacă poate, blochează dacă trebuie, altfel alege celula cu cele mai bune linii deschise
export function botMove(cells, mark, rand = Math.random) {
  const other = mark === 'X' ? 'O' : 'X';
  const empty = cells.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
  const completes = who => empty.find(i => LINES.some(line => line.includes(i) && line.every(j => j === i || cells[j] === who)));
  const win = completes(mark);
  if (win !== undefined) return win;
  const block = completes(other);
  if (block !== undefined) return block;
  let best = -1, bestScore = -Infinity;
  for (const i of empty) {
    let score = rand() * 0.5;
    for (const line of LINES) {
      if (!line.includes(i)) continue;
      const mine = line.filter(j => cells[j] === mark).length, theirs = line.filter(j => cells[j] === other).length;
      if (theirs === 0) score += [1, 4, 16, 0][mine];
      if (mine === 0) score += [0.5, 3, 12, 0][theirs];
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
