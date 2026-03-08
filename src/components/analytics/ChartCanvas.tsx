/**
 * ChartCanvas — shared canvas wrapper with touch interaction.
 *
 * Provides: canvas ref, pinch-zoom, pan, tap for tooltip.
 * All charts are Canvas-rendered per the plan (no SVG).
 */

import { useRef, useEffect, useCallback, useState } from 'react';

interface Props {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number, panX: number) => void;
  className?: string;
}

export function ChartCanvas({ width, height, draw, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const lastTouchRef = useRef<{ x: number; dist: number } | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    draw(ctx, width, height, zoom, panX);
  }, [width, height, draw, zoom, panX]);

  useEffect(() => {
    render();
  }, [render]);

  // Touch handlers for pan and pinch-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, dist: 0 };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        dist: Math.sqrt(dx * dx + dy * dy),
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!lastTouchRef.current) return;

    if (e.touches.length === 1 && zoom > 1) {
      // Pan
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      setPanX((p) => {
        const maxPan = width * (zoom - 1);
        return Math.max(-maxPan, Math.min(0, p + dx));
      });
      lastTouchRef.current.x = e.touches[0].clientX;
      e.preventDefault();
    } else if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const prevDist = lastTouchRef.current.dist;

      if (prevDist > 0) {
        const scale = dist / prevDist;
        setZoom((z) => Math.max(1, Math.min(8, z * scale)));
      }

      lastTouchRef.current.dist = dist;
      lastTouchRef.current.x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      e.preventDefault();
    }
  }, [zoom, width]);

  const handleTouchEnd = useCallback(() => {
    lastTouchRef.current = null;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={`touch-manipulation ${className ?? ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  );
}
