# Bestlink College Attendance Monitoring System (AMS)
## ESP32 Turnstile Hardware Scanner Firmware

This directory contains the production C++ microcontroller firmware for the **Bestlink College of the Philippines Attendance Monitoring System (AMS)** gate turnstile scanners.

---

## 1. Hardware Bill of Materials (BOM)

| Component | Specification / Model | Purpose |
|---|---|---|
| **Microcontroller** | ESP32 DevKit v1 (30-pin or 38-pin ESP-WROOM-32) | Core compute, HTTPS client, hardware SPI controller |
| **RFID Reader** | MFRC522 (13.56 MHz RFID / MIFARE Classic 1K) | High-speed contactless card reader |
| **Optical Indicator** | 4x LEDs (Green, Amber, Red, Blue) with 220Ω resistors | Visual feedback (<300ms) for Present, Late, Error, and Network |
| **Auditory Indicator** | 5V Piezo Buzzer (Active or Passive) | Acoustic tone feedback (Single beep, double chirp, low buzz) |
| **Power Supply** | 5V 2A Micro-USB / External 5V Buck Converter | Powers ESP32 and peripheral bus |

---

## 2. Pin Mapping Table (ESP32 DevKit v1 to RC522)

> **Important:** The MFRC522 operates strictly on **3.3V DC**. Do NOT connect VCC to 5V, as it will permanently damage the RC522 chip.

| MFRC522 Pin | ESP32 GPIO | Description |
|---|---|---|
| **VCC** | `3V3` | 3.3V Regulated Power |
| **RST** | `GPIO 22` | Reader Hardware Reset |
| **GND** | `GND` | Common Ground |
| **MISO** | `GPIO 19` | SPI Master-In, Slave-Out |
| **MOSI** | `GPIO 23` | SPI Master-Out, Slave-In |
| **SCK** | `GPIO 18` | SPI Clock |
| **SDA / SS** | `GPIO 5` | SPI Chip Select |

### Peripheral Indicators

| Component | ESP32 GPIO | Functional Role |
|---|---|---|
| **Green LED** | `GPIO 2` | Solid 500ms flash on successful On-Time check-in (`Present`) |
| **Amber LED** | `GPIO 4` | Double flash on Tardy arrival (`Late`) or Anti-Passback cooldown |
| **Red LED** | `GPIO 15` | Warning flash on unregistered card, deactivated scanner, or network error |
| **Blue LED** | `GPIO 13` | Wi-Fi status indicator (Blinks while searching, solid when connected) |
| **Buzzer (+)** | `GPIO 12` | High/low acoustic tone frequencies |

---

## 3. Optical & Acoustic Feedback Behavior

In accordance with institutional requirements, all ingress decisions provide audio-visual feedback within **<300ms**:

| Ingress Outcome | Visual LED | Audio Tone (Buzzer) | HTTP Code |
|---|---|---|---|
| **On-Time Check-In** | Green Solid (500ms) | Single High Beep (`2400Hz`, 120ms) | `200 OK` (`status: "present"`) |
| **Tardy Arrival** | Amber Strobe (600ms) | Double Chirp (`1800Hz`, 90ms each) | `200 OK` (`status: "late"`) |
| **Anti-Passback Block** | Amber Double Blink | Double Chirp (`1500Hz`, 70ms each) | `429 Too Many Requests` |
| **Card Unregistered** | Red Solid (700ms) | Low Buzz (`600Hz`, 350ms) | `404 Not Found` |
| **Offline Buffering** | Amber Pulse | Double Chirp | *Wi-Fi Drop / Cached* |

---

## 4. Software Dependencies (Arduino IDE / PlatformIO)

Install the following libraries via the Arduino IDE Library Manager or `platformio.ini`:

1. **`MFRC522`** by GithubCommunity (v1.4.10 or higher)
2. **`ArduinoJson`** by Benoit Blanchon (v6.21.3 or higher)
3. **`WiFi`** (Built-in ESP32 core)
4. **`HTTPClient`** (Built-in ESP32 core)
5. **`WiFiClientSecure`** (Built-in ESP32 core)

---

## 5. Deployment & Flashing Steps

1. Copy `config.h.example` to `config.h`:
   ```bash
   cp config.h.example config.h
   ```
2. Open `config.h` and input:
   * `WIFI_SSID` and `WIFI_PASSWORD`
   * `SUPABASE_BASE_URL` (`https://<project-ref>.supabase.co/functions/v1`)
   * `DEVICE_CODE` (`GATE-01-ESP32`)
   * `DEVICE_KEY` (`esp32_dev_secret_gate01`)
3. Connect the ESP32 to your PC via micro-USB.
4. Select board: **ESP32 Dev Module** with baud rate **115200**.
5. Compile and flash `ams_scanner.ino`.
6. Open the Serial Monitor at 115200 baud to monitor Wi-Fi connection and card taps.
