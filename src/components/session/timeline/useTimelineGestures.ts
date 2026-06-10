/**
 * useTimelineGestures — pan, pinch-to-zoom (center-preserving), tap
 * detection, and inertial scrolling for the timeline canvas, plus
 * container width measurement and zoom buttons.
 *
 * Extracted verbatim from TimelineTab; behavior unchanged.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SCROLL_FRICTION, MIN_SCROLL_VELOCITY } from './timeline-shared';

export interface TimelineGestures {
  zoom: number;
  scrollX: number;
  setScrollX: React.Dispatch<React.SetStateAction<number>>;
  containerWidth: number;
  totalWidth: number;
  containerRef: React.RefObject<HTMLDivElement>;
  setZoomLevel: (newZoom: number) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  cancelMomentum: () => void;
}

export function useTimelineGestures(
  /** Called with clientX when a touch qualifies as a tap (tap-to-seek). */
  onTap: (clientX: number) => void,
): TimelineGestures {
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [containerWidth, setContainerWidth] = useState(350);

  // Touch/scroll refs
  const touchStartRef = useRef<number | null>(null);
  const scrollStartRef = useRef(0);
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pinchCenterRef = useRef(0);
  const pinchScrollStartRef = useRef(0);
  const velocityRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTouchTimeRef = useRef(0);
  const momentumFrameRef = useRef(0);
  const isTapRef = useRef(true);
  const tapStartTimeRef = useRef(0);

  const totalWidth = containerWidth * zoom;

  // ─── Measure container ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cancelMomentum = useCallback(() => {
    if (momentumFrameRef.current) {
      cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = 0;
    }
  }, []);

  // Cancel momentum on unmount
  useEffect(() => cancelMomentum, [cancelMomentum]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Cancel any ongoing momentum scroll
    cancelMomentum();
    velocityRef.current = 0;

    if (e.touches.length === 1) {
      touchStartRef.current = e.touches[0].clientX;
      scrollStartRef.current = scrollX;
      lastTouchXRef.current = e.touches[0].clientX;
      lastTouchTimeRef.current = Date.now();
      isTapRef.current = true;
      tapStartTimeRef.current = Date.now();
    } else if (e.touches.length === 2) {
      isTapRef.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoomRef.current = zoom;
      pinchScrollStartRef.current = scrollX;
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchCenterRef.current = rect ? cx - rect.left + scrollX : 0;
      touchStartRef.current = null;
    }
  }, [scrollX, zoom, cancelMomentum]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom with center preservation
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchStartDistRef.current > 0) {
        const scale = dist / pinchStartDistRef.current;
        const newZoom = Math.max(1, Math.min(32, pinchStartZoomRef.current * scale));
        const newTotalWidth = containerWidth * newZoom;

        // Center-preserving scroll: the point under the pinch center stays fixed
        const ratio = newZoom / pinchStartZoomRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const containerX = rect ? cx - rect.left : containerWidth / 2;
        const newScrollX = pinchCenterRef.current * ratio - containerX;
        const maxScroll = Math.max(0, newTotalWidth - containerWidth);

        setZoom(newZoom);
        setScrollX(Math.max(0, Math.min(maxScroll, newScrollX)));
      }
      e.preventDefault();
      return;
    }

    // Single-finger pan
    if (touchStartRef.current === null || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const dxPan = currentX - touchStartRef.current;

    // If moved more than 5px, it's not a tap
    if (Math.abs(dxPan) > 5) {
      isTapRef.current = false;
    }

    // Track velocity for inertia
    const now = Date.now();
    const dt = now - lastTouchTimeRef.current;
    if (dt > 0) {
      velocityRef.current = (lastTouchXRef.current - currentX) / dt * 16; // px per frame
    }
    lastTouchXRef.current = currentX;
    lastTouchTimeRef.current = now;

    const maxScroll = Math.max(0, totalWidth - containerWidth);
    setScrollX(Math.max(0, Math.min(maxScroll, scrollStartRef.current - dxPan)));
    e.preventDefault();
  }, [containerWidth, totalWidth]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Check for tap-to-seek (short duration, no significant movement)
    if (isTapRef.current && Date.now() - tapStartTimeRef.current < 300) {
      // Get the last touch position from changedTouches
      if (e.changedTouches.length > 0) {
        onTap(e.changedTouches[0].clientX);
      }
    } else if (Math.abs(velocityRef.current) > MIN_SCROLL_VELOCITY) {
      // Start inertial scrolling
      const doMomentum = () => {
        velocityRef.current *= SCROLL_FRICTION;
        if (Math.abs(velocityRef.current) < MIN_SCROLL_VELOCITY) {
          momentumFrameRef.current = 0;
          return;
        }
        const maxScroll = Math.max(0, containerWidth * zoom - containerWidth);
        setScrollX((prev) => Math.max(0, Math.min(maxScroll, prev + velocityRef.current)));
        momentumFrameRef.current = requestAnimationFrame(doMomentum);
      };
      momentumFrameRef.current = requestAnimationFrame(doMomentum);
    }

    touchStartRef.current = null;
    pinchStartDistRef.current = 0;
  }, [onTap, containerWidth, zoom]);

  // ─── Zoom buttons (center-preserving) ───
  const setZoomLevel = useCallback((newZoom: number) => {
    const cw = containerWidth;
    const oldTotalWidth = cw * zoom;
    const newTotalWidth = cw * newZoom;

    // Keep center of viewport fixed
    const viewCenter = scrollX + cw / 2;
    const fraction = viewCenter / oldTotalWidth;
    const newScrollX = fraction * newTotalWidth - cw / 2;
    const maxScroll = Math.max(0, newTotalWidth - cw);

    setZoom(newZoom);
    setScrollX(Math.max(0, Math.min(maxScroll, newScrollX)));
  }, [containerWidth, zoom, scrollX]);

  return {
    zoom,
    scrollX,
    setScrollX,
    containerWidth,
    totalWidth,
    containerRef,
    setZoomLevel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    cancelMomentum,
  };
}
