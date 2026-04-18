"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

// ─── Cursor glow that tracks mouse position ───────────────────────────────────
function CursorGlow() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 80, damping: 20 });
  const sy = useSpring(y, { stiffness: 80, damping: 20 });

  useEffect(() => {
    const move = (e: MouseEvent) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [x, y]);

  return (
    <motion.div
      className="pointer-events-none fixed z-0"
      style={{
        left: sx, top: sy,
        width: 600, height: 600,
        x: "-50%", y: "-50%",
        background: "radial-gradient(circle, rgba(16,185,129,0.07) 0%, rgba(139,92,246,0.04) 40%, transparent 70%)",
        borderRadius: "50%",
        filter: "blur(1px)",
      }}
    />
  );
}

// ─── Animated ECG hero line ────────────────────────────────────────────────────
function HeroECG() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let phase = 0;

    function ecg(t: number) {
      const p = t % (2 * Math.PI);
      return (
        Math.exp(-Math.pow(p - 0.40, 2) / 0.025) * 0.18 +
        -Math.exp(-Math.pow(p - 0.62, 2) / 0.004) * 0.22 +
        Math.exp(-Math.pow(p - 0.70, 2) / 0.002) * 1.00 +
        -Math.exp(-Math.pow(p - 0.78, 2) / 0.003) * 0.18 +
        Math.exp(-Math.pow(p - 1.10, 2) / 0.060) * 0.28
      );
    }

    const BUF = 600;
    const buf: number[] = Array.from({ length: BUF }, (_, i) =>
      ecg((i / BUF) * Math.PI * 4)
    );

    let lastFrame = performance.now();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      phase += dt * 2.2;
      const shift = Math.floor(phase);
      if (shift > 0) {
        phase -= shift;
        for (let i = 0; i < shift; i++) {
          buf.shift();
          buf.push(ecg(((buf.length) / BUF) * Math.PI * 4 + phase));
        }
      }

      ctx.clearRect(0, 0, W, H);

      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0,    "rgba(16,185,129,0)");
      grad.addColorStop(0.12, "rgba(16,185,129,0.35)");
      grad.addColorStop(0.88, "rgba(16,185,129,0.9)");
      grad.addColorStop(1,    "rgba(16,185,129,0)");

      // Glow layer
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 9;
      ctx.shadowColor = "#10B981";
      ctx.shadowBlur  = 32;
      ctx.globalAlpha = 0.15;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < buf.length - 1; i++) {
        const x = (i / (buf.length - 1)) * W;
        const y = H * 0.5 - buf[i] * H * 0.38;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Core smooth line using quadratic bezier
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 1.8;
      ctx.shadowColor = "#10B981";
      ctx.shadowBlur  = 10;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 1; i < buf.length - 2; i++) {
        const x1 = (i / (buf.length - 1)) * W;
        const y1 = H * 0.5 - buf[i] * H * 0.38;
        const x2 = ((i + 1) / (buf.length - 1)) * W;
        const y2 = H * 0.5 - buf[i + 1] * H * 0.38;
        if (i === 1) ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      ctx.stroke();
      ctx.restore();

      // Leading dot
      const last = buf[buf.length - 1];
      const ly   = H * 0.5 - last * H * 0.38;
      ctx.save();
      ctx.fillStyle   = "#fff";
      ctx.shadowColor = "#10B981";
      ctx.shadowBlur  = 22;
      ctx.beginPath();
      ctx.arc(W - 2, ly, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

// ─── Floating metric cards ─────────────────────────────────────────────────────
const METRICS = [
  { label: "Heart Rate",  value: 72,   unit: "BPM",  color: "#10B981", delay: 0.7,  drift: 0.6 },
  { label: "SpO₂",        value: 98,   unit: "%",    color: "#3B82F6", delay: 0.82, drift: 0.1 },
  { label: "Resp Rate",   value: 16,   unit: "/min", color: "#8B5CF6", delay: 0.94, drift: 0.4 },
  { label: "Temperature", value: 36.8, unit: "°C",   color: "#F59E0B", delay: 1.06, drift: 0.05 },
];

function MetricCard({ label, value, unit, color, delay, drift }: typeof METRICS[0]) {
  const [live, setLive] = useState(value);
  useEffect(() => {
    const iv = setInterval(() => {
      setLive(v => {
        const next = v + (Math.random() - 0.5) * drift;
        return parseFloat(Math.max(value * 0.92, Math.min(value * 1.08, next)).toFixed(1));
      });
    }, 1400 + Math.random() * 800);
    return () => clearInterval(iv);
  }, [value, drift]);

  const pct = Math.round(((live - value * 0.92) / (value * 0.16)) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 200, damping: 22 }}
      whileHover={{ scale: 1.06, y: -6, transition: { duration: 0.2 } }}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}30`,
        borderRadius: 16, padding: "16px 20px",
        backdropFilter: "blur(16px)",
        minWidth: 130, cursor: "default",
        boxShadow: `0 0 30px ${color}14, inset 0 0 0 1px rgba(255,255,255,0.03)`,
      }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontFamily: "monospace",
        textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span style={{ fontSize: 26, fontWeight: 700, color,
          fontFamily: "monospace", fontVariantNumeric: "tabular-nums", minWidth: 60 }}>
          {label === "Temperature" ? live.toFixed(1) : Math.round(live)}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: "monospace" }}>{unit}</span>
      </div>
      <div style={{ marginTop: 10, height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <motion.div animate={{ width: `${Math.max(10, Math.min(100, pct))}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ height: "100%", background: `linear-gradient(90deg, ${color}88, ${color})`,
            borderRadius: 2, boxShadow: `0 0 8px ${color}` }} />
      </div>
    </motion.div>
  );
}

// ─── Background grid ───────────────────────────────────────────────────────────
function BackgroundGrid() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.028)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 20%, #050508 100%)",
      }} />
    </div>
  );
}

// ─── Ambient orbs ──────────────────────────────────────────────────────────────
function FloatingOrbs() {
  const orbs = [
    { size: 500, x: "8%",  y: "25%", color: "#10B981", delay: 0,   dur: 9 },
    { size: 350, x: "82%", y: "55%", color: "#8B5CF6", delay: 2,   dur: 12 },
    { size: 280, x: "58%", y: "8%",  color: "#3B82F6", delay: 1,   dur: 10 },
    { size: 220, x: "22%", y: "78%", color: "#10B981", delay: 3.5, dur: 14 },
  ];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {orbs.map((o, i) => (
        <motion.div key={i}
          style={{
            position: "absolute", left: o.x, top: o.y,
            width: o.size, height: o.size, borderRadius: "50%",
            background: `radial-gradient(circle, ${o.color}10 0%, transparent 70%)`,
            filter: "blur(50px)", transform: "translate(-50%,-50%)",
          }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.75, 0.4] }}
          transition={{ duration: o.dur, delay: o.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────
const STATS = [
  { value: "5",     label: "Patients" },
  { value: "200Hz", label: "Waveform" },
  { value: "< 1s",  label: "Latency" },
  { value: "99.9%", label: "Uptime" },
];

// ─── Home page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router  = useRouter();
  const [entering, setEntering] = useState(false);

  const handleEnter = () => {
    setEntering(true);
    setTimeout(() => router.push("/dashboard"), 650);
  };

  return (
    <div style={{ background: "#050508", minHeight: "100vh", overflow: "hidden",
      fontFamily: "var(--font-dm-sans, DM Sans, sans-serif)", color: "#fafafa" }}>

      <CursorGlow />
      <BackgroundGrid />
      <FloatingOrbs />

      <div className="relative flex flex-col items-center justify-center"
        style={{ minHeight: "100vh", zIndex: 10, padding: "40px 24px" }}>

        {/* Live badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: 100, padding: "7px 16px",
          }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full animate-ping"
                style={{ background: "#10B981", opacity: 0.65 }} />
              <span className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: "#10B981" }} />
            </span>
            <span style={{ fontSize: 11, color: "#10B981", fontFamily: "monospace",
              textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
              Live Patient Monitoring
            </span>
          </div>
        </motion.div>

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ textAlign: "center", marginBottom: 12 }}>
          <h1 style={{
            fontSize: "clamp(64px, 12vw, 128px)",
            fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1,
            fontFamily: "var(--font-outfit, Outfit, sans-serif)",
            background: "linear-gradient(160deg, #ffffff 0%, rgba(255,255,255,0.45) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            margin: 0,
          }}>
            VIGIL
          </h1>
          <p style={{
            fontSize: "clamp(11px, 1.5vw, 14px)", color: "rgba(255,255,255,0.25)",
            fontFamily: "monospace", letterSpacing: "0.4em",
            textTransform: "uppercase", marginTop: 10,
          }}>
            Clinical Vitals Dashboard
          </p>
        </motion.div>

        {/* ECG strip */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0.5 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: "min(680px, 88vw)", height: 72,
            position: "relative", marginBottom: 28 }}>
          <HeroECG />
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          style={{ fontSize: "clamp(14px, 2vw, 16px)", color: "rgba(255,255,255,0.38)",
            textAlign: "center", maxWidth: 460, lineHeight: 1.75, marginBottom: 36 }}>
          Real-time multi-patient vitals with continuous ECG waveforms,
          intelligent alerts, and clinical analytics — all in one view.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.52 }}
          style={{ marginBottom: 52 }}>
          <AnimatePresence mode="wait">
            {!entering ? (
              <motion.button key="cta"
                onClick={handleEnter}
                whileHover={{ scale: 1.05, boxShadow: "0 0 55px rgba(16,185,129,0.5), 0 4px 24px rgba(0,0,0,0.5)" }}
                whileTap={{ scale: 0.97 }}
                exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.25 } }}
                style={{
                  position: "relative", overflow: "hidden",
                  padding: "15px 52px", borderRadius: 100, border: "none",
                  cursor: "pointer", fontSize: 15, fontWeight: 700,
                  fontFamily: "var(--font-outfit, Outfit, sans-serif)",
                  letterSpacing: "0.02em", color: "#050508",
                  background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                  boxShadow: "0 0 40px rgba(16,185,129,0.3), 0 4px 20px rgba(0,0,0,0.4)",
                }}>
                {/* Shimmer */}
                <motion.span
                  style={{
                    position: "absolute", top: 0, width: "50%", height: "100%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                    transform: "skewX(-20deg)",
                  }}
                  animate={{ left: ["-60%", "160%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
                />
                Open Dashboard →
              </motion.button>
            ) : (
              <motion.div key="spinner"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ display: "flex", alignItems: "center", gap: 10,
                  color: "#10B981", fontFamily: "monospace", fontSize: 14 }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  style={{ width: 18, height: 18, borderRadius: "50%",
                    border: "2px solid rgba(16,185,129,0.25)", borderTopColor: "#10B981" }} />
                Loading…
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Metric cards */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {METRICS.map(m => <MetricCard key={m.label} {...m} />)}
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          style={{
            display: "flex", marginTop: 52, width: "min(640px, 88vw)",
            borderTop: "1px solid rgba(255,255,255,0.055)",
            borderBottom: "1px solid rgba(255,255,255,0.055)",
            padding: "18px 0",
          }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{
              flex: 1, textAlign: "center",
              borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.055)" : "none",
              padding: "0 12px",
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff",
                fontFamily: "monospace", letterSpacing: "-0.02em" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)",
                fontFamily: "monospace", textTransform: "uppercase",
                letterSpacing: "0.1em", marginTop: 4 }}>
                {s.label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          style={{ marginTop: 32, fontSize: 10, color: "rgba(255,255,255,0.15)",
            fontFamily: "monospace", letterSpacing: "0.06em" }}>
          VIGIL v0.1 · For demonstration purposes only
        </motion.p>

      </div>
    </div>
  );
}
