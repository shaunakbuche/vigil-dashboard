"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import type { AlertState } from "@/stores/vitals-store";

interface VitalCardProps {
  title: string;
  status?: AlertState;
  children: ReactNode;
  className?: string;
  onAcknowledge?: () => void;
  index?: number;
}

const borderColor: Record<AlertState, string> = {
  normal: "rgba(255,255,255,0.08)",
  warning: "rgba(245,158,11,0.35)",
  critical: "rgba(239,68,68,0.45)",
  acknowledged: "rgba(245,158,11,0.18)",
};

const topGradient: Record<AlertState, string> = {
  normal: "linear-gradient(90deg,rgba(16,185,129,.35) 0%,rgba(139,92,246,.3) 50%,rgba(59,130,246,.2) 100%)",
  warning: "linear-gradient(90deg,rgba(245,158,11,.6) 0%,rgba(245,158,11,.3) 60%,transparent 100%)",
  critical: "linear-gradient(90deg,rgba(239,68,68,.7) 0%,rgba(239,68,68,.35) 60%,transparent 100%)",
  acknowledged: "linear-gradient(90deg,rgba(245,158,11,.3) 0%,rgba(245,158,11,.15) 60%,transparent 100%)",
};

const pulseAnim: Record<AlertState, string | undefined> = {
  normal: undefined,
  warning: "warning-glow 2.2s ease-in-out infinite",
  critical: "alert-pulse 1.4s ease-in-out infinite",
  acknowledged: undefined,
};

export function VitalCard({ title, status = "normal", children, className, onAcknowledge, index = 0 }: VitalCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 20, delay: index * 0.08 }}
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
      className={cn("glass-card flex flex-col gap-2 p-4 h-full", className)}
      style={{
        borderColor: borderColor[status],
        animation: pulseAnim[status],
      }}
    >
      {/* Chromatic top edge */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: topGradient[status] }} />

      {/* Header row */}
      <div className="flex items-center justify-between shrink-0">
        <span className="label-upper">{title}</span>
        <AnimatePresence>
          {status === "critical" && onAcknowledge && (
            <motion.button
              key="ack-btn"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              onClick={onAcknowledge}
              className="px-2 py-0.5 rounded cursor-pointer text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444" }}
            >
              Acknowledge
            </motion.button>
          )}
          {status === "warning" && (
            <motion.span key="warn-badge" initial={{ opacity: 0 }} animate={{ opacity: [0.5,1,0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-[10px] uppercase tracking-wider" style={{ color: "#F59E0B" }}>
              Warning
            </motion.span>
          )}
          {status === "acknowledged" && (
            <motion.span key="ack-badge" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(245,158,11,0.55)" }}>
              Ack'd
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">{children}</div>
    </motion.div>
  );
}
