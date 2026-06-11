/**
 * Pure canvas renderers for the timeline — main spectrogram view and
 * mini-map. Extracted verbatim from TimelineTab; given identical inputs
 * they paint identical pixels. No React, no state: just (canvas, params).
 */

import type { SessionRecord } from '../../../store/db';
import { bandColor } from '../Spectrogram';
import type { SpectrogramData } from '../Spectrogram';
import { CANVAS_HEIGHT, MINIMAP_HEIGHT, meterNumerator } from './timeline-shared';

/**
 * Minimal onset shape the renderer needs — structurally satisfied by both
 * live ScoredOnset objects and the serialized IDB hit-event records.
 */
export interface TimelineOnset {
  time: number;
  delta: number;
  scored: boolean;
  matchedBeatTime: number;
}

export interface TimelineRenderParams {
  canvas: HTMLCanvasElement;
  spectrogramData: SpectrogramData;
  session: SessionRecord;
  totalWidth: number;
  zoom: number;
  latencyOffsetMs: number;
  showBass: boolean;
  showMid: boolean;
  showHigh: boolean;
  onsets: readonly TimelineOnset[] | undefined | null;
  rawPcm: Float32Array | null;
}

export function renderTimeline({
  canvas,
  spectrogramData,
  session,
  totalWidth,
  zoom,
  latencyOffsetMs,
  showBass,
  showMid,
  showHigh,
  onsets,
  rawPcm,
}: TimelineRenderParams): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = totalWidth * dpr;
  canvas.height = CANVAS_HEIGHT * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, totalWidth, CANVAS_HEIGHT);

  const durationS = session.durationMs / 1000;
  if (durationS <= 0) return;

  const spec = spectrogramData;
  const wHalf = CANVAS_HEIGHT * 0.45;
  const wMid = CANVAS_HEIGHT * 0.5;

  // ─── Beat grid lines ───
  const bpm = session.bpm;
  const sub = session.subdivision || 1;
  const meterNum = meterNumerator(session);
  const beatsPerMeasure = meterNum * sub;
  const ioi = 60 / bpm / sub;
  const latencyOffsetS = latencyOffsetMs / 1000;

  {
    let t = 0;
    let beatIdx = 0;
    while (t < durationS) {
      const adjustedT = t + latencyOffsetS;
      const x = (adjustedT / durationS) * totalWidth;
      const isDownbeat = beatIdx % beatsPerMeasure === 0;
      const isMainBeat = beatIdx % sub === 0;

      // Scoring window zone
      const scoringWindowS = ioi * 0.05;
      const scoringWindowPx = (scoringWindowS / durationS) * totalWidth;
      if (isMainBeat && scoringWindowPx > 1) {
        ctx.fillStyle = 'rgba(74,222,128,0.06)';
        ctx.fillRect(x - scoringWindowPx, 0, scoringWindowPx * 2, CANVAS_HEIGHT);
      }

      // Grid line — much brighter now
      ctx.strokeStyle = isDownbeat
        ? 'rgba(255,255,255,0.5)'
        : isMainBeat
          ? 'rgba(255,255,255,0.25)'
          : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = isDownbeat ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();

      // Measure:beat labels at zoom ≥ 4×
      if (zoom >= 4 && isMainBeat) {
        const measureNum = Math.floor(beatIdx / beatsPerMeasure) + 1;
        const beatInMeasure = Math.floor((beatIdx % beatsPerMeasure) / sub) + 1;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${measureNum}:${beatInMeasure}`, x, 12);
      }

      t += ioi;
      beatIdx++;
    }
  }

  // ─── Spectrogram waveform (frequency-colored) ───
  const windowsPerPixel = spec.windowCount / totalWidth;

  for (let px = 0; px < totalWidth; px++) {
    const wIdx = Math.min(spec.windowCount - 1, Math.floor(px * windowsPerPixel));

    const bassE = spec.bass[wIdx];
    const midE = spec.mid[wIdx];
    const highE = spec.high[wIdx];

    // Stack bands bottom-to-top: bass at bottom, high at top
    const totalE = bassE + midE + highE;
    if (totalE < 0.001) continue;

    const barH = totalE * wHalf;

    // Bass (bottom portion)
    if (bassE > 0.001) {
      const h = (bassE / totalE) * barH;
      const alpha = showBass ? 0.7 : 0.07;
      ctx.fillStyle = bandColor('bass', alpha);
      ctx.fillRect(px, wMid + barH - h, 1, h); // bottom
      ctx.fillRect(px, wMid - barH, 1, h); // top (mirrored)
    }

    // Mid (middle portion)
    if (midE > 0.001) {
      const bassH = (bassE / totalE) * barH;
      const h = (midE / totalE) * barH;
      const alpha = showMid ? 0.7 : 0.07;
      ctx.fillStyle = bandColor('mid', alpha);
      ctx.fillRect(px, wMid + barH - bassH - h, 1, h);
      ctx.fillRect(px, wMid - barH + bassH, 1, h);
    }

    // High (top portion)
    if (highE > 0.001) {
      const bassH = (bassE / totalE) * barH;
      const midH = (midE / totalE) * barH;
      const h = (highE / totalE) * barH;
      const alpha = showHigh ? 0.7 : 0.07;
      ctx.fillStyle = bandColor('high', alpha);
      ctx.fillRect(px, wMid + barH - bassH - midH - h, 1, h);
      ctx.fillRect(px, wMid - barH + bassH + midH, 1, h);
    }
  }

  // ─── Onset markers ───
  if (onsets) {
    for (const onset of onsets) {
      const x = (onset.time / durationS) * totalWidth;

      // Color by accuracy
      let color: string;
      if (onset.scored) {
        const absDev = Math.abs(onset.delta);
        color = absDev < 10
          ? 'rgba(74,222,128,0.8)'
          : absDev < 25
            ? 'rgba(251,191,36,0.7)'
            : 'rgba(248,113,113,0.7)';
      } else {
        color = 'rgba(255,255,255,0.15)';
      }

      // Full-height vertical line
      ctx.strokeStyle = color;
      ctx.lineWidth = zoom >= 8 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();

      // Small circle at top
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, 8, zoom >= 4 ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();

      // Dashed connector to matched beat at zoom ≥ 2×
      if (onset.scored && zoom >= 2) {
        const gridX = ((onset.matchedBeatTime + latencyOffsetS) / durationS) * totalWidth;
        ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.3)');
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(gridX, 18);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Deviation label at zoom ≥ 4×
      if (zoom >= 4 && onset.scored) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = zoom >= 8 ? '10px "JetBrains Mono", monospace' : '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const label = `${onset.delta > 0 ? '+' : ''}${onset.delta.toFixed(1)}`;
        ctx.fillText(label, x, CANVAS_HEIGHT - 4);
      }

      // At zoom ≥ 8×: Draw hit waveform shape (40ms window)
      if (zoom >= 8 && rawPcm) {
        const sr = spectrogramData.sampleRate;
        const centerSample = Math.floor(onset.time * sr);
        const windowSamples = Math.floor(0.04 * sr); // 40ms
        const startSample = Math.max(0, centerSample - windowSamples / 2);
        const endSample = Math.min(rawPcm.length, centerSample + windowSamples / 2);

        const windowDurationS = (endSample - startSample) / sr;
        const windowStartX = ((onset.time - windowDurationS / 2) / durationS) * totalWidth;
        const windowEndX = ((onset.time + windowDurationS / 2) / durationS) * totalWidth;
        const windowWidthPx = windowEndX - windowStartX;

        if (windowWidthPx > 4) {
          ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.4)');
          ctx.lineWidth = 1;
          ctx.beginPath();

          for (let s = startSample; s < endSample; s++) {
            const frac = (s - startSample) / (endSample - startSample);
            const px = windowStartX + frac * windowWidthPx;
            const amp = rawPcm[s] * wHalf * 0.8;
            if (s === startSample) {
              ctx.moveTo(px, wMid - amp);
            } else {
              ctx.lineTo(px, wMid - amp);
            }
          }
          ctx.stroke();
        }
      }
    }
  }
}

export interface MiniMapRenderParams {
  canvas: HTMLCanvasElement;
  spectrogramData: SpectrogramData;
  containerWidth: number;
  zoom: number;
  scrollX: number;
  totalWidth: number;
  playbackPos: number;
}

export function renderMiniMap({
  canvas,
  spectrogramData,
  containerWidth,
  zoom,
  scrollX,
  totalWidth,
  playbackPos,
}: MiniMapRenderParams): void {
  const dpr = window.devicePixelRatio || 1;
  const width = containerWidth;
  canvas.width = width * dpr;
  canvas.height = MINIMAP_HEIGHT * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, MINIMAP_HEIGHT);

  const env = spectrogramData.miniMapEnvelope;
  const barW = width / env.length;
  const midY = MINIMAP_HEIGHT / 2;
  const halfH = MINIMAP_HEIGHT * 0.45;

  // Draw waveform envelope
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < env.length; i++) {
    const h = env[i] * halfH;
    ctx.fillRect(i * barW, midY - h, Math.max(1, barW), h * 2);
  }

  // Viewport indicator
  if (zoom > 1) {
    const viewStart = scrollX / totalWidth;
    const viewEnd = (scrollX + containerWidth) / totalWidth;
    const x1 = viewStart * width;
    const x2 = viewEnd * width;

    // Dim outside viewport
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, x1, MINIMAP_HEIGHT);
    ctx.fillRect(x2, 0, width - x2, MINIMAP_HEIGHT);

    // Bright border on viewport
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, 0, x2 - x1, MINIMAP_HEIGHT);
  }

  // Playhead on minimap
  const playX = playbackPos * width;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(playX, 0);
  ctx.lineTo(playX, MINIMAP_HEIGHT);
  ctx.stroke();
}
