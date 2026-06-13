let pickupEl: HTMLAudioElement | null = null;
let dropEl: HTMLAudioElement | null = null;
let muted = false;

function get(src: string, current: HTMLAudioElement | null): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (current) return current;
  return new Audio(src);
}

function fire(el: HTMLAudioElement): void {
  el.currentTime = 0;
  try {
    void el.play().catch(() => {});
  } catch {
    // Older browsers throw synchronously instead of rejecting.
  }
}

export function playPickup(): void {
  if (typeof window === "undefined" || muted) return;
  pickupEl = get("/sounds/pickup.wav", pickupEl);
  if (!pickupEl) return;
  fire(pickupEl);
}

export function playDrop(): void {
  if (typeof window === "undefined" || muted) return;
  dropEl = get("/sounds/drop.wav", dropEl);
  if (!dropEl) return;
  fire(dropEl);
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMuted(): boolean {
  muted = !muted;
  return muted;
}
