// Masa din punctele 3D pe care le vede urmărirea (ca aplicația Măsurare de pe iPhone): lumea e aliniată cu
// gravitația (+Y în sus), deci masa e un plan orizontal — înălțimea la care se adună cele mai multe puncte.
// Histogramă pe înălțimi (bin = 1 cm), vârful netezit cu vecinii, apoi media punctelor din jurul lui.
// Mâna, cana, tastatura sunt mai sus și au mai puține puncte; la egalitate câștigă cel mai de jos.
// ys: înălțimile punctelor (pot fi repetate = greutate). Întoarce { y, count, support } sau null.
export function tableHeight(ys, { bin = 0.01, min = 12 } = {}) {
  if (ys.length < min) return null;
  const counts = new Map();
  for (const y of ys) {
    const k = Math.round(y / bin);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let peak = null, best = 0;
  for (const [k, c] of counts) {
    const score = (counts.get(k - 1) ?? 0) + 2 * c + (counts.get(k + 1) ?? 0);
    if (score > best || (score === best && k < peak)) { best = score; peak = k; }
  }
  const near = ys.filter(y => Math.abs(y - peak * bin) <= bin * 1.5);
  if (near.length < min / 2) return null;
  return { y: near.reduce((a, b) => a + b, 0) / near.length, count: near.length, support: near.length / ys.length };
}
