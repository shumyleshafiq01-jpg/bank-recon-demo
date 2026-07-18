// Maximum cartons that fit in a container, given carton L/W/H (inches) and
// container internal L/W/H (feet). Tries all 6 axis-aligned orientations of
// the carton and returns the best simple grid-fit count.
//
// Verified against Kafi's real carton-size-list data (Vermicelli 150g:
// 18x11x9.5in -> 960/1960/2365 for 20ft/40ft/40HC, exact match).
export function maxCartonsFit(
  cartonLIn: number, cartonWIn: number, cartonHIn: number,
  containerLFt: number, containerWFt: number, containerHFt: number
): number {
  if (!cartonLIn || !cartonWIn || !cartonHIn) return 0;
  if (!containerLFt || !containerWFt || !containerHFt) return 0;

  const dims = [cartonLIn / 12, cartonWIn / 12, cartonHIn / 12];
  const container = [containerLFt, containerWFt, containerHFt];
  const perms = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];

  let best = 0;
  for (const [i, j, k] of perms) {
    const count =
      Math.floor(container[0] / dims[i]) *
      Math.floor(container[1] / dims[j]) *
      Math.floor(container[2] / dims[k]);
    if (count > best) best = count;
  }
  return best;
}
