/**
 * VIGIL BLE Client
 * ────────────────
 * Connects to the Adafruit Feather nRF52840 Sense running vigil_feather.ino
 * via the Web Bluetooth API (supported in Chrome / Edge, not Safari).
 *
 * Uses Nordic UART Service (NUS) — the Feather sends newline-terminated JSON
 * packets on the TX characteristic which we subscribe to via notifications.
 */

// Nordic UART Service UUIDs
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // device → browser
const NUS_RX      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // browser → device

export interface FeatherReading {
  // SHT31
  temperature: number;   // °C
  humidity:    number;   // %
  // BMP280
  pressure:    number;   // hPa
  altitude:    number;   // m
  // LSM6DS33
  accelX: number; accelY: number; accelZ: number; // m/s²
  gyroX:  number; gyroY:  number; gyroZ:  number; // rad/s
  // LIS3MDL
  magX: number; magY: number; magZ: number;        // µT
  // APDS9960
  proximity: number;     // 0–255
  light:     number;     // raw clear channel
  // Derived
  rr:       number;      // respiratory rate (breaths/min)
  activity: number;      // accel magnitude minus gravity (m/s²)
}

export type BLEStatus = "idle" | "connecting" | "connected" | "disconnected" | "error" | "unsupported";

type DataCallback   = (reading: FeatherReading) => void;
type StatusCallback = (status: BLEStatus, deviceName?: string, error?: string) => void;

class BLEClient {
  private device:  BluetoothDevice | null = null;
  private server:  BluetoothRemoteGATTServer | null = null;
  private txChar:  BluetoothRemoteGATTCharacteristic | null = null;
  private rxChar:  BluetoothRemoteGATTCharacteristic | null = null;
  private lineBuf  = "";

  private dataCbs:   DataCallback[]   = [];
  private statusCbs: StatusCallback[] = [];

  status: BLEStatus = "idle";
  deviceName = "";

  // ── Subscribe / unsubscribe ────────────────────────────────────────────
  onData(cb: DataCallback):     () => void {
    this.dataCbs.push(cb);
    return () => { this.dataCbs = this.dataCbs.filter(x => x !== cb); };
  }
  onStatus(cb: StatusCallback): () => void {
    this.statusCbs.push(cb);
    return () => { this.statusCbs = this.statusCbs.filter(x => x !== cb); };
  }

  private emit(status: BLEStatus, name?: string, err?: string) {
    this.status = status;
    if (name) this.deviceName = name;
    this.statusCbs.forEach(cb => cb(status, this.deviceName, err));
  }

  // ── Connect ────────────────────────────────────────────────────────────
  async connect(): Promise<void> {
    // Safari / Firefox guard
    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      this.emit("unsupported");
      throw new Error(
        "Web Bluetooth is not supported in this browser. " +
        "Please use Chrome or Edge on desktop."
      );
    }

    try {
      this.emit("connecting");

      this.device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { name: "VIGIL-Feather" },
          { services: [NUS_SERVICE] },
        ],
        optionalServices: [NUS_SERVICE],
      });

      this.device!.addEventListener("gattserverdisconnected", () => {
        this.emit("disconnected");
        this.cleanup();
      });

      this.server  = await this.device!.gatt!.connect();
      const svc    = await this.server.getPrimaryService(NUS_SERVICE);
      this.txChar  = await svc.getCharacteristic(NUS_TX);

      try {
        this.rxChar = await svc.getCharacteristic(NUS_RX);
      } catch {
        // RX not strictly needed for receive-only mode
      }

      this.txChar.addEventListener("characteristicvaluechanged", this.handleNotification);
      await this.txChar.startNotifications();

      this.emit("connected", this.device!.name ?? "VIGIL-Feather");
    } catch (err: any) {
      // User cancelled the picker — treat as idle, not error
      if (err?.name === "NotFoundError") {
        this.emit("idle");
      } else {
        this.emit("error", undefined, err?.message ?? String(err));
      }
      throw err;
    }
  }

  // ── Disconnect ─────────────────────────────────────────────────────────
  async disconnect(): Promise<void> {
    try {
      await this.txChar?.stopNotifications();
    } catch {}
    this.server?.disconnect();
    this.cleanup();
    this.emit("idle");
  }

  // ── Send a command back to the device (optional) ───────────────────────
  async send(text: string): Promise<void> {
    if (!this.rxChar) return;
    const enc = new TextEncoder().encode(text + "\n");
    await this.rxChar.writeValueWithoutResponse(enc);
  }

  // ── Notification handler ───────────────────────────────────────────────
  private handleNotification = (evt: Event) => {
    const char  = evt.target as BluetoothRemoteGATTCharacteristic;
    const chunk = new TextDecoder().decode(char.value!);
    this.lineBuf += chunk;

    const lines = this.lineBuf.split("\n");
    this.lineBuf = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const raw = JSON.parse(trimmed);
        const reading: FeatherReading = {
          temperature: raw.t    ?? 25,
          humidity:    raw.h    ?? 50,
          pressure:    raw.p    ?? 1013,
          altitude:    raw.alt  ?? 0,
          accelX:      raw.ax   ?? 0,
          accelY:      raw.ay   ?? 0,
          accelZ:      raw.az   ?? 9.8,
          gyroX:       raw.gx   ?? 0,
          gyroY:       raw.gy   ?? 0,
          gyroZ:       raw.gz   ?? 0,
          magX:        raw.mx   ?? 0,
          magY:        raw.my   ?? 0,
          magZ:        raw.mz   ?? 0,
          proximity:   raw.prox ?? 0,
          light:       raw.light ?? 0,
          rr:          raw.rr   ?? 16,
          activity:    raw.act  ?? 0,
        };
        this.dataCbs.forEach(cb => cb(reading));
      } catch {
        // Malformed packet — skip silently
      }
    }
  };

  private cleanup() {
    this.txChar  = null;
    this.rxChar  = null;
    this.server  = null;
  }

  get isConnected(): boolean {
    return this.server?.connected ?? false;
  }
}

// Singleton — one BLE connection for the whole app
export const bleClient = new BLEClient();
