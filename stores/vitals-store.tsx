"use client";

import React, {
  createContext, useContext, useReducer, useEffect, useRef,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertState = "normal" | "warning" | "critical" | "acknowledged";

export interface VitalReading {
  timestamp: number;
  pulse: { ch1: number[]; ch2: number[]; bpm: number };
  respiratory: { rate: number };
  temperature: { celsius: number };
}

export interface AlertEvent {
  id: string;
  timestamp: number;
  type: "warning" | "critical" | "acknowledged" | "resolved";
  vital: string;
  value: number;
  message: string;
}

export interface Patient {
  id: string;
  name: string;
  bed: string;
  age: number;
  diagnosis: string;
  admissionDate: string;
  physician: string;
  initials: string;
  alertState: AlertState;
  vitalsBuffer: VitalReading[];
  alertHistory: AlertEvent[];
}

export interface UIState {
  selectedPatientId: string;
  sidebarCollapsed: boolean;
  connected: boolean;
  timeRange: "30m" | "2h" | "8h" | "24h";
}

export interface StoreState {
  patients: Patient[];
  ui: UIState;
}

// ─── Waveform generator ───────────────────────────────────────────────────────

function ecgSample(t: number): number {
  const phase = t % (2 * Math.PI);
  const p = Math.exp(-Math.pow(phase - 0.4, 2) / 0.025) * 0.18;
  const q = -Math.exp(-Math.pow(phase - 0.62, 2) / 0.004) * 0.22;
  const r = Math.exp(-Math.pow(phase - 0.7, 2) / 0.002) * 1.0;
  const s = -Math.exp(-Math.pow(phase - 0.78, 2) / 0.003) * 0.18;
  const twave = Math.exp(-Math.pow(phase - 1.1, 2) / 0.06) * 0.28;
  return p + q + r + s + twave + (Math.random() - 0.5) * 0.018;
}

function makePulseBuffer(bpm: number, n = 200): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 * 2.5;
    return ecgSample(t);
  });
}

// ─── Initial patients ─────────────────────────────────────────────────────────

function makeBuffer(bpm: number, rr: number, temp: number, count = 60): VitalReading[] {
  // Pulse waveform is now generated continuously in the canvas component,
  // so ch1/ch2 are left empty here to keep memory light.
  return Array.from({ length: count }, (_, i) => ({
    timestamp: Date.now() - (count - i) * 1000,
    pulse: {
      bpm: bpm + Math.sin(i * 0.25) * 3 + (Math.random() - 0.5) * 1.2,
      ch1: [],
      ch2: [],
    },
    respiratory: { rate: rr + Math.sin(i * 0.18) * 1.2 + (Math.random() - 0.5) * 0.4 },
    temperature: { celsius: temp + Math.sin(i * 0.12) * 0.08 + (Math.random() - 0.5) * 0.03 },
  }));
}

const PATIENTS: Patient[] = [
  {
    id: "bed-4", name: "Sophia Hayes", bed: "Bed 4", age: 67,
    diagnosis: "Post-op cardiac monitoring", admissionDate: "2026-04-14",
    physician: "Dr. A. Patel", initials: "SH", alertState: "normal",
    vitalsBuffer: makeBuffer(72, 16, 36.8), alertHistory: [],
  },
  {
    id: "bed-7", name: "Owen Darnell", bed: "Bed 7", age: 54,
    diagnosis: "Pneumonia — observation", admissionDate: "2026-04-15",
    physician: "Dr. M. Chen", initials: "OD", alertState: "warning",
    vitalsBuffer: makeBuffer(103, 22, 37.5),
    alertHistory: [{
      id: "a1", timestamp: Date.now() - 180000, type: "warning",
      vital: "Respiratory Rate", value: 22, message: "RR elevated above 20/min",
    }],
  },
  {
    id: "bed-11", name: "Emma Larkin", bed: "Bed 11", age: 73,
    diagnosis: "Sepsis — recovery", admissionDate: "2026-04-12",
    physician: "Dr. A. Patel", initials: "EL", alertState: "critical",
    vitalsBuffer: makeBuffer(122, 27, 38.8),
    alertHistory: [
      { id: "a2", timestamp: Date.now() - 600000, type: "warning", vital: "Heart Rate", value: 108, message: "HR above 100 BPM" },
      { id: "a3", timestamp: Date.now() - 300000, type: "critical", vital: "Heart Rate", value: 122, message: "HR above 120 BPM — critical" },
    ],
  },
  {
    id: "bed-2", name: "Liam Grayson", bed: "Bed 2", age: 45,
    diagnosis: "Hypertensive crisis", admissionDate: "2026-04-16",
    physician: "Dr. S. Williams", initials: "LG", alertState: "normal",
    vitalsBuffer: makeBuffer(88, 15, 36.9), alertHistory: [],
  },
  {
    id: "bed-9", name: "Mia Jennings", bed: "Bed 9", age: 61,
    diagnosis: "COPD exacerbation", admissionDate: "2026-04-13",
    physician: "Dr. M. Chen", initials: "MJ", alertState: "normal",
    vitalsBuffer: makeBuffer(76, 18, 37.1), alertHistory: [],
  },
];

// ─── Alert thresholds ─────────────────────────────────────────────────────────

function computeAlert(r: VitalReading): "normal" | "warning" | "critical" {
  const bpm = r.pulse.bpm;
  const rr = r.respiratory.rate;
  const c = r.temperature.celsius;
  if (bpm > 120 || bpm < 50 || rr > 25 || rr < 10 || c > 38.5 || c < 35.5) return "critical";
  if (bpm > 100 || bpm < 60 || rr > 20 || rr < 12 || c > 37.3 || c < 36.1) return "warning";
  return "normal";
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: "VITAL_UPDATE"; patientId: string; reading: VitalReading }
  | { type: "SELECT_PATIENT"; patientId: string }
  | { type: "ACKNOWLEDGE"; patientId: string }
  | { type: "SET_TIME_RANGE"; range: UIState["timeRange"] }
  | { type: "TOGGLE_SIDEBAR" };

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "VITAL_UPDATE": {
      const newLevel = computeAlert(action.reading);
      return {
        ...state,
        patients: state.patients.map((p) => {
          if (p.id !== action.patientId) return p;
          const buf = [...p.vitalsBuffer, action.reading].slice(-120);
          const prevLevel = p.alertState;
          const alertState: AlertState =
            prevLevel === "acknowledged" ? "acknowledged" : newLevel;
          let alertHistory = p.alertHistory;
          if (newLevel !== "normal" && prevLevel === "normal") {
            alertHistory = [...alertHistory, {
              id: `${Date.now()}-${p.id}`,
              timestamp: Date.now(),
              type: newLevel,
              vital: "Vitals",
              value: Math.round(action.reading.pulse.bpm),
              message: `${newLevel === "critical" ? "Critical" : "Warning"}: vitals outside normal range`,
            }];
          }
          return { ...p, vitalsBuffer: buf, alertState, alertHistory };
        }),
      };
    }
    case "SELECT_PATIENT":
      return { ...state, ui: { ...state.ui, selectedPatientId: action.patientId } };
    case "ACKNOWLEDGE":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId ? { ...p, alertState: "acknowledged" } : p
        ),
      };
    case "SET_TIME_RANGE":
      return { ...state, ui: { ...state.ui, timeRange: action.range } };
    case "TOGGLE_SIDEBAR":
      return { ...state, ui: { ...state.ui, sidebarCollapsed: !state.ui.sidebarCollapsed } };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<{ state: StoreState; dispatch: React.Dispatch<Action> } | null>(null);

const INIT: StoreState = {
  patients: PATIENTS,
  ui: { selectedPatientId: PATIENTS[0].id, sidebarCollapsed: false, connected: true, timeRange: "30m" },
};

export function VitalsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INIT);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    // Fast tick: every 1s, push a fresh reading for every patient. With ~1 Hz
    // updates, numeric readouts drift visibly, the trend chart scrolls like
    // live telemetry, respiratory bars slide, and the temperature gauge
    // springs smoothly toward each new value.
    const iv = setInterval(() => {
      PATIENTS.forEach((p) => {
        const last = stateRef.current.patients.find((x) => x.id === p.id)?.vitalsBuffer.at(-1);
        // Mean-reverting random walk toward patient's baseline so alert
        // states persist without the numbers running off to infinity.
        const baseBpm  = p.alertState === "critical" ? 122 : p.alertState === "warning" ? 103 : last?.pulse.bpm ?? 75;
        const baseRr   = p.alertState === "critical" ? 27  : p.alertState === "warning" ? 22  : last?.respiratory.rate ?? 16;
        const baseTemp = p.alertState === "critical" ? 38.8 : p.alertState === "warning" ? 37.5 : last?.temperature.celsius ?? 36.8;

        const lastBpm  = last?.pulse.bpm ?? baseBpm;
        const lastRr   = last?.respiratory.rate ?? baseRr;
        const lastTemp = last?.temperature.celsius ?? baseTemp;

        // drift = small pull toward baseline + random jitter
        const bpm     = Math.max(40, Math.min(145, lastBpm + (baseBpm - lastBpm) * 0.05 + (Math.random() - 0.5) * 2.4));
        const rr      = Math.max(8,  Math.min(32,  lastRr  + (baseRr  - lastRr)  * 0.08 + (Math.random() - 0.5) * 0.7));
        const celsius = Math.max(34, Math.min(40,  lastTemp + (baseTemp - lastTemp) * 0.05 + (Math.random() - 0.5) * 0.08));

        dispatch({
          type: "VITAL_UPDATE",
          patientId: p.id,
          reading: {
            timestamp: Date.now(),
            pulse: { bpm, ch1: [], ch2: [] }, // waveform samples generated locally in canvas
            respiratory: { rate: rr },
            temperature: { celsius },
          },
        });
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be inside VitalsProvider");
  return ctx;
}

export function useSelectedPatient(): Patient {
  const { state } = useStore();
  return state.patients.find((p) => p.id === state.ui.selectedPatientId) ?? state.patients[0];
}
