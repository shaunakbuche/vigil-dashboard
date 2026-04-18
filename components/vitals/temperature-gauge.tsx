"use client";

import { useEffect, useRef } from "react";
import { animate, motion, AnimatePresence, useMotionValue } from "framer-motion";
import { VitalCard } from "@/components/ui/vital-card";
import { useSelectedPatient, useStore } from "@/stores/vitals-store";

const CX = 70, CY = 70, R = 52;
const START = -225, SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, a1: number, a2: number) {
  const s = polar(cx, cy, r, a1), e = polar(cx, cy, r, a2);
  return `M${s.x} ${s.y} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

const SEGMENTS = [
  { label: "Hypo",    a1: START,           a2: START + SWEEP * (1.5 / 6), color: "#3B82F6" },
  { label: "Low",     a1: START + SWEEP * (1.5 / 6), a2: START + SWEEP * (2.1 / 6), color: "#60A5FA" },
  { label: "Normal",  a1: START + SWEEP * (2.1 / 6), a2: START + SWEEP * (3.3 / 6), color: "#10B981" },
  { label: "Elev",    a1: START + SWEEP * (3.3 / 6), a2: START + SWEEP * (4.5 / 6), color: "#F59E0B" },
  { label: "Fever",   a1: START + SWEEP * (4.5 / 6), a2: START + SWEEP,             color: "#EF4444" },
];

function tempColor(c: number) {
  if (c < 35.5) return "#3B82F6";
  if (c > 38.5) return "#EF4444";
  if (c > 37.3) return "#F59E0B";
  return "#10B981";
}

function tempLabel(c: number) {
  if (c < 35.5) return "Hypothermia";
  if (c > 38.5) return "High Fever";
  if (c > 37.3) return "Elevated";
  if (c < 36.1) return "Low Normal";
  return "Normal";
}

function tempToAngle(c: number) {
  const pct = Math.max(0, Math.min(1, (c - 34) / (40 - 34)));
  return START + pct * SWEEP;
}

export function TemperatureGauge() {
  const { dispatch } = useStore();
  const patient = useSelectedPatient();
  const status  = patient.alertState;
  const celsius = patient.vitalsBuffer.at(-1)?.temperature.celsius ?? 36.8;
  const color   = tempColor(celsius);
  const angle   = tempToAngle(celsius);
  const dotPos  = polar(CX, CY, R, angle);

  // Tween the SVG <text> readout imperatively so 36.8 → 36.9 creeps decimal
  // by decimal instead of snapping. AnimatedNumber renders a <span> which
  // isn't legal inside SVG, so we inline the pattern here.
  const textRef = useRef<SVGTextElement>(null);
  const mv = useMotionValue(celsius);
  useEffect(() => {
    const controls = animate(mv, celsius, {
      duration: 0.9,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate: (latest) => {
        if (textRef.current) textRef.current.textContent = latest.toFixed(1);
      },
    });
    return () => controls.stop();
  }, [celsius, mv]);

  return (
    <VitalCard title="Temperature" status={status} index={3}
      onAcknowledge={() => dispatch({ type: "ACKNOWLEDGE", patientId: patient.id })}>
      <div className="flex flex-col h-full items-center justify-center gap-1">
        <svg width={140} height={140} viewBox="0 0 140 140">
          {/* Track segments */}
          {SEGMENTS.map((s) => (
            <path key={s.label} d={arc(CX, CY, R, s.a1, s.a2)}
              fill="none" stroke={s.color} strokeWidth={5} strokeLinecap="round" opacity={0.22} />
          ))}

          {/* Fill to current */}
          <motion.path
            d={arc(CX, CY, R, START, angle)}
            fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ type: "spring", stiffness: 70, damping: 18 }}
          />

          {/* Dot */}
          <motion.circle r={5} fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            animate={{ cx: dotPos.x, cy: dotPos.y }}
            transition={{ type: "spring", stiffness: 70, damping: 18 }}
          />

          {/* Radial glow */}
          <circle cx={CX} cy={CY} r={26} fill={color} opacity={0.06} />

          {/* Reading */}
          <text ref={textRef} x={CX} y={CY - 2} textAnchor="middle" fill="white"
            fontSize={21} fontWeight={600}
            style={{ fontFamily: "var(--font-jetbrains,'JetBrains Mono',monospace)", fontVariantNumeric: "tabular-nums" }}>
            {celsius.toFixed(1)}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" fill="rgba(255,255,255,.3)" fontSize={10} fontFamily="monospace">
            °C
          </text>
        </svg>

        <AnimatePresence mode="wait">
          <motion.span key={tempLabel(celsius)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color }}>
            {tempLabel(celsius)}
          </motion.span>
        </AnimatePresence>

        <div className="flex justify-between w-full px-3">
          {["34°","36.1°","37.3°","38.5°","40°"].map((l, i) => (
            <span key={i} style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>{l}</span>
          ))}
        </div>
      </div>
    </VitalCard>
  );
}
