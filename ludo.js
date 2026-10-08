// Regulile „Nu te supăra, frate” — fără DOM, testate în tests/ludo.test.mjs.
//
// Fiecare culoare are 4 pioni. Progresul unui pion:
//   -1        = în casă (curtea de start)
//   0..39     = pe traseu (0 = căsuța de start a culorii)
//   40..43    = pe culoarul propriu spre final
// Reguli: ieși din casă doar cu 6; cu 6 mai arunci o dată; dacă nu ai niciun pion pe traseu ai 3 încercări
// să dai 6; nu poți sări peste capăt (43) și nu poți ateriza pe propriul pion; dacă aterizezi pe un pion
// advers, acela se întoarce în casă. Câștigă primul care își duce toți pionii pe culoarul final.

export const COLORS = ['rosu', 'albastru', 'verde', 'galben'];
export const COLOR_HEX = { rosu: '#d62828', albastru: '#1d4ed8', verde: '#16a34a', galben: '#eab308' };
export const COLOR_NAMES = { rosu: 'Roșu', albastru: 'Albastru', verde: 'Verde', galben: 'Galben' };
export const TRACK = 40;
export const GOAL = TRACK + 3; // ultima poziție de pe culoarul final
export const YARD = -1;
export const START = { rosu: 0, albastru: 10, verde: 20, galben: 30 };

export const square = (color, progress) => (START[color] + progress) % TRACK;

export function newLudo(players) {
  // ordinea la masă e ordinea culorilor (în sensul acelor de ceasornic)
  const order = COLORS.filter(color => players.some(p => p.color === color));
  return {
    order,
    owner: Object.fromEntries(players.map(p => [p.color, p.id])),
    pawns: Object.fromEntries(order.map(color => [color, [YARD, YARD, YARD, YARD]])),
    turn: 0,
    phase: 'roll', // roll → move → roll … → over
    die: null,
    tries: 3,
    winner: null,
    last: null, // ultimul eveniment, pentru animații și mesaje
  };
}

export const current = s => s.order[s.turn];

export function legalMoves(s, color, die) {
  const mine = s.pawns[color];
  const moves = [];
  mine.forEach((from, pawn) => {
    let to;
    if (from === YARD) {
      if (die !== 6) return;
      to = 0;
    } else {
      to = from + die;
      if (to > GOAL) return;
    }
    if (mine.some((other, j) => j !== pawn && other === to)) return;
    moves.push({ pawn, from, to });
  });
  return moves;
}

function nextTurn(s) {
  s.turn = (s.turn + 1) % s.order.length;
  s.phase = 'roll';
  s.die = null;
  s.tries = 3;
}

// Întoarce false dacă acțiunea nu e permisă (nu e rândul tău, faza greșită etc.)
export function roll(s, color, die) {
  if (s.phase !== 'roll' || current(s) !== color || !(die >= 1 && die <= 6)) return false;
  s.die = die;
  s.last = { type: 'roll', color, die };
  if (legalMoves(s, color, die).length) {
    s.phase = 'move';
  } else if (die === 6) {
    s.phase = 'roll'; // 6 fără mutare posibilă: tot mai arunci
  } else if (s.pawns[color].every(p => p === YARD || p >= TRACK) && s.tries > 1) {
    s.tries -= 1; // fără pioni pe traseu: mai ai încercări să scoți 6
  } else {
    nextTurn(s);
  }
  return true;
}

export function move(s, color, pawn) {
  if (s.phase !== 'move' || current(s) !== color) return false;
  const chosen = legalMoves(s, color, s.die).find(m => m.pawn === pawn);
  if (!chosen) return false;
  s.pawns[color][pawn] = chosen.to;
  const captured = [];
  if (chosen.to < TRACK) {
    const target = square(color, chosen.to);
    for (const other of s.order) {
      if (other === color) continue;
      s.pawns[other].forEach((p, i) => {
        if (p !== YARD && p < TRACK && square(other, p) === target) {
          s.pawns[other][i] = YARD;
          captured.push({ color: other, pawn: i });
        }
      });
    }
  }
  s.last = { type: 'move', color, pawn, from: chosen.from, to: chosen.to, captured };
  if (s.pawns[color].every(p => p >= TRACK)) {
    s.winner = color;
    s.phase = 'over';
  } else if (s.die === 6) {
    s.phase = 'roll';
    s.die = null;
    s.tries = 3;
  } else {
    nextTurn(s);
  }
  return true;
}

// Scoate o culoare din joc (jucătorul a ieșit)
export function removeColor(s, color) {
  const index = s.order.indexOf(color);
  if (index < 0) return;
  const wasCurrent = index === s.turn;
  s.order.splice(index, 1);
  delete s.pawns[color];
  delete s.owner[color];
  if (s.phase === 'over') return;
  if (s.order.length < 2) {
    s.winner = s.order[0] ?? null;
    s.phase = 'over';
    return;
  }
  if (index < s.turn) s.turn -= 1;
  if (wasCurrent) {
    s.turn = s.turn % s.order.length;
    s.phase = 'roll';
    s.die = null;
    s.tries = 3;
  }
}

// Mutarea aleasă de calculator: captură > ieșire din casă > intrare pe culoarul final > cel mai avansat pion
export function botMove(s, color) {
  const moves = legalMoves(s, color, s.die);
  const score = m => {
    if (m.to < TRACK) {
      const target = square(color, m.to);
      if (s.order.some(o => o !== color && s.pawns[o].some(p => p !== YARD && p < TRACK && square(o, p) === target))) return 1000;
    }
    if (m.from === YARD) return 500;
    if (m.to >= TRACK && m.from < TRACK) return 300;
    return m.from;
  };
  return moves.sort((a, b) => score(b) - score(a))[0]?.pawn ?? null;
}
