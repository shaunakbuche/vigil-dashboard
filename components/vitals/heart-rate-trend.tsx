"use client";

import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { VitalCard } from "@/components/ui/vital-card";
import { useSelectedPatient, useStore } from "@/stores/vitals-store";
import { AnimatedNumber } from "@/lib/animated-number";

export function HeartRateTrend() {
  const { dispatch } = useStore();
  const patient = useSelectedPatient();
  const status  = patient.alertState;

  const data = useMemo(() =>
    patient.vitalsBuffer.slice(-60).map((r, i) => ({ i, bpm: Math.round(r.pulse.bpm) })),
    [patient.vitalsBuffer]
  );

  // Use the un-rounded live value for the tween so the display creeps
  // continuously between 1 Hz ticks instead of jumping whole integers.
  const curExact = patient.vitalsBuffer.at(-1)?.pulse.bpm ?? 0;
  const cur  = data.at(-1)?.bpm ?? 0;
  const prev = data.at(-6)?.bpm ?? cur;
  const diff = cur - prev;
  const col  = status === "critical" ? "#EF4444" : status === "warning" ? "#F59E0B" : "#10B981";

  return (
    <VitalCard title="Heart Rate Trend" status={status} index={1}
      onAcknowledge={() => dispatch({ type: "ACKNOWLEDGE", patientId: patient.id })}>
      <div className="flex flex-col h-full gap-1">
        {/* Reading */}
        <div className="flex items-baseline gap-2">
          <AnimatedNumber value={curExact} className="vital-num"
            style={{ fontSize: 48, color: col }} duration={0.9} />
          <div className="flex flex-col gap-0">
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>BPM</span>
            <span style={{ fontSize: 11, color: Math.abs(diff) < 1 ? "rgba(255,255,255,0.25)" : diff > 0 ? "#EF4444" : "#10B981" }}>
              {Math.abs(diff) < 1 ? "—" : diff > 0 ? "↑" : "↓"}
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 min-h-0" style={{ minHeight: 70 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 2, left: -26, bottom: 0 }}>
              <defs>
                <linearGradient id="hrg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={col} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={col} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <ReferenceLine y={60}  stroke="rgba(255,255,255,0.07)" strokeDasharray="4 4" />
              <ReferenceLine y={100} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 4" />
              <XAxis dataKey="i" hide />
              <YAxis domain={["auto","auto"]} tick={{ fill: "rgba(255,255,255,0.18)", fontSize: 9, fontFamily: "monospace" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "rgba(5,5,8,.92)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 8, fontSize: 11, color: "#fff" }}
                formatter={(v: number) => [`${v} BPM`, ""]}
                labelFormatter={() => ""}
              />
              <Area type="monotone" dataKey="bpm" stroke={col} strokeWidth={1.5} fill="url(#hrg)"
                dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: col, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-between">
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>Safe: 60–100 BPM</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>30 min</span>
        </div>
      </div>
    </VitalCard>
  );
}
