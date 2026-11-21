// Pure state for EvidenceGallery (reviewer + child "what I sent" views).
// No React / react-native — Node-test safe.

export type GallerySlot =
  | { status: 'loading' }
  | { status: 'ready'; uri: string }
  | { status: 'failed' };

export type GalleryState = {
  slots:    readonly GallerySlot[];
  selected: number;
};

export function initialGallery(count: number): GalleryState {
  return { slots: Array.from({ length: Math.max(0, count) }, () => ({ status: 'loading' as const })), selected: 0 };
}

export function onSlotReady(state: GalleryState, index: number, uri: string): GalleryState {
  if (index < 0 || index >= state.slots.length) return state;
  return { ...state, slots: state.slots.map((s, i) => (i === index ? { status: 'ready', uri } : s)) };
}

export function onSlotFailed(state: GalleryState, index: number): GalleryState {
  if (index < 0 || index >= state.slots.length) return state;
  return { ...state, slots: state.slots.map((s, i) => (i === index ? { status: 'failed' } : s)) };
}

export function onRetryFailed(state: GalleryState): GalleryState {
  return { ...state, slots: state.slots.map((s) => (s.status === 'failed' ? { status: 'loading' } : s)) };
}

export function selectSlot(state: GalleryState, index: number): GalleryState {
  if (index < 0 || index >= state.slots.length || index === state.selected) return state;
  return { ...state, selected: index };
}

export function selectNext(state: GalleryState): GalleryState {
  return selectSlot(state, state.selected + 1);
}

export function selectPrevious(state: GalleryState): GalleryState {
  return selectSlot(state, state.selected - 1);
}

// Load order: the photo on screen first, then the rest in order.
export function loadOrder(state: GalleryState): number[] {
  const pending = state.slots.flatMap((s, i) => (s.status === 'loading' ? [i] : []));
  return pending.sort((a, b) => (a === state.selected ? -1 : b === state.selected ? 1 : a - b));
}

export type GalleryLoadResult = { ok: true; uri: string } | { ok: false };

// Starts EVERY pending load right away, in loadOrder (the photo on screen is
// requested first), instead of one after another: each photo costs a full
// Edge Function round trip (1-3 s measured), so 4 sequential photos took
// 7-10 s and in parallel ~3 s. At most 5 (the photo limit) run at once.
// Each result is reported against ITS OWN index as soon as it settles, in
// whatever order the network finishes; a rejected load counts as failed.
export function startGalleryLoads(
  order:    readonly number[],
  load:     (index: number) => Promise<GalleryLoadResult>,
  onResult: (index: number, result: GalleryLoadResult) => void,
): Promise<void> {
  return Promise.all(order.map((index) =>
    load(index)
      .catch((): GalleryLoadResult => ({ ok: false }))
      .then((result) => onResult(index, result)),
  )).then(() => undefined);
}

export function gallerySummary(state: GalleryState) {
  const ready  = state.slots.filter((s) => s.status === 'ready').length;
  const failed = state.slots.filter((s) => s.status === 'failed').length;
  return { total: state.slots.length, ready, failed, allReady: ready === state.slots.length };
}

// "2 / 3"
export function positionLabel(state: GalleryState): string {
  return state.slots.length === 0 ? '' : `${state.selected + 1} / ${state.slots.length}`;
}
