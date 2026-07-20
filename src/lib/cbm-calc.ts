// How many cartons of a given size fit in a container — using a recursive
// guillotine 2D bin-packing model (per height-layer, fill leftover rows/
// columns with a rotated orientation of the same box), tried across all 6
// axis-orientations of the carton. This is much closer to how real freight
// "container fit" calculators work than either naive grid-stacking or a
// flat volume-ratio division.
//
// Verified against a real "Shipping & Freight" calculator (4 data points):
//   15x13x4.6in   -> 2142/4382/5089  EXACT match (20ft/40ft/40HC)
//   10x15x5in     -> 2484/5076/5922  EXACT match
//   13.75x9.75x6.25in -> got 2310/4830/5152 vs their 2382/4848/5347 (~3-7% under)
//   12x12x6.5in   -> got 1862 vs their 1995 (~7% under)
// The two imperfect cases could not be closed even with a full recursive
// guillotine search, suggesting their tool allows non-guillotine ("locked")
// packings we can't cheaply replicate. This is still dramatically closer
// than the old volume-ratio method (which was off by the same amount in
// every case, not just some).

function layerFit2D(
  containerL: number, containerW: number,
  boxA: number, boxB: number,
  memo: Map<string, number>
): number {
  const key = `${containerL.toFixed(4)}|${containerW.toFixed(4)}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const minDim = Math.min(boxA, boxB);
  if (containerL < minDim - 1e-6 || containerW < minDim - 1e-6) {
    memo.set(key, 0);
    return 0;
  }

  let best = 0;
  const orientations: [number, number][] = [[boxA, boxB], [boxB, boxA]];
  for (const [bw, bh] of orientations) {
    if (bw > containerL + 1e-9 || bh > containerW + 1e-9) continue;
    const nx = Math.floor(containerL / bw);
    const ny = Math.floor(containerW / bh);
    const main = nx * ny;
    const remL = containerL - nx * bw;
    const remW = containerW - ny * bh;
    const optA = remL > 1e-6 ? main + layerFit2D(remL, containerW, boxA, boxB, memo) : main;
    const optB = remW > 1e-6 ? main + layerFit2D(containerL, remW, boxA, boxB, memo) : main;
    best = Math.max(best, optA, optB);
  }
  memo.set(key, best);
  return best;
}

/**
 * @param cartonLIn/WIn/HIn carton dimensions in inches
 * @param containerLIn/WIn/HIn container internal dimensions in inches
 */
export function maxCartonsFit(
  cartonLIn: number, cartonWIn: number, cartonHIn: number,
  containerLIn: number, containerWIn: number, containerHIn: number
): number {
  if (!cartonLIn || !cartonWIn || !cartonHIn) return 0;
  if (!containerLIn || !containerWIn || !containerHIn) return 0;

  const dims = [cartonLIn, cartonWIn, cartonHIn];
  const perms: [number, number, number][] = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];

  let best = 0;
  for (const [i, j, k] of perms) {
    const a = dims[i], b = dims[j], c = dims[k];
    const layers = Math.floor(containerHIn / c);
    if (layers <= 0) continue;
    const memo = new Map<string, number>();
    const perLayer = layerFit2D(containerLIn, containerWIn, a, b, memo);
    best = Math.max(best, layers * perLayer);
  }
  return best;
}
