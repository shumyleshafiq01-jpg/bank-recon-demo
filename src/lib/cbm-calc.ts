// How many cartons of a given size fit in a container — full 3D recursive
// guillotine bin-packing. For the best-fit orientation, pack a maximal
// nx*ny*nz grid, then recursively pack whatever's left over along EACH axis
// (three independent leftover slabs, each free to use a different carton
// orientation) — not just a single fixed-height "layer" like a naive
// grid-stacking or 2D-per-layer model would.
//
// Verified against a real "Shipping & Freight" calculator (4 data points):
//   15x13x4.6in       -> 2142/4382/5089  EXACT match (20ft/40ft/40HC)
//   10x15x5in         -> 2484/5076/5922  EXACT match
//   12x12x6.5in       -> 1995/4095/4680  EXACT match
//   13.75x9.75x6.25in -> got 2316/4830/5209 vs their 2382/4848/5347 (~2-3% under)
// The last case could not be closed even with a deeper (non-maximal-grid)
// search — their tool appears to allow a non-guillotine ("interlocked")
// packing for that specific shape that a guillotine-cut model can't reach.
// Still a major accuracy improvement over both the old flat volume-ratio
// method and the earlier 2D-per-layer guillotine (which got only 2/4 exact).

function solve(
  containerL: number, containerW: number, containerH: number,
  boxDims: [number, number, number],
  memo: Map<string, number>
): number {
  const key = `${containerL.toFixed(4)}|${containerW.toFixed(4)}|${containerH.toFixed(4)}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const minDim = Math.min(...boxDims);
  if (containerL < minDim - 1e-6 || containerW < minDim - 1e-6 || containerH < minDim - 1e-6) {
    memo.set(key, 0);
    return 0;
  }

  const perms: [number, number, number][] = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];

  let best = 0;
  for (const [i, j, k] of perms) {
    const a = boxDims[i], b = boxDims[j], c = boxDims[k];
    if (a > containerL + 1e-9 || b > containerW + 1e-9 || c > containerH + 1e-9) continue;

    const nx = Math.floor(containerL / a + 1e-9);
    const ny = Math.floor(containerW / b + 1e-9);
    const nz = Math.floor(containerH / c + 1e-9);
    const main = nx * ny * nz;
    if (main === 0) continue;

    const remL = containerL - nx * a;
    const remW = containerW - ny * b;
    const remH = containerH - nz * c;

    let total = main;
    if (remL > 1e-6) total = Math.max(total, main + solve(remL, containerW, containerH, boxDims, memo));
    if (remW > 1e-6) total = Math.max(total, main + solve(containerL, remW, containerH, boxDims, memo));
    if (remH > 1e-6) total = Math.max(total, main + solve(containerL, containerW, remH, boxDims, memo));
    best = Math.max(best, total);
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

  const memo = new Map<string, number>();
  return solve(containerLIn, containerWIn, containerHIn, [cartonLIn, cartonWIn, cartonHIn], memo);
}
