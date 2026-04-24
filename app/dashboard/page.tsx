"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Users, Bell, BarChart3, Settings, LogOut,
  WifiOff, Search, ChevronRight, ChevronLeft, X,
  CheckCircle, AlertTriangle, AlertCircle, Clock,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { ShaderBackground }  from "@/components/ui/shader-background";
import { BackgroundPaths }   from "@/components/ui/background-paths";
import { PulseWaveform }     from "@/components/vitals/pulse-waveform";
import { HeartRateTrend }    from "@/components/vitals/heart-rate-trend";
import { RespiratoryRate }   from "@/components/vitals/respiratory-rate";
import { TemperatureGauge }  from "@/components/vitals/temperature-gauge";
import { BLEConnect }        from "@/components/ui/ble-connect";
import { VitalsProvider, useStore, useSelectedPatient } from "@/stores/vitals-store";
import type { Patient, AlertState } from "@/stores/vitals-store";
import { AnimatedNumber } from "@/lib/animated-number";
import { bleClient } from "@/lib/ble-client";
import { Bluetooth } from "lucide-react";

type NavTab = "vitals" | "patients" | "analytics" | "alerts";

// ─── Atoms ────────────────────────────────────────────────────────────────────

function StatusDot({ state }: { state: AlertState }) {
  const c = { normal: "#10B981", warning: "#F59E0B", critical: "#EF4444", acknowledged: "#F59E0B" }[state];
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {state === "critical" && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: c }} />
      )}
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: c }} />
    </span>
  );
}

function PatientAvatar({ initials, state, size = 32 }: { initials: string; state: AlertState; size?: number }) {
  const ring = { normal: "rgba(16,185,129,.3)", warning: "rgba(245,158,11,.4)", critical: "rgba(239,68,68,.5)", acknowledged: "rgba(245,158,11,.2)" }[state];
  return (
    <div className="flex items-center justify-center rounded-full font-semibold text-white shrink-0"
      style={{ width: size, height: size, background: "rgba(255,255,255,.08)", border: `2px solid ${ring}`, fontSize: size * 0.33, fontFamily: "var(--font-dm-sans,sans-serif)" }}>
      {initials}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
  collapsed, onToggle, activeNav, setActiveNav, onSettingsClick, onSignOut,
}: {
  collapsed: boolean;
  onToggle(): void;
  activeNav: NavTab;
  setActiveNav(t: NavTab): void;
  onSettingsClick(): void;
  onSignOut(): void;
}) {
  const { state, dispatch } = useStore();
  const { patients, ui } = state;
  const critCount = patients.filter(p => p.alertState === "critical").length;

  const navItems: { Icon: typeof Activity; label: string; tab: NavTab }[] = [
    { Icon: Activity,  label: "Vitals",    tab: "vitals"    },
    { Icon: Users,     label: "Patients",  tab: "patients"  },
    { Icon: BarChart3, label: "Analytics", tab: "analytics" },
  ];

  return (
    <motion.aside
      animate={{ width: collapsed ? 60 : 216 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="flex flex-col h-full shrink-0 overflow-hidden"
      style={{ background: "rgba(4,4,7,.85)", borderRight: "1px solid rgba(255,255,255,.05)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3.5 shrink-0"
        style={{ height: 60, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <Activity size={18} color="#10B981" className="shrink-0" />
        <AnimatePresence>
          {!collapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="font-bold text-[14px] whitespace-nowrap overflow-hidden"
              style={{ color: "#10B981", fontFamily: "var(--font-outfit,sans-serif)" }}>
              VIGIL
            </motion.span>
          )}
        </AnimatePresence>
        <button onClick={onToggle} aria-label="Toggle sidebar"
          className="ml-auto p-1 rounded opacity-25 hover:opacity-80 transition-opacity cursor-pointer">
          {collapsed ? <ChevronRight size={12} color="white" /> : <ChevronLeft size={12} color="white" />}
        </button>
      </div>

      {/* Nav */}
      <div className="flex flex-col gap-0.5 px-2 py-3 shrink-0">
        {navItems.map(({ Icon, label, tab }) => {
          const active = activeNav === tab;
          return (
            <button key={label} onClick={() => setActiveNav(tab)}
              className="flex items-center gap-3 px-2 py-2 rounded-lg transition-all cursor-pointer text-left hover:bg-white/5"
              style={active
                ? { background: "rgba(16,185,129,.08)", boxShadow: "0 0 10px rgba(16,185,129,.12)", color: "white" }
                : { color: "rgba(255,255,255,.35)" }}>
              <Icon size={17} className="shrink-0" style={{ color: active ? "#10B981" : undefined }} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-[13px] font-medium whitespace-nowrap"
                    style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
        {/* Alerts w/ badge */}
        <button onClick={() => setActiveNav("alerts")}
          className="relative flex items-center gap-3 px-2 py-2 rounded-lg transition-all cursor-pointer hover:bg-white/5 text-left"
          style={activeNav === "alerts"
            ? { background: "rgba(239,68,68,.08)", boxShadow: "0 0 10px rgba(239,68,68,.12)", color: "white" }
            : { color: "rgba(255,255,255,.35)" }}>
          <Bell size={17} className="shrink-0" style={{ color: activeNav === "alerts" ? "#EF4444" : undefined }} />
          {critCount > 0 && (
            <span className="absolute left-4 top-1.5 flex items-center justify-center rounded-full text-white font-bold"
              style={{ width: 14, height: 14, fontSize: 9, background: "#EF4444", fontFamily: "monospace" }}>
              {critCount}
            </span>
          )}
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[13px] font-medium whitespace-nowrap"
                style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                Alerts
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,.04)", margin: "0 14px" }} />

      {/* Patient list */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "none" }}>
        {patients.map(p => (
          <button key={p.id}
            onClick={() => { dispatch({ type: "SELECT_PATIENT", patientId: p.id }); setActiveNav("vitals"); }}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-left cursor-pointer mb-1 hover:bg-white/5"
            style={{ background: ui.selectedPatientId === p.id ? "rgba(255,255,255,.07)" : "transparent" }}>
            <PatientAvatar initials={p.initials} state={p.alertState} size={26} />
            <AnimatePresence>
              {!collapsed && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-white truncate flex items-center gap-1.5" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                    {p.name.split(" ")[0]}
                    {p.deviceType === "ble" && (
                      <Bluetooth size={9} style={{ color: "#3B82F6", flexShrink: 0 }} />
                    )}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "rgba(255,255,255,.28)", fontFamily: "monospace" }}>
                    {p.deviceType === "ble" ? "BLE Device" : p.bed}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {p.deviceType === "ble"
              ? <Bluetooth size={10} style={{ color: "#3B82F6", flexShrink: 0 }} />
              : <StatusDot state={p.alertState} />
            }
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-2 py-2" style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <button onClick={onSettingsClick}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all text-left hover:bg-white/5"
          style={{ color: "rgba(255,255,255,.35)" }}>
          <Settings size={15} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[12px] whitespace-nowrap" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <button onClick={onSignOut}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all text-left hover:bg-white/5"
          style={{ color: "rgba(255,255,255,.35)" }}>
          <LogOut size={15} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[12px] whitespace-nowrap" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                Sign out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

function LiveClock() {
  // Keeps a 1 Hz ticking HH:MM:SS readout. Intentionally its own component so
  // the setInterval re-render doesn't invalidate the whole TopBar each second.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return (
    <span className="text-[10px] tabular-nums"
      style={{ color: "rgba(255,255,255,.55)", fontFamily: "monospace", letterSpacing: "0.04em" }}>
      {hh}:{mm}:<span style={{ color: "rgba(255,255,255,.3)" }}>{ss}</span>
    </span>
  );
}

function TopBar({ onSearchOpen }: { onSearchOpen(): void }) {
  const { state, dispatch } = useStore();
  const { patients, ui } = state;
  const critCount = patients.filter(p => p.alertState === "critical").length;

  return (
    <header className="flex items-center gap-4 px-5 shrink-0"
      style={{ height: 60, borderBottom: "1px solid rgba(255,255,255,.05)", background: "rgba(5,5,8,.65)", backdropFilter: "blur(12px)" }}>

      {/* Avatar stack + count */}
      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {patients.slice(0, 4).map(p => (
            <div key={p.id} className="flex items-center justify-center rounded-full text-white border border-black/30"
              style={{ width: 22, height: 22, fontSize: 7, fontWeight: 700, background: "rgba(255,255,255,.1)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
              {p.initials}
            </div>
          ))}
        </div>
        <span className="text-[12px]" style={{ color: "rgba(255,255,255,.4)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
          <span className="text-white font-semibold">{patients.length}</span> monitored
        </span>
      </div>

      {critCount > 0 && (
        <button onClick={onSearchOpen}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors hover:bg-red-500/20"
          style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.22)", color: "#EF4444" }}>
          <AlertCircle size={11} />
          {critCount} critical
        </button>
      )}

      {/* Search */}
      <button onClick={onSearchOpen}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-white/5 text-left"
        style={{ border: "1px solid rgba(255,255,255,.06)" }}>
        <Search size={11} style={{ color: "rgba(255,255,255,.28)" }} />
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,.35)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
          Search patients
        </span>
        <kbd className="text-[9px] px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        {/* Time range */}
        <div className="flex gap-0.5">
          {(["30m","2h","8h","24h"] as const).map(r => (
            <button key={r}
              onClick={() => dispatch({ type: "SET_TIME_RANGE", range: r })}
              className="px-2.5 py-1 rounded text-[11px] transition-all cursor-pointer"
              style={{
                fontFamily: "monospace",
                background: ui.timeRange === r ? "rgba(16,185,129,.14)" : "transparent",
                color: ui.timeRange === r ? "#10B981" : "rgba(255,255,255,.28)",
                border: ui.timeRange === r ? "1px solid rgba(16,185,129,.2)" : "1px solid transparent",
              }}>
              {r}
            </button>
          ))}
        </div>

        {/* Connection + live clock */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {ui.connected ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: "#10B981", opacity: 0.6 }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#10B981" }} />
              </span>
            ) : (
              <WifiOff size={11} style={{ color: "#F59E0B" }} />
            )}
            <span className="text-[10px]" style={{ color: ui.connected ? "#10B981" : "#F59E0B", fontFamily: "monospace", letterSpacing: "0.08em" }}>
              {ui.connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <LiveClock />
        </div>

        {/* BLE Feather connect button */}
        <BLEConnect />

        {/* User */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] font-medium text-white" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>
              Ward Nurse
            </div>
            <div className="text-[9px]" style={{ color: "rgba(255,255,255,.25)", fontFamily: "monospace" }}>Admin</div>
          </div>
          <PatientAvatar initials="WN" state="normal" size={30} />
        </div>
      </div>
    </header>
  );
}

// ─── Patient panel ────────────────────────────────────────────────────────────

function PatientPanel({ patient }: { patient: Patient }) {
  const { dispatch } = useStore();
  const latest = patient.vitalsBuffer.at(-1);

  const alertIcon = {
    normal:       <CheckCircle size={13} color="#10B981" />,
    warning:      <AlertTriangle size={13} color="#F59E0B" />,
    critical:     <AlertCircle size={13} color="#EF4444" />,
    acknowledged: <Clock size={13} color="#F59E0B" />,
  }[patient.alertState];

  const alertColor = {
    normal: "#10B981", warning: "#F59E0B", critical: "#EF4444", acknowledged: "#F59E0B",
  }[patient.alertState];

  return (
    <AnimatePresence mode="wait">
      <motion.div key={patient.id}
        initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col h-full"
        style={{ borderLeft: "1px solid rgba(255,255,255,.05)", background: "rgba(4,4,7,.72)", backdropFilter: "blur(12px)" }}>

        <div className="px-4 py-3 shrink-0"
          style={{ background: "rgba(16,185,129,.03)", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div className="flex items-center gap-3 mb-3">
            <PatientAvatar initials={patient.initials} state={patient.alertState} size={42} />
            <div>
              <div className="text-[14px] font-semibold text-white" style={{ fontFamily: "var(--font-outfit,sans-serif)" }}>
                {patient.name}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {alertIcon}
                <span className="text-[10px] capitalize" style={{ color: alertColor, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {patient.alertState}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            {[
              { l: "Bed",       v: patient.bed },
              { l: "Age",       v: `${patient.age} yr` },
              { l: "Physician", v: patient.physician },
              { l: "Admitted",  v: patient.admissionDate },
            ].map(({ l, v }) => (
              <div key={l}>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,.28)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{l}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", fontFamily: "var(--font-dm-sans,sans-serif)", marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,.28)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
            Diagnosis
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
            {patient.diagnosis}
          </div>
        </div>

        {latest && (
          <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,.28)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
              Current Vitals
            </div>
            <div className="flex flex-col gap-2">
              {[
                { l: "Heart Rate",  v: latest.pulse.bpm,          decimals: 0, unit: "BPM",  c: "#10B981" },
                { l: "Resp Rate",   v: latest.respiratory.rate,   decimals: 0, unit: "/min", c: "#8B5CF6" },
                { l: "Temperature", v: latest.temperature.celsius, decimals: 1, unit: "°C",  c: "#3B82F6" },
              ].map(({ l, v, decimals, unit, c }) => (
                <div key={l} className="flex items-center justify-between">
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>{l}</span>
                  <span className="flex items-baseline gap-1">
                    <AnimatedNumber value={v} decimals={decimals}
                      className="vital-num text-[12px]" style={{ color: c }} duration={0.9} />
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: "monospace" }}>{unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-2.5" style={{ scrollbarWidth: "none" }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,.28)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Alert History
          </div>
          {patient.alertHistory.length === 0
            ? <p style={{ fontSize: 11, color: "rgba(255,255,255,.2)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>No alerts</p>
            : patient.alertHistory.slice(-6).reverse().map(evt => (
                <div key={evt.id} className="flex flex-col gap-0.5 p-2 rounded-lg mb-1.5"
                  style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.04)" }}>
                  <div className="flex items-center gap-1.5">
                    {evt.type === "critical"
                      ? <AlertCircle size={9} color="#EF4444" />
                      : evt.type === "warning"
                      ? <AlertTriangle size={9} color="#F59E0B" />
                      : <CheckCircle size={9} color="#10B981" />
                    }
                    <span style={{ fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em",
                      color: evt.type === "critical" ? "#EF4444" : evt.type === "warning" ? "#F59E0B" : "#10B981" }}>
                      {evt.type}
                    </span>
                    <span className="ml-auto" style={{ fontSize: 8, color: "rgba(255,255,255,.18)", fontFamily: "monospace" }}>
                      {new Date(evt.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                    {evt.message}
                  </p>
                </div>
              ))
          }
        </div>

        {(patient.alertState === "critical" || patient.alertState === "warning") && (
          <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <button
              onClick={() => dispatch({ type: "ACKNOWLEDGE", patientId: patient.id })}
              className="w-full py-2 rounded-xl text-[12px] font-semibold cursor-pointer transition-all active:scale-95 hover:brightness-125"
              style={{
                background: patient.alertState === "critical" ? "rgba(239,68,68,.13)" : "rgba(245,158,11,.1)",
                border: `1px solid ${patient.alertState === "critical" ? "rgba(239,68,68,.28)" : "rgba(245,158,11,.22)"}`,
                color: patient.alertState === "critical" ? "#EF4444" : "#F59E0B",
                fontFamily: "var(--font-outfit,sans-serif)",
              }}>
              Acknowledge Alert
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Vitals grid ──────────────────────────────────────────────────────────────

function VitalsGrid() {
  const { dispatch } = useStore();
  const patient = useSelectedPatient();
  const isBLE   = patient.deviceType === "ble";

  // When BLE patient is selected, subscribe to live readings and push them
  // into the store so the standard 4 cards update with real sensor data.
  useEffect(() => {
    if (!isBLE) return;
    return bleClient.onData((r) => {
      dispatch({
        type: "BLE_READING",
        reading: {
          timestamp:   Date.now(),
          pulse:       { bpm: 72, ch1: [], ch2: [] },
          respiratory: { rate: r.rr },
          temperature: { celsius: r.temperature },
        },
      });
    });
  }, [isBLE, dispatch]);

  return (
    <AnimatePresence mode="wait">
      <motion.div key={patient.id}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="flex flex-col gap-3 h-full">
        <div style={{ flex: "0 0 200px" }}>
          <PulseWaveform />
        </div>
        <div className="flex gap-3 min-h-0" style={{ flex: 1 }}>
          <div className="flex-1 min-w-0"><HeartRateTrend /></div>
          <div className="flex-1 min-w-0"><RespiratoryRate /></div>
          <div className="shrink-0" style={{ width: 190 }}><TemperatureGauge /></div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Patients view ───────────────────────────────────────────────────────────

function PatientsView({ onSelect }: { onSelect(): void }) {
  const { state, dispatch } = useStore();
  return (
    <div className="h-full overflow-auto p-1" style={{ scrollbarWidth: "none" }}>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-white" style={{ fontFamily: "var(--font-outfit,sans-serif)" }}>
          All Patients
        </h2>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>
          {state.patients.length} monitored
        </span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
        {state.patients.map((p, i) => {
          const latest = p.vitalsBuffer.at(-1);
          const ringColor = p.alertState === "critical"
            ? "rgba(239,68,68,.32)"
            : p.alertState === "warning"
              ? "rgba(245,158,11,.24)"
              : "rgba(255,255,255,.08)";
          return (
            <motion.button key={p.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 22 }}
              whileHover={{ y: -2 }}
              onClick={() => { dispatch({ type: "SELECT_PATIENT", patientId: p.id }); onSelect(); }}
              className="glass-card p-4 text-left cursor-pointer transition-colors hover:bg-white/[0.03]"
              style={{ borderColor: ringColor }}>
              <div className="flex items-center gap-2.5 mb-3">
                <PatientAvatar initials={p.initials} state={p.alertState} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-white truncate" style={{ fontFamily: "var(--font-outfit,sans-serif)" }}>{p.name}</div>
                  <div className="text-[10px] truncate" style={{ color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>
                    {p.bed} · Age {p.age}
                  </div>
                </div>
                <StatusDot state={p.alertState} />
              </div>
              {latest && (
                <div className="flex justify-between mt-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
                  {[
                    { l: "HR", v: `${Math.round(latest.pulse.bpm)}`, u: "bpm", c: "#10B981" },
                    { l: "RR", v: `${Math.round(latest.respiratory.rate)}`, u: "/min", c: "#8B5CF6" },
                    { l: "T°", v: `${latest.temperature.celsius.toFixed(1)}`, u: "°C", c: "#3B82F6" },
                  ].map(({ l, v, u, c }) => (
                    <div key={l} className="text-center">
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,.28)", fontFamily: "monospace", textTransform: "uppercase" }}>{l}</div>
                      <div className="vital-num" style={{ fontSize: 18, color: c, lineHeight: 1.1 }}>
                        {v}
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", marginLeft: 2 }}>{u}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2.5 text-[10px] truncate" style={{ color: "rgba(255,255,255,.35)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                {p.diagnosis}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Alerts view ─────────────────────────────────────────────────────────────

function AlertsView() {
  const { state, dispatch } = useStore();
  type EnrichedAlert = {
    id: string; timestamp: number; type: "warning" | "critical" | "acknowledged" | "resolved";
    vital: string; value: number; message: string;
    patientName: string; patientId: string; bed: string;
  };
  const allAlerts: EnrichedAlert[] = state.patients
    .flatMap(p => p.alertHistory.map(a => ({ ...a, patientName: p.name, patientId: p.id, bed: p.bed })))
    .sort((a, b) => b.timestamp - a.timestamp);

  const active = state.patients.filter(p => p.alertState === "critical" || p.alertState === "warning");

  return (
    <div className="h-full overflow-auto p-1" style={{ scrollbarWidth: "none" }}>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-white" style={{ fontFamily: "var(--font-outfit,sans-serif)" }}>
          Alert Log
        </h2>
        {active.length > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: "rgba(239,68,68,.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,.2)", fontFamily: "monospace" }}>
            {active.length} ACTIVE
          </span>
        )}
      </div>

      {active.length > 0 && (
        <div className="mb-5">
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Requires Attention
          </div>
          <div className="flex flex-col gap-2">
            {active.map(p => (
              <motion.div key={p.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="glass-card p-3 flex items-center gap-3"
                style={{
                  borderColor: p.alertState === "critical" ? "rgba(239,68,68,.32)" : "rgba(245,158,11,.26)",
                  animation: p.alertState === "critical" ? "alert-pulse 1.6s ease-in-out infinite" : undefined,
                }}>
                <PatientAvatar initials={p.initials} state={p.alertState} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-white" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                    {p.name} · <span style={{ color: "rgba(255,255,255,.4)", fontFamily: "monospace" }}>{p.bed}</span>
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: p.alertState === "critical" ? "#EF4444" : "#F59E0B", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {p.alertState}
                  </div>
                </div>
                <button
                  onClick={() => { dispatch({ type: "SELECT_PATIENT", patientId: p.id }); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] cursor-pointer transition-colors hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.55)", border: "1px solid rgba(255,255,255,.08)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                  View
                </button>
                <button
                  onClick={() => dispatch({ type: "ACKNOWLEDGE", patientId: p.id })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all active:scale-95 hover:brightness-125"
                  style={{
                    background: p.alertState === "critical" ? "rgba(239,68,68,.13)" : "rgba(245,158,11,.1)",
                    color: p.alertState === "critical" ? "#EF4444" : "#F59E0B",
                    border: `1px solid ${p.alertState === "critical" ? "rgba(239,68,68,.25)" : "rgba(245,158,11,.2)"}`,
                    fontFamily: "var(--font-outfit,sans-serif)",
                  }}>
                  Acknowledge
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        History
      </div>
      {allAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12" style={{ color: "rgba(255,255,255,.25)" }}>
          <CheckCircle size={28} />
          <p className="mt-2 text-[12px]" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>No alert history</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {allAlerts.map((a, i) => (
            <motion.div key={a.id}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.04)" }}>
              <div className="mt-0.5">
                {a.type === "critical"
                  ? <AlertCircle size={12} color="#EF4444" />
                  : a.type === "warning"
                  ? <AlertTriangle size={12} color="#F59E0B" />
                  : <CheckCircle size={12} color="#10B981" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium text-white" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>{a.patientName}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: "monospace" }}>{a.bed}</span>
                  <span className="ml-auto" style={{ fontSize: 9, color: "rgba(255,255,255,.25)", fontFamily: "monospace" }}>
                    {new Date(a.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,.45)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>{a.message}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Analytics view ──────────────────────────────────────────────────────────

function AnalyticsView() {
  const { state } = useStore();
  const colors = ["#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6"];
  const windowSize = 30;

  const maxLen = Math.max(...state.patients.map(p => p.vitalsBuffer.length));
  const start = Math.max(0, maxLen - windowSize);
  const data = Array.from({ length: Math.min(windowSize, maxLen) }, (_, i) => {
    const idx = start + i;
    const entry: Record<string, number | string> = { t: `-${Math.max(0, windowSize - i - 1) * 5}s` };
    state.patients.forEach(p => {
      const r = p.vitalsBuffer[idx];
      if (r) entry[p.initials] = Math.round(r.pulse.bpm);
    });
    return entry;
  });

  return (
    <div className="h-full overflow-auto p-1" style={{ scrollbarWidth: "none" }}>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-white" style={{ fontFamily: "var(--font-outfit,sans-serif)" }}>
          Analytics
        </h2>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>
          Last {windowSize * 5}s · heart rate
        </span>
      </div>

      <div className="glass-card p-4 mb-4" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace" }} tickLine={false} axisLine={false} interval={4} />
            <YAxis domain={[40, 140]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: "rgba(8,8,14,.95)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "rgba(255,255,255,.5)", fontFamily: "monospace" }}
              itemStyle={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,.55)", paddingTop: 8 }} iconType="circle" />
            {state.patients.map((p, i) => (
              <Line key={p.id} type="monotone" dataKey={p.initials} name={p.name.split(" ")[0]}
                stroke={colors[i % colors.length]} strokeWidth={1.8} dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        {state.patients.map((p, i) => {
          const latest = p.vitalsBuffer.at(-1);
          const c = colors[i % colors.length];
          return (
            <div key={p.id} className="glass-card p-3 text-center">
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, margin: "0 auto 6px", boxShadow: `0 0 6px ${c}` }} />
              <div className="text-[11px] font-medium text-white" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>{p.name.split(" ")[0]}</div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,.3)", fontFamily: "monospace", marginBottom: 4 }}>{p.bed}</div>
              <div className="vital-num" style={{ fontSize: 22, color: c, lineHeight: 1 }}>
                {latest ? Math.round(latest.pulse.bpm) : "--"}
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,.3)", fontFamily: "monospace", marginTop: 2 }}>BPM</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Search overlay ──────────────────────────────────────────────────────────

function SearchOverlay({ open, onClose }: { open: boolean; onClose(): void }) {
  const { state, dispatch } = useStore();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { clearTimeout(t); window.removeEventListener("keydown", handler); };
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const results = q.length === 0
    ? state.patients
    : state.patients.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.bed.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q) ||
        p.physician.toLowerCase().includes(q)
      );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="w-full max-w-md glass-card overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              <Search size={14} style={{ color: "rgba(255,255,255,.4)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search patients, beds, diagnoses…"
                className="flex-1 bg-transparent outline-none text-[13px] text-white placeholder-white/25"
                style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}
              />
              <kbd className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.4)", fontFamily: "monospace" }}>
                ESC
              </kbd>
            </div>
            <div className="py-1.5 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              {results.length === 0 ? (
                <p className="px-4 py-6 text-[12px] text-center" style={{ color: "rgba(255,255,255,.3)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>
                  No patients match “{query}”
                </p>
              ) : results.map(p => (
                <button key={p.id}
                  onClick={() => { dispatch({ type: "SELECT_PATIENT", patientId: p.id }); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors cursor-pointer text-left">
                  <PatientAvatar initials={p.initials} state={p.alertState} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-white truncate" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>{p.name}</div>
                    <div className="text-[10px] truncate" style={{ color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>
                      {p.bed} · {p.diagnosis}
                    </div>
                  </div>
                  <StatusDot state={p.alertState} />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Settings panel ──────────────────────────────────────────────────────────

function SettingsToggle({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  return (
    <button onClick={() => onChange(!value)} aria-pressed={value}
      className="relative rounded-full cursor-pointer transition-colors shrink-0"
      style={{
        width: 36, height: 20,
        background: value ? "rgba(16,185,129,.35)" : "rgba(255,255,255,.08)",
        border: value ? "1px solid rgba(16,185,129,.5)" : "1px solid rgba(255,255,255,.1)",
      }}>
      <motion.div animate={{ x: value ? 17 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="absolute top-[2px] rounded-full"
        style={{ width: 14, height: 14, background: value ? "#10B981" : "rgba(255,255,255,.5)", boxShadow: value ? "0 0 8px rgba(16,185,129,.7)" : undefined }} />
    </button>
  );
}

function SettingsPanel({ open, onClose }: { open: boolean; onClose(): void }) {
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(false);
  const [compact, setCompact] = useState(false);
  const [liveStream, setLiveStream] = useState(true);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const toggles = [
    { label: "Alert notifications", desc: "Show alerts for critical patients", value: notifications, set: setNotifications },
    { label: "Sound alerts",        desc: "Play audio on critical events",      value: sounds,        set: setSounds },
    { label: "Compact mode",        desc: "Reduce card padding and spacing",    value: compact,       set: setCompact },
    { label: "Live stream",         desc: "Receive vitals updates in real time", value: liveStream,    set: setLiveStream },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
            onClick={onClose} />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
            style={{ width: 340, background: "rgba(8,8,14,.96)", backdropFilter: "blur(20px)", borderLeft: "1px solid rgba(255,255,255,.07)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              <h2 className="text-[15px] font-semibold text-white" style={{ fontFamily: "var(--font-outfit,sans-serif)" }}>
                Settings
              </h2>
              <button onClick={onClose} aria-label="Close settings"
                className="p-1 rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity">
                <X size={16} color="white" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-2" style={{ scrollbarWidth: "none" }}>
              {toggles.map(({ label, desc, value, set }) => (
                <div key={label} className="flex items-center justify-between py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <div className="min-w-0 pr-4">
                    <div className="text-[12px] font-medium text-white" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>{label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,.35)", fontFamily: "var(--font-dm-sans,sans-serif)" }}>{desc}</div>
                  </div>
                  <SettingsToggle value={value} onChange={set} />
                </div>
              ))}

              <div className="py-4">
                <div className="text-[10px] mb-2" style={{ color: "rgba(255,255,255,.3)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Account
                </div>
                <div className="glass-card p-3 flex items-center gap-3">
                  <PatientAvatar initials="WN" state="normal" size={36} />
                  <div className="flex-1">
                    <div className="text-[12px] font-medium text-white" style={{ fontFamily: "var(--font-dm-sans,sans-serif)" }}>Ward Nurse</div>
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,.35)", fontFamily: "monospace" }}>admin@vigil.local</div>
                  </div>
                </div>
              </div>

              <div className="text-[9px] text-center mt-2 mb-4" style={{ color: "rgba(255,255,255,.22)", fontFamily: "monospace" }}>
                VIGIL Clinical · v0.1.0
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Dashboard shell ──────────────────────────────────────────────────────────

function DashboardShell() {
  const [collapsed, setCollapsed]   = useState(false);
  const [activeNav, setActiveNav]   = useState<NavTab>("vitals");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const patient = useSelectedPatient();

  // ⌘K / Ctrl+K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSignOut = () => {
    if (typeof window !== "undefined" &&
        window.confirm("Sign out of VIGIL Clinical?")) {
      window.location.href = "/";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", background: "#050508", overflow: "hidden" }}>
      <ShaderBackground />
      <BackgroundPaths />

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(v => !v)}
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          onSettingsClick={() => setSettingsOpen(true)}
          onSignOut={handleSignOut}
        />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <TopBar onSearchOpen={() => setSearchOpen(true)} />

          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <main style={{ flex: 1, minWidth: 0, padding: 16, overflow: "hidden" }}>
              <AnimatePresence mode="wait">
                {activeNav === "vitals" && (
                  <motion.div key="vitals" className="h-full"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}>
                    <VitalsGrid />
                  </motion.div>
                )}
                {activeNav === "patients" && (
                  <motion.div key="patients" className="h-full"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}>
                    <PatientsView onSelect={() => setActiveNav("vitals")} />
                  </motion.div>
                )}
                {activeNav === "analytics" && (
                  <motion.div key="analytics" className="h-full"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}>
                    <AnalyticsView />
                  </motion.div>
                )}
                {activeNav === "alerts" && (
                  <motion.div key="alerts" className="h-full"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}>
                    <AlertsView />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            <div style={{ width: 272, flexShrink: 0, overflow: "hidden" }}>
              <PatientPanel patient={patient} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <VitalsProvider>
      <DashboardShell />
    </VitalsProvider>
  );
}
