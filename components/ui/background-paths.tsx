"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

interface PathDef { d: string; opacity: number; duration: number; delay: number; }

function buildPaths(position: 1 | -1): PathDef[] {
  return Array.from({ length: 18 }, (_, i) => {
    const seed = i * 137.508;
    const yBase = 5 + (i / 36) * 90;
    const cx1 = 15 + Math.sin(seed * 0.017) * 25;
    const cy1 = yBase + Math.cos(seed * 0.023) * 18 * position;
    const cx2 = 55 + Math.sin(seed * 0.031) * 20;
    const cy2 = yBase + Math.sin(seed * 0.019) * 22 * position;
    const yEnd = yBase + Math.sin(seed * 0.013) * 12 * position;
    return {
      d: `M0 ${yBase} C${cx1} ${cy1} ${cx2} ${cy2} 100 ${yEnd}`,
      opacity: 0.025 + (i % 5) * 0.007,
      duration: 22 + (i % 8) * 2.5,
      delay: i * 0.35,
    };
  });
}

function PathGroup({ position }: { position: 1 | -1 }) {
  const paths = useMemo(() => buildPaths(position), [position]);
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ transform: position === -1 ? "scaleY(-1)" : undefined }}>
      {paths.map((p, i) => (
        <motion.path key={i} d={p.d} fill="none" stroke="currentColor"
          strokeWidth={0.12}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, p.opacity, p.opacity * 0.55, p.opacity * 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }} />
      ))}
    </svg>
  );
}

export function BackgroundPaths() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -5, color: "#10B981" }} aria-hidden>
      <PathGroup position={1} />
      <PathGroup position={-1} />
    </div>
  );
}
