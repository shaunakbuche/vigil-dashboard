/**
 * VIGIL Dashboard — Adafruit Feather nRF52840 Sense Firmware
 * ============================================================
 * Reads all onboard sensors and streams JSON over BLE UART (Nordic
 * UART Service) so the VIGIL web dashboard can receive live data
 * via the Web Bluetooth API in Chrome/Edge.
 *
 * SENSORS USED:
 *   SHT31-D   → Temperature (°C) + Humidity (%)
 *   BMP280    → Barometric Pressure (hPa) + Altitude (m)
 *   LSM6DS33  → 3-axis Accelerometer (m/s²) + Gyroscope (rad/s)
 *   LIS3MDL   → 3-axis Magnetometer (µT)
 *   APDS9960  → Proximity (0-255) + Ambient Light (lux)
 *
 * REQUIRED ARDUINO LIBRARIES (install via Library Manager):
 *   • Adafruit nRF52 (board BSP — includes bluefruit.h)
 *   • Adafruit SHT31 Library
 *   • Adafruit BMP280 Library
 *   • Adafruit LSM6DS Library
 *   • Adafruit LIS3MDL Library
 *   • Adafruit APDS9960 Library
 *   • Adafruit Unified Sensor
 *
 * BOARD SETUP:
 *   Tools → Board → Adafruit nRF52 Boards → Adafruit Feather nRF52840 Sense
 *   Tools → Softdevice → S140 6.x.x
 *
 * OUTPUT FORMAT (sent over BLE UART every 100 ms):
 *   {"t":36.8,"h":52.1,"p":1013.2,"alt":12.3,
 *    "ax":0.12,"ay":-0.03,"az":9.81,
 *    "gx":0.001,"gy":0.002,"gz":0.000,
 *    "mx":23.1,"my":-8.4,"mz":41.2,
 *    "prox":18,"light":320,"rr":15.2,"act":0.14}
 */

#include <bluefruit.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_LSM6DS33.h>
#include <Adafruit_LIS3MDL.h>
#include <Adafruit_APDS9960.h>
#include <Adafruit_NeoPixel.h>

// ── BLE Nordic UART Service ────────────────────────────────────────────────
BLEUart bleuart;

// ── Sensors ────────────────────────────────────────────────────────────────
Adafruit_SHT31    sht31;
Adafruit_BMP280   bmp280;
Adafruit_LSM6DS33 lsm6ds33;
Adafruit_LIS3MDL  lis3mdl;
Adafruit_APDS9960 apds9960;
Adafruit_NeoPixel pixel(1, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);

// ── Respiratory rate estimation ────────────────────────────────────────────
// We track the Z-axis acceleration over time and count zero-crossings to
// estimate breathing frequency. On a chest-worn or head-worn device, slow
// rhythmic Z-axis movement corresponds to the breathing cycle.
#define RR_WINDOW   300   // samples (30 s at 10 Hz)
float  rrBuf[RR_WINDOW];
int    rrHead   = 0;
float  rrPrev   = 0;
int    rrCross  = 0;       // zero-crossing count
float  rrEst    = 16.0;   // initial estimate (breaths/min)
unsigned long lastRRCalc = 0;

// ── Activity level ─────────────────────────────────────────────────────────
float actSmooth = 0.0;

// ── SHT31 state (for auto-reinit if sensor flakes out) ─────────────────────
bool  sht31Ok    = false;
float lastTempC  = NAN;
float lastHum    = NAN;
unsigned long lastShtRetry = 0;

// ── Connection LED colours ─────────────────────────────────────────────────
void setPixel(uint8_t r, uint8_t g, uint8_t b) {
  pixel.setPixelColor(0, pixel.Color(r, g, b));
  pixel.show();
}

// ── BLE callbacks ──────────────────────────────────────────────────────────
void connectCallback(uint16_t handle) {
  setPixel(0, 40, 0); // green = connected
  Serial.println("BLE connected");
}

void disconnectCallback(uint16_t handle, uint8_t reason) {
  setPixel(0, 0, 40); // blue = advertising
  Serial.print("BLE disconnected, reason=0x");
  Serial.println(reason, HEX);
}

// ── Setup ──────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // NeoPixel
  pixel.begin();
  pixel.setBrightness(30);
  setPixel(40, 0, 40); // purple = booting

  // I2C sensors
  Wire.begin();

  sht31Ok = sht31.begin(0x44);
  if (!sht31Ok) {
    Serial.println("SHT31 not found at boot — will retry in loop");
  } else {
    Serial.println("SHT31 OK");
  }
  if (!bmp280.begin()) {
    Serial.println("BMP280 not found!");
  }
  if (!lsm6ds33.begin_I2C()) {
    Serial.println("LSM6DS33 not found!");
  }
  if (!lis3mdl.begin_I2C()) {
    Serial.println("LIS3MDL not found!");
  }
  if (!apds9960.begin()) {
    Serial.println("APDS9960 not found!");
  }

  // Configure sensors
  bmp280.setSampling(Adafruit_BMP280::MODE_NORMAL,
                     Adafruit_BMP280::SAMPLING_X2,
                     Adafruit_BMP280::SAMPLING_X16,
                     Adafruit_BMP280::FILTER_X16,
                     Adafruit_BMP280::STANDBY_MS_500);

  lsm6ds33.setAccelRange(LSM6DS_ACCEL_RANGE_4_G);
  lsm6ds33.setGyroRange(LSM6DS_GYRO_RANGE_250_DPS);
  lsm6ds33.setAccelDataRate(LSM6DS_RATE_104_HZ);
  lsm6ds33.setGyroDataRate(LSM6DS_RATE_104_HZ);

  apds9960.enableProximity(true);
  apds9960.enableColor(true);
  apds9960.setProxGain(APDS9960_PGAIN_4X);

  // Init RR buffer
  for (int i = 0; i < RR_WINDOW; i++) rrBuf[i] = 0;

  // ── BLE ────────────────────────────────────────────────────────────────
  Bluefruit.begin();
  Bluefruit.setName("VIGIL-Feather");
  Bluefruit.setTxPower(4); // max range
  Bluefruit.Periph.setConnectCallback(connectCallback);
  Bluefruit.Periph.setDisconnectCallback(disconnectCallback);

  // Nordic UART Service
  bleuart.begin();

  // Advertising
  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244); // fast then slow
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);

  setPixel(0, 0, 40); // blue = advertising
  Serial.println("VIGIL Feather ready — advertising as VIGIL-Feather");
}

// ── Respiratory rate from zero-crossings ───────────────────────────────────
void updateRR(float az) {
  // High-pass filter to remove gravity offset
  float hp = az - 9.75; // subtract ~1g

  // Store in rolling buffer
  rrBuf[rrHead] = hp;
  rrHead = (rrHead + 1) % RR_WINDOW;

  // Count zero-crossings in the buffer every 10 s
  unsigned long now = millis();
  if (now - lastRRCalc >= 10000) {
    lastRRCalc = now;
    int crosses = 0;
    float prev = rrBuf[0];
    for (int i = 1; i < RR_WINDOW; i++) {
      if ((prev < 0 && rrBuf[i] >= 0) || (prev >= 0 && rrBuf[i] < 0)) {
        crosses++;
      }
      prev = rrBuf[i];
    }
    // Each breath = 2 crossings; window is 30 s → multiply by 2 for /min
    float raw = (crosses / 2.0f) * (60.0f / 30.0f);
    // Clamp to physiological range and smooth
    raw = constrain(raw, 8.0f, 35.0f);
    rrEst = rrEst * 0.7f + raw * 0.3f; // exponential smoothing
  }
}

// ── Main loop (10 Hz = 100 ms) ─────────────────────────────────────────────
void loop() {
  delay(100);

  // ── Read SHT31 (with auto-reinit on failure) ─────────────────────────
  float tempC    = NAN;
  float humidity = NAN;
  if (sht31Ok) {
    tempC    = sht31.readTemperature();
    humidity = sht31.readHumidity();
  }
  // If reads are failing, retry begin() once per second
  if ((isnan(tempC) || isnan(humidity)) && (millis() - lastShtRetry > 1000)) {
    lastShtRetry = millis();
    sht31Ok = sht31.begin(0x44);
    if (sht31Ok) {
      tempC    = sht31.readTemperature();
      humidity = sht31.readHumidity();
      Serial.println("SHT31 re-initialized");
    }
  }
  // Hold last good value instead of a hard 25/50 fallback so it's obvious
  // if the sensor truly never comes up.
  if (!isnan(tempC))    lastTempC = tempC;
  if (!isnan(humidity)) lastHum   = humidity;
  if (isnan(tempC))    tempC    = isnan(lastTempC) ? -99.0 : lastTempC;
  if (isnan(humidity)) humidity = isnan(lastHum)   ? -99.0 : lastHum;

  // ── Read BMP280 ───────────────────────────────────────────────────────
  float pressureHpa = bmp280.readPressure() / 100.0;
  float altitudeM   = bmp280.readAltitude(1013.25);

  // ── Read LSM6DS33 ─────────────────────────────────────────────────────
  sensors_event_t accelEv, gyroEv, tempEv;
  lsm6ds33.getEvent(&accelEv, &gyroEv, &tempEv);
  float ax = accelEv.acceleration.x;
  float ay = accelEv.acceleration.y;
  float az = accelEv.acceleration.z;
  float gx = gyroEv.gyro.x;
  float gy = gyroEv.gyro.y;
  float gz = gyroEv.gyro.z;

  // Activity = magnitude of accel minus gravity, smoothed
  float accelMag = sqrt(ax*ax + ay*ay + az*az) - 9.75;
  accelMag = abs(accelMag);
  actSmooth = actSmooth * 0.85 + accelMag * 0.15;

  // Update respiratory rate estimate
  updateRR(az);

  // ── Read LIS3MDL ──────────────────────────────────────────────────────
  lis3mdl.read();
  float mx = lis3mdl.x_gauss * 100.0; // convert to µT
  float my = lis3mdl.y_gauss * 100.0;
  float mz = lis3mdl.z_gauss * 100.0;

  // ── Read APDS9960 ─────────────────────────────────────────────────────
  uint8_t  proximity = apds9960.readProximity();
  uint16_t r, g, b, c;
  if (apds9960.colorDataReady()) {
    apds9960.getColorData(&r, &g, &b, &c);
  } else {
    c = 0;
  }

  // ── Status LED pulse when connected ───────────────────────────────────
  if (Bluefruit.connected()) {
    static bool ledOn = false;
    ledOn = !ledOn;
    setPixel(ledOn ? 0 : 0, ledOn ? 60 : 10, 0);
  }

  // ── Format and send JSON over BLE UART ───────────────────────────────
  if (Bluefruit.connected()) {
    char buf[320];
    snprintf(buf, sizeof(buf),
      "{\"t\":%.1f,\"h\":%.1f,\"p\":%.1f,\"alt\":%.1f,"
      "\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,"
      "\"gx\":%.4f,\"gy\":%.4f,\"gz\":%.4f,"
      "\"mx\":%.1f,\"my\":%.1f,\"mz\":%.1f,"
      "\"prox\":%d,\"light\":%d,\"rr\":%.1f,\"act\":%.3f}\n",
      tempC, humidity, pressureHpa, altitudeM,
      ax, ay, az,
      gx, gy, gz,
      mx, my, mz,
      proximity, (int)c,
      rrEst, actSmooth
    );

    bleuart.print(buf);

    // Also mirror to Serial for debugging
    Serial.print(buf);
  }
}
