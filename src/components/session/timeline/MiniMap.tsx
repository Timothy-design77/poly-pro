/**
 * MiniMap — full-recording overview strip with viewport indicator,
 * playhead, and tap-to-jump.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { SpectrogramData } from '../Spectrogram';
import { MINIMAP_HEIGHT } from './timeline-shared';
import { renderMiniMap } from './renderers';

interface Props {
  spectrogramData: SpectrogramData | null;
  containerWidth: number;
  zoom: number;
  scrollX: number;
  totalWidth: number;
  playbackPos: number;
  /** Tap-to-jump: receives a 0–1 fraction of the recording. */
  onSeekFraction: (fraction: number) => void;
}

export function MiniMap({
  spectrogramData,
  containerWidth,
  zoom,
  scrollX,
  totalWidth,
  playbackPos,
  onSeekFraction,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrogramData) return;
    renderMiniMap({
      canvas,
      spectrogramData,
      containerWidth,
      zoom,
      scrollX,
      totalWidth,
      playbackPos,
    });
  }, [spectrogramData, containerWidth, zoom, scrollX, totalWidth, playbackPos]);

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e
      ? e.touches[0]?.clientX ?? (e as React.TouchEvent).changedTouches[0]?.clientX ?? 0
      : (e as React.MouseEvent).clientX;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeekFraction(fraction);
  }, [onSeekFraction]);

  return (
    <div
      className="rounded-md overflow-hidden border border-border-subtle cursor-pointer"
      onClick={handleTap}
      onTouchStart={handleTap}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: MINIMAP_HEIGHT, display: 'block' }}
      />
    </div>
  );
}
