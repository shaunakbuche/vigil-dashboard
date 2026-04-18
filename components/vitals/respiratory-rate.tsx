"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { VitalCard } from "@/components/ui/vital-card";
import { useSelectedPatient, useStore } from "@/stores/vitals-store";
import { AnimatedNumber } from "@/lib/animated-number";

export function RespiratoryRate() {
  const { dispatch } = useStore();
  const patient = useSelectedPatient();
  const status  = patient.alertState;

  const data = useMemo(() =>
    patient.vitalsBuffer.slice(-10).map((r, i) => ({ i, rate: Math.round(r.respiratory.rate * 10) / 10 })),
    [patient.vitalsBuffer]
  );

  // Tween the live (un-rounded) rate so the display creeps between ticks.
  const curExact = patient.vitalsBuffer.at(-1)?.respiratory.rate ?? 0;
  const col  = status === "critical" ? "#EF4444" : status === "warning" ? "#F59E0B" : "#8B5CF6";
  const colL = status === "critical" ? "#F87171" : status === "warning" ? "#FCD34D" : "#A78BFA";

  return (
    <VitalCard title="Respiratory Rate" status={status} index={2}
      onAcknowledge={() => dispatch({ type: "ACKNOWLEDGE", patientId: patient.id })}>
      <div className="flex flex-col h-full gap-1">
        <div className="flex items-baseline gap-2">
          <AnimatedNumber value={curExact} className="vital-num"
            style={{ fontSize: 48, color: col }} duration={0.9} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>/min</span>
        </div>

        <div className="flex-1 min-h-0" style={{ minHeight: 70 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 2, left: -26, bottom: 0 }} barSize={12}>
              <defs>
                {data.map((_, i) => (
                  <linearGradient key={i} id={`rg${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={colL} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={col}  stopOpacity={0.55} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis domain={[8, 30]} tick={{ fill: "rgba(255,255,255,0.18)", fontSize: 9, fontFamily: "monospace" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "rgba(5,5,8,.92)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 8, fontSize: 11, color: "#fff" }}
                formatter={(v: number) => [`${v}/min`, ""]}
                labelFormatter={() => ""}
              />
              <Bar dataKey="rate" radius={[4,4,0,0]} isAnimationActive={false}>
                {data.map((_, i) => <Cell key={i} fill={`url(#rg${i})`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-between">
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>Safe: 12–20/min</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>Last 10</span>
        </div>
      </div>
    </VitalCard>
  );
}
