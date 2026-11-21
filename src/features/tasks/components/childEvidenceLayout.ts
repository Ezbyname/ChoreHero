// Slice 5C: sizing for the child Submit Evidence photo grid (Board 20).
// Pure and Node-test safe (no react-native).
//
// Three tiles per row, sized from the window width so 5 thumbnails plus the
// add tiles never overflow, at 360dp or wider. Every tile stays at least
// MIN_TILE, so the 48dp remove hit area always fits inside it.

export const EVIDENCE_GRID_COLUMNS = 3;
export const MIN_EVIDENCE_TILE = 72;

export type EvidenceGridLayout = { tile: number; gap: number };

export function evidenceGridLayout(windowWidth: number, horizontalPadding: number, gap: number): EvidenceGridLayout {
  const safeWidth = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 0;
  const content = Math.max(0, safeWidth - horizontalPadding * 2);
  const tile = Math.floor((content - gap * (EVIDENCE_GRID_COLUMNS - 1)) / EVIDENCE_GRID_COLUMNS);
  return { tile: Math.max(MIN_EVIDENCE_TILE, tile), gap };
}
