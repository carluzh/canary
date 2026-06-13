"use client";

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { isMuted, playDrop, playPickup, toggleMuted } from "@/lib/sounds";

export function Draggable({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
      setDragging(true);
      playPickup();
    },
    [offset.x, offset.y],
  );

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start) return;
    setOffset({
      x: start.offsetX + (e.clientX - start.x),
      y: start.offsetY + (e.clientY - start.y),
    });
  }, []);

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may already be released
    }
    startRef.current = null;
    setDragging(false);
    playDrop();
  }, []);

  return (
    <div
      className={["canary-drag", className].filter(Boolean).join(" ")}
      style={{
        ...style,
        position: "absolute",
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {children}
    </div>
  );
}

export function MuteToggle() {
  const [muted, setMutedState] = useState(false);

  const handleClick = useCallback(() => {
    setMutedState(toggleMuted());
  }, []);

  // Keep local state aligned with module state on first paint.
  const current = typeof window !== "undefined" ? isMuted() : muted;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={current ? "Unmute sounds" : "Mute sounds"}
      aria-pressed={current}
      title={current ? "Unmute sounds" : "Mute sounds"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2rem",
        height: "2rem",
        padding: 0,
        border: "1px solid currentColor",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        lineHeight: 1,
        fontSize: "1rem",
      }}
    >
      <span aria-hidden="true">{current ? "\u{1F507}" : "\u{1F50A}"}</span>
    </button>
  );
}
