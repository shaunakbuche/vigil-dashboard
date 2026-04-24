"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { VitalCard } from "@/components/ui/vital-card";
import { AnimatedNumber } from "@/lib/animated-number";
import type { FeatherReading } from "@/lib/ble-client";

interface MotionCardProps {
  reading: FeatherReading | null;
  index?: number;
}

// Mini canvas that draws a rolling 3-axis accel history bar
function AccelHistory({ ax, ay, az }: { ax: number; ay: number; az: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufX = useRef<number[]>([]);
  const bufY = useRef<number[]>([]);
  const bufZ = useRef<number[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    bufX.current.push(ax);
    bufY.current.push(ay);
    // Remove gravity offset from Z so resting Z ≈ 0
    bufZ.current.push(az - 9.8);
    const MAX = 120;
    if (bufX.current.length > MAX) bufX.current.shift();
    if (bufY.current.length > MAX) bufY.current.shift();
    if (bufZ.current.length > MAX) bufZ.current.shift();
  }, [ax, ay, az]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      canvas.width  = W * (window.devicePixelRatio || 1);
      canvas.height = H * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, W, H);

      const drawLine = (buf: number[], color: string, scale = 0.25) => {
        if (buf.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.lineCap = "round";
        for (let i = 0; i < buf.length; i++) {
          const x = (i / (buf.length - 1)) * W;
          const y = H * 0.5 - buf[i] * H * scale;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      // Grid line
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(W, H * 0.5); ctx.stroke();

      drawLine(bufX.current, "#EF4444", 0.3);
      drawLine(bufY.current, "#10B981", 0.3);
      drawLine(bufZ.current, "#3B82F6", 0.3);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return <canvas ref={canvasRef} className="w-full" style={{ height: 60 }} />;
}

// Gyro orientation sphere — a simple 2D projection of the gyro vector
function GyroViz({ gx, gy, gz }: { gx: number; gy: number; gz: number }) {
  const magnitude = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const intensity = Math.min(1, magnitude / 2); // normalise to 0-1
  const hue = (Math.atan2(gy, gx) * 180 / Math.PI + 180) % 360;

  return (
    <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
      {/* Background ring */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.08)",
      }} />
      {/* Intensity glow */}
      <motion.div
        animate={{ scale: [1, 1 + intensity * 0.3, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `radial-gradient(circle, hsla(${hue},80%,60%,${0.15 + intensity * 0.35}) 0%, transparent 70%)`,
        }} />
      {/* Dot */}
      <div style={{
        position: "absolute",
        left: `${50 + gy * 15}%`, top: `${50 - gz * 15}%`,
        width: 6, height: 6, borderRadius: "50%",
        background: `hsl(${hue},80%,65%)`,
        transform: "translate(-50%,-50%)",
        boxShadow: `0 0 8px hsl(${hue},80%,65%)`,
      }} />
      <div style={{ position: "absolute", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)",
          fontFamily: "monospace" }}>
          {magnitude.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

export function MotionCard({ reading, index = 4 }: MotionCardProps) {
  const ax = reading?.accelX  ?? 0;
  const ay = reading?.accelY  ?? 0;
  const az = reading?.accelZ  ?? 9.8;
  const gx = reading?.gyroX   ?? 0;
  const gy = reading?.gyroY   ?? 0;
  const gz = reading?.gyroZ   ?? 0;
  const act = reading?.activity ?? 0;

  const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);

  return (
    <VitalCard title="Motion / IMU" status="normal" index={index}>
      <div className="flex flex-col h-full gap-2">

        {/* Top row: activity level + gyro viz */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)",
              fontFamily: "monospace", textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 3 }}>
              Activity
            </div>
            <div className="flex items-baseline gap-1">
              <AnimatedNumber value={act} decimals={3}
                className="vital-num" style={{ fontSize: 28, color: "#8B5CF6" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)",
                fontFamily: "monospace" }}>m/s²</span>
            </div>
            {/* Activity bar */}
            <div style={{ marginTop: 6, height: 3,
              background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <motion.div
                animate={{ width: `${Math.min(100, act * 200)}%` }}
                transition={{ duration: 0.4 }}
                style={{ height: "100%", borderRadius: 2,
                  background: "linear-gradient(90deg,#8B5CF6,#A78BFA)",
                  boxShadow: "0 0 8px #8B5CF6" }} />
            </div>
          </div>

          <GyroViz gx={gx} gy={gy} gz={gz} />
        </div>

        {/* Accel axes rolling chart */}
        <AccelHistory ax={ax} ay={ay} az={az} />

        {/* Raw values */}
        <div className="grid grid-cols-3 gap-1">
          {[
            { label: "Ax", v: ax, col: "#EF4444" },
            { label: "Ay", v: ay, col: "#10B981" },
            { label: "Az", v: az, col: "#3B82F6" },
            { label: "Gx", v: gx, col: "#EF4444" },
            { label: "Gy", v: gy, col: "#10B981" },
            { label: "Gz", v: gz, col: "#3B82F6" },
          ].map(({ label, v, col }) => (
            <div key={label} style={{ textAlign: "center",
              background: "rgba(255,255,255,0.025)", borderRadius: 6, padding: "3px 0" }}>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)",
                fontFamily: "monospace", marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: 10, color: col, fontFamily: "monospace",
                fontVariantNumeric: "tabular-nums" }}>
                {v.toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between">
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)",
            fontFamily: "monospace" }}>LSM6DS33 · 10Hz</span>
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)",
            fontFamily: "monospace" }}>|a|={magnitude.toFixed(2)} m/s²</span>
        </div>
      </div>
    </VitalCard>
  );
}
