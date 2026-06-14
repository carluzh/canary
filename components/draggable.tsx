"use client";

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { playDrop, playPickup } from "@/lib/sounds";

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
