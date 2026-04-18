"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { VitalCard } from "@/components/ui/vital-card";
import { useSelectedPatient, useStore } from "@/stores/vitals-store";
import type { AlertState } from "@/stores/vitals-store";
import { AnimatedNumber } from "@/lib/animated-number";

// Ten seconds of samples at 200 Hz = 2000 samples in the ring buffer.
const SAMPLES_PER_SEC = 200;
const BUFFER          = 2000;

// Synthetic ECG: P wave + QRS complex + T wave with a little noise.
function ecgSample(t: number): number {
  const phase = t % (2 * Math.PI);
  const p     = Math.exp(-Math.pow(phase - 0.40, 2) / 0.025) * 0.18;
  const q     = -Math.exp(-Math.pow(phase - 0.62, 2) / 0.004) * 0.22;
  const r     = Math.exp(-Math.pow(phase - 0.70, 2) / 0.002) * 1.00;
  const s     = -Math.exp(-Math.pow(phase - 0.78, 2) / 0.003) * 0.18;
  const twave = Math.exp(-Math.pow(phase - 1.10, 2) / 0.060) * 0.28;
  return p + q + r + s + twave + (Math.random() - 0.5) * 0.018;
}

function traceColor(s: AlertState, ch: 1 | 2) {
  if (s === "critical") return ch === 1 ? "#EF4444" : "#F87171";
  if (s === "warning")  return ch === 1 ? "#F59E0B" : "#FCD34D";
  return ch === 1 ? "#10B981" : "#14B8A6";
}

export function PulseWaveform() {
  const { dispatch } = useStore();
  const patient = useSelectedPatient();
  const status  = patient.alertState;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buf1      = useRef<number[]>([]);
  const buf2      = useRef<number[]>([]);
  const rafRef    = useRef<number>(0);

  // Mutable refs so the rAF loop sees the latest BPM/status without restarting.
  const bpmRef    = useRef(patient.vitalsBuffer.at(-1)?.pulse.bpm ?? 72);
  const statusRef = useRef<AlertState>(status);
  const phase1    = useRef(0);
  const phase2    = useRef(0);

  // Sync the latest BPM from the store into the ref each render.
  useEffect(() => {
    const latest = patient.vitalsBuffer.at(-1)?.pulse.bpm;
    if (latest) bpmRef.current = latest;
  }, [patient.vitalsBuffer]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Reset the ring buffer when the selected patient changes so traces don't
  // carry over visually between patients.
  useEffect(() => {
    buf1.current = [];
    buf2.current = [];
    phase1.current = 0;
    phase2.current = 0;
  }, [patient.id]);

  // Continuous sample generator + throttled draw. Runs for the lifetime of
  // the component; depends on nothing so it's never torn down mid-stream.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastDraw   = 0;
    let lastSample = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);

      // ── 1. Advance the sample stream based on real elapsed time ─────────
      // This decouples the ECG's heart rate from the browser's frame rate,
      // so the waveform stays rhythmically correct even under GPU load.
      const dt = Math.min(0.1, (now - lastSample) / 1000);
      lastSample = now;

      const hz        = bpmRef.current / 60;
      const samples   = Math.floor(dt * SAMPLES_PER_SEC);
      const phaseStep = (2 * Math.PI * hz) / SAMPLES_PER_SEC;

      for (let i = 0; i < samples; i++) {
        phase1.current += phaseStep;
        phase2.current += phaseStep * 0.98; // slightly detuned second channel
        buf1.current.push(ecgSample(phase1.current));
        buf2.current.push(ecgSample(phase2.current));
      }
      if (buf1.current.length > BUFFER) {
        buf1.current = buf1.current.slice(-BUFFER);
        buf2.current = buf2.current.slice(-BUFFER);
      }

      // ── 2. Throttle the actual paint to ~30fps ───────────────────────────
      if (now - lastDraw < 33) return;
      lastDraw = now;

      const { width: W, height: H } = canvas;
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth   = 1;
      for (let x = 0; x <= W; x += W / 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += H / 4)  { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      const drawTrace = (data: number[], color: string) => {
        if (data.length < 2) return;
        const step = W / BUFFER;
        // Map the tail of the buffer to the right edge of the canvas so the
        // waveform appears to scroll right-to-left as new samples arrive.
        const offsetX = W - data.length * step;

        ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.strokeStyle = color; ctx.lineWidth  = 1.5;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const x = offsetX + i * step;
          const y = H * 0.5 - data[i] * H * 0.38;
          if (i === 0) ctx.moveTo(x, y);
          else         ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Leading dot at the "now" edge
        const lv = data[data.length - 1];
        const lx = Math.min(offsetX + (data.length - 1) * step, W - 4);
        const ly = H * 0.5 - lv * H * 0.38;
        ctx.shadowColor = color; ctx.shadowBlur = 14;
        ctx.fillStyle   = color;
        ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      };

      drawTrace(buf1.current, traceColor(statusRef.current, 1));
      drawTrace(buf2.current, traceColor(statusRef.current, 2));
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Resize to device pixel ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext("2d");
      ctx?.scale(dpr, dpr);
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
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          {status === "critical" && (
            <motion.div className="absolute inset-0 pointer-events-none rounded-xl"
              animate={{ opacity: [0, 0.05, 0] }} transition={{ duration: 1.4, repeat: Infinity }}
              style={{ background: "#EF4444" }} />
          )}
        </div>
        <div className="flex justify-between">
          {["-10s","-8s","-6s","-4s","-2s","Now"].map(l =>
            <span key={l} style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>{l}</span>
          )}
        </div>
      </div>
    </VitalCard>
  );
}
