// X și 0 clasic: tablă 3×3, câștigă primul care face trei în linie. Fără DOM — testat în tests/xo.test.mjs.
export const N = 3;
export const CELLS = N * N;
export const index = (x, y) => x + N * y;

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rânduri
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // coloane
  [0, 4, 8], [2, 4, 6], // diagonale
];

export function winner(cells) {
  for (const line of LINES) {
    const mark = cells[line[0]];
    if (mark && line.every(i => cells[i] === mark)) return { mark, line };
  }
  return null;
}

// Calculatorul: câștigă dacă poate, blochează dacă trebuie, altfel centrul, un colț, ce a rămas.
// Joacă bine, dar nu perfect — uneori alege la întâmplare, ca să poată fi bătut.
export function botMove(cells, mark, rand = Math.random) {
  const other = mark === 'X' ? 'O' : 'X';
  const empty = cells.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
  const completes = who => empty.find(i => LINES.some(line => line.includes(i) && line.every(j => j === i || cells[j] === who)));
  const win = completes(mark);
  if (win !== undefined) return win;
  const block = completes(other);
  if (block !== undefined) return block;
  if (rand() < 0.25) return empty[Math.floor(rand() * empty.length)];
  if (!cells[4]) return 4;
  const corners = [0, 2, 6, 8].filter(i => !cells[i]);
  if (corners.length) return corners[Math.floor(rand() * corners.length)];
  return empty[Math.floor(rand() * empty.length)];
}
