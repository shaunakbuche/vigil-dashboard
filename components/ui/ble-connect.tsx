"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bluetooth, BluetoothOff, BluetoothSearching, X } from "lucide-react";
import { bleClient, type BLEStatus } from "@/lib/ble-client";

interface BLEConnectProps {
  /** Called with every parsed sensor packet */
  onReading?: Parameters<typeof bleClient.onData>[0];
}

export function BLEConnect({ onReading }: BLEConnectProps) {
  const [status, setStatus]     = useState<BLEStatus>("idle");
  const [deviceName, setName]   = useState("");
  const [error, setError]       = useState("");
  const [showError, setShowErr] = useState(false);

  // Subscribe to BLE status + data
  useEffect(() => {
    const unsub = bleClient.onStatus((s, name, err) => {
      setStatus(s);
      if (name) setName(name);
      if (err)  { setError(err); setShowErr(true); }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!onReading) return;
    return bleClient.onData(onReading);
  }, [onReading]);

  const connect = useCallback(async () => {
    setShowErr(false);
    try { await bleClient.connect(); }
    catch { /* status callback handles UI */ }
  }, []);

  const disconnect = useCallback(async () => {
    await bleClient.disconnect();
    setName("");
  }, []);

  // ── Colours per state ────────────────────────────────────────────────
  const col = {
    idle:        { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)", text: "rgba(255,255,255,0.45)", icon: "rgba(255,255,255,0.3)" },
    connecting:  { bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.30)",  text: "#3B82F6",               icon: "#3B82F6" },
    connected:   { bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.30)",  text: "#10B981",               icon: "#10B981" },
    disconnected:{ bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)",  text: "#F59E0B",               icon: "#F59E0B" },
    error:       { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   text: "#EF4444",               icon: "#EF4444" },
    unsupported: { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   text: "#EF4444",               icon: "#EF4444" },
  }[status];

  const Icon =
    status === "connected"  ? Bluetooth :
    status === "connecting" ? BluetoothSearching :
    BluetoothOff;

  const label =
    status === "connected"   ? deviceName || "Feather Connected" :
    status === "connecting"  ? "Scanning…" :
    status === "unsupported" ? "BLE Unsupported" :
    status === "error"       ? "BLE Error" :
    status === "disconnected"? "Reconnect" :
    "Connect Feather";

  return (
    <div className="relative">
      <motion.button
        onClick={status === "connected" ? disconnect : connect}
        disabled={status === "connecting" || status === "unsupported"}
        whileHover={{ scale: status === "connecting" ? 1 : 1.04 }}
        whileTap={{ scale: 0.96 }}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "6px 12px", borderRadius: 100,
          border: `1px solid ${col.border}`,
          background: col.bg,
          cursor: status === "connecting" || status === "unsupported"
            ? "not-allowed" : "pointer",
          color: col.text,
          fontSize: 11, fontFamily: "monospace",
          letterSpacing: "0.06em", fontWeight: 600,
          whiteSpace: "nowrap",
          transition: "all 0.2s",
        }}>

        {/* Spinning ring when searching */}
        {status === "connecting" ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            style={{ width: 12, height: 12, borderRadius: "50%",
              border: `1.5px solid ${col.border}`, borderTopColor: col.icon }} />
        ) : (
          <>
            {status === "connected" && (
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full animate-ping"
                  style={{ background: "#10B981", opacity: 0.6 }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: "#10B981" }} />
              </span>
            )}
            <Icon size={12} color={col.icon} />
          </>
        )}

        <span>{label}</span>

        {/* Disconnect × when connected */}
        {status === "connected" && (
          <span style={{ marginLeft: 2, opacity: 0.5, lineHeight: 1 }}>×</span>
        )}
      </motion.button>

      {/* Error tooltip */}
      <AnimatePresence>
        {showError && error && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "rgba(5,5,8,0.96)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 11, color: "#EF4444",
              fontFamily: "monospace", maxWidth: 280,
              zIndex: 100, whiteSpace: "normal", lineHeight: 1.5,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}>
            <div className="flex items-start gap-2">
              <span style={{ flex: 1 }}>{error}</span>
              <button onClick={() => setShowErr(false)}
                style={{ color: "rgba(255,255,255,0.3)", background: "none",
                  border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>
                <X size={11} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
