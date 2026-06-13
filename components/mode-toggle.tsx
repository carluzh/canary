"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useMode } from "@/lib/web3/mode";

// A real sliding switch: the thumb (the colored pill behind the labels) tracks
// a click or a drag and animates between Simple and Expert instead of snapping.
export function ModeToggle() {
  const { mode, setMode } = useMode();
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ moved: boolean } | null>(null);
  const [dragFrac, setDragFrac] = useState<number | null>(null);

  // 0 = Simple (left), 1 = Expert (right). While dragging, follow the pointer.
  const frac = dragFrac ?? (mode === "simple" ? 0 : 1);
  const activeSimple = frac < 0.5;

  const fracFromX = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return mode === "simple" ? 0 : 1;
      const r = el.getBoundingClientRect();
      const thumbW = (r.width - 6) / 2; // 3px padding each side, two slots
      const x = clientX - r.left - 3 - thumbW / 2;
      return Math.max(0, Math.min(1, x / thumbW));
    },
    [mode]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { moved: false };
      setDragFrac(fracFromX(e.clientX));
    },
    [fracFromX]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current.moved = true;
      setDragFrac(fracFromX(e.clientX));
    },
    [fracFromX]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
      // Snap to the nearer side (drag) or the clicked side (tap).
      const f = fracFromX(e.clientX);
      dragRef.current = null;
      setDragFrac(null);
      setMode(f >= 0.5 ? "expert" : "simple");
    },
    [fracFromX, setMode]
  );

  return (
    <div
      ref={ref}
      className="canary-seg"
      role="tablist"
      aria-label="View mode"
      data-dragging={dragFrac != null ? "true" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span
        className="canary-seg-thumb"
        aria-hidden
        style={{ transform: `translateX(calc(${frac} * 100%))` }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={activeSimple}
        data-active={activeSimple}
        className="canary-seg-item"
        onClick={() => setMode("simple")}
      >
        Simple
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!activeSimple}
        data-active={!activeSimple}
        className="canary-seg-item"
        onClick={() => setMode("expert")}
      >
        Expert
      </button>
    </div>
  );
}
