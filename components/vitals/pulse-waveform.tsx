"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { VitalCard } from "@/components/ui/vital-card";
import { useSelectedPatient, useStore } from "@/stores/vitals-store";
import type { AlertState } from "@/stores/vitals-store";
import { AnimatedNumber } from "@/lib/animated-number";

const SAMPLES_PER_SEC = 200;
const BUFFER          = 2000; // 10 s window

// Synthetic ECG: P wave + narrow QRS complex + T wave.
// Noise is kept very low so curves stay silky smooth.
function ecgSample(t: number): number {
  const phase = t % (2 * Math.PI);
  const p     = Math.exp(-Math.pow(phase - 0.40, 2) / 0.025) * 0.18;
  const q     = -Math.exp(-Math.pow(phase - 0.62, 2) / 0.004) * 0.22;
  const r     = Math.exp(-Math.pow(phase - 0.70, 2) / 0.002) * 1.00;
  const s     = -Math.exp(-Math.pow(phase - 0.78, 2) / 0.003) * 0.18;
  const tw    = Math.exp(-Math.pow(phase - 1.10, 2) / 0.060) * 0.28;
  // Tiny noise — enough to feel biological, small enough not to roughen curves
  return p + q + r + s + tw + (Math.random() - 0.5) * 0.006;
}

function traceColor(s: AlertState, ch: 1 | 2) {
  if (s === "critical") return ch === 1 ? "#EF4444" : "#F87171";
  if (s === "warning")  return ch === 1 ? "#F59E0B" : "#FCD34D";
  return ch === 1 ? "#10B981" : "#14B8A6";
}

// Draw a smooth catmull-rom spline through the sample array.
// Much silkier than lineTo because it interpolates tangents, so
// the QRS spike rises and falls in one continuous curve instead of
// a jagged series of segments.
function drawSmooth(
  ctx: CanvasRenderingContext2D,
  data: number[],
  offsetX: number,
  step: number,
  W: number,
  H: number,
) {
  if (data.length < 4) return;

  // Skip every other sample for performance (still 100 pts/sec visual)
  const stride  = 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < data.length; i += stride) {
    pts.push([offsetX + i * step, H * 0.5 - data[i] * H * 0.38]);
  }
  if (pts.length < 4) return;

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    // Catmull-Rom → cubic bezier conversion (tension = 0.5)
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }
}

export function PulseWaveform() {
  const { dispatch } = useStore();
  const patient   = useSelectedPatient();
  const status    = patient.alertState;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buf1      = useRef<number[]>([]);
  const buf2      = useRef<number[]>([]);
  const rafRef    = useRef<number>(0);

  const bpmRef    = useRef(patient.vitalsBuffer.at(-1)?.pulse.bpm ?? 72);
  const statusRef = useRef<AlertState>(status);
  const phase1    = useRef(0);
  const phase2    = useRef(0);

  useEffect(() => {
    const latest = patient.vitalsBuffer.at(-1)?.pulse.bpm;
    if (latest) bpmRef.current = latest;
  }, [patient.vitalsBuffer]);

  useEffect(() => { statusRef.current = status; }, [status]);

  // Reset buffers when patient changes
  useEffect(() => {
    buf1.current = [];
    buf2.current = [];
    phase1.current = 0;
    phase2.current = 0;
  }, [patient.id]);

  // Main rAF loop — sample generation + paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;

    let lastDraw   = 0;
    let lastSample = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);

      // ── Advance samples by real elapsed time ────────────────────────────
      const dt      = Math.min(0.1, (now - lastSample) / 1000);
      lastSample    = now;
      const hz      = bpmRef.current / 60;
      const nSamp   = Math.floor(dt * SAMPLES_PER_SEC);
      const pStep   = (2 * Math.PI * hz) / SAMPLES_PER_SEC;

      for (let i = 0; i < nSamp; i++) {
        phase1.current += pStep;
        phase2.current += pStep * 0.98;
        buf1.current.push(ecgSample(phase1.current));
        buf2.current.push(ecgSample(phase2.current));
      }
      if (buf1.current.length > BUFFER) {
        buf1.current = buf1.current.slice(-BUFFER);
        buf2.current = buf2.current.slice(-BUFFER);
      }

      // ── Throttle paint to 60fps max ─────────────────────────────────────
      if (now - lastDraw < 16) return;
      lastDraw = now;

      const W = canvas.width  / (window.devicePixelRatio || 1);
      const H = canvas.height / (window.devicePixelRatio || 1);

      // Fade out previous frame instead of hard clear — gives a natural
      // motion-blur / afterglow trail as the waveform scrolls.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(5,5,8,0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Grid — very subtle
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth   = 0.5;
      for (let x = 0; x <= W; x += W / 10) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y <= H; y += H / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();

      const drawTrace = (data: number[], color: string, opacity: number) => {
        if (data.length < 4) return;
        const step    = W / BUFFER;
        const offsetX = W - data.length * step;

        // Outer glow pass (wide, soft)
        ctx.save();
        ctx.globalAlpha  = opacity * 0.18;
        ctx.strokeStyle  = color;
        ctx.lineWidth    = 6;
        ctx.shadowColor  = color;
        ctx.shadowBlur   = 20;
        ctx.lineCap      = "round";
        ctx.lineJoin     = "round";
        drawSmooth(ctx, data, offsetX, step, W, H);
        ctx.stroke();
        ctx.restore();

        // Inner bright line
        ctx.save();
        ctx.globalAlpha  = opacity;
        ctx.strokeStyle  = color;
        ctx.lineWidth    = 1.5;
        ctx.shadowColor  = color;
        ctx.shadowBlur   = 8;
        ctx.lineCap      = "round";
        ctx.lineJoin     = "round";
        drawSmooth(ctx, data, offsetX, step, W, H);
        ctx.stroke();
        ctx.restore();

        // Leading dot — bright beacon at "Now"
        const last = data[data.length - 1];
        const lx   = Math.min(offsetX + (data.length - 1) * step, W - 4);
        const ly   = H * 0.5 - last * H * 0.38;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle   = "#ffffff";
        ctx.shadowColor = color;
        ctx.shadowBlur  = 18;
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      drawTrace(buf2.current, traceColor(statusRef.current, 2), 0.38);
      drawTrace(buf1.current, traceColor(statusRef.current, 1), 0.92);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // DPR-aware resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const bpmExact = patient.vitalsBuffer.at(-1)?.pulse.bpm ?? 0;

  return (
    <VitalCard title="Pulse Waveform" status={status} index={0}
      onAcknowledge={() => dispatch({ type: "ACKNOWLEDGE", patientId: patient.id })}>
      <div className="flex flex-col h-full gap-1">
        <div className="flex items-baseline gap-2">
          <AnimatedNumber value={bpmExact} className="vital-num text-4xl"
            style={{ color: traceColor(status, 1) }} duration={0.9} />
          <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>BPM</span>
          <span className="ml-auto label-upper" style={{ fontSize: 9 }}>Dual-channel PPG</span>
        </div>

        <div className="relative flex-1" style={{ minHeight: 100 }}>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
            style={{ borderRadius: 8 }} />
          {status === "critical" && (
            <motion.div className="absolute inset-0 pointer-events-none rounded-xl"
              animate={{ opacity: [0, 0.06, 0] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{ background: "#EF4444" }} />
          )}
        </div>

        <div className="flex justify-between">
          {["-10s", "-8s", "-6s", "-4s", "-2s", "Now"].map(l => (
            <span key={l} style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>{l}</span>
          ))}
        </div>
      </div>
    </VitalCard>
  );
}
