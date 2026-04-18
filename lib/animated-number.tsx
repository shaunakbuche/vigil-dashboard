"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue } from "framer-motion";

/**
 * Smoothly tweens a displayed number between updates by writing directly to
 * the DOM via a ref — no React re-renders while the animation runs, so this
 * stays cheap even at 60fps across a dozen cards.
 *
 * When `value` changes, the tween re-targets mid-flight (via Framer's
 * `animate(motionValue, target)`), so a stream of updates at 1 Hz reads like
 * a continuously moving digit — the number is always in motion, never static.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 0.9,
  className,
  style,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv  = useMotionValue(value);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate: (latest) => {
        if (ref.current) ref.current.textContent = latest.toFixed(decimals);
      },
    });
    return () => controls.stop();
  }, [value, decimals, duration, mv]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ fontVariantNumeric: "tabular-nums", ...style }}
    >
      {value.toFixed(decimals)}
    </span>
  );
}
