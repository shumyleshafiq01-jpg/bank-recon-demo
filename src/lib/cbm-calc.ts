// How many cartons of a given size fit in a container, using the VOLUME
// method — the same approach as cbmcalculator.com (the freight-industry
// standard): divide the container's usable volume by the carton volume.
//
// Verified: a 13.75 x 9.75 x 6.25 in carton (0.013730 m3) gives
// 2382 / 4848 / 5347 for 20ft / 40ft / 40HC, matching cbmcalculator.com.
//
// (An earlier version used physical grid-stacking, which under-counts vs
// the freight standard — e.g. gave 2160 instead of 2382 for that box.)
export function maxCartonsFit(
  cartonLIn: number, cartonWIn: number, cartonHIn: number,
  containerCbm: number
): number {
  if (!cartonLIn || !cartonWIn || !cartonHIn || !containerCbm) return 0;
  const IN3_TO_M3 = 0.0254 * 0.0254 * 0.0254;
  const boxCbm = cartonLIn * cartonWIn * cartonHIn * IN3_TO_M3;
  if (boxCbm <= 0) return 0;
  return Math.floor(containerCbm / boxCbm);
}
