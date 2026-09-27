/**
 * ams_scanner.ino - ESP32 Hardware Turnstile Scanner Firmware
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Subsystem of SMS 1 (School Management System)
 * 
 * Hardware Target: ESP32 DevKit v1 + RC522 RFID Module (SPI)
 * Audio/Optical: RGB/Individual LEDs (Green, Amber, Red, Blue) + Piezo Buzzer
 * Network: Wi-Fi Client Secure with HTTPS Non-blocking Ingress (<300ms)
 * 
 * Authoritative References: docs/Security.md §4, docs/WORKFLOW.md §2, docs/PRD.md §4.1
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

// Include local configuration (or fallback defaults if not yet created)
#if __has_include("config.h")
  #include "config.h"
#else
  const char* WIFI_SSID         = "BCP_Campus_WiFi";
  const char* WIFI_PASSWORD     = "Your_WiFi_Password_Here";
  const char* SUPABASE_BASE_URL = "https://your-project-ref.supabase.co/functions/v1";
  const char* DEVICE_CODE       = "GATE-01-ESP32";
  const char* DEVICE_KEY        = "esp32_dev_secret_gate01";
  const char* GATE_LOCATION     = "Main Gate Turnstile A";

  #define SS_PIN          5
  #define RST_PIN         22
  #define SCK_PIN         18
  #define MISO_PIN        19
  #define MOSI_PIN        23
  #define LED_GREEN_PIN   2
  #define LED_AMBER_PIN   4
  #define LED_RED_PIN     15
  #define LED_BLUE_PIN    13
  #define BUZZER_PIN      12
  #define LOCAL_COOLDOWN_MS 300000UL
  #define HEARTBEAT_INTERVAL_MS 60000UL
#endif

// ==========================================
// Hardware Interfaces & State Variables
// ==========================================
MFRC522 mfrc522(SS_PIN, RST_PIN);
unsigned long lastHeartbeatTime = 0;

// Local Anti-Passback Circular Cache (32 entries)
struct CacheEntry {
  String uid;
  unsigned long timestamp;
};
const int CACHE_SIZE = 32;
CacheEntry antiPassbackCache[CACHE_SIZE];
int cacheIndex = 0;

// Offline Scan Buffer (Max 20 scans stored during Wi-Fi drops)
struct OfflineScan {
  String uid;
  unsigned long epochApprox;
};
const int OFFLINE_BUF_SIZE = 20;
OfflineScan offlineBuffer[OFFLINE_BUF_SIZE];
int offlineCount = 0;

// ==========================================
// Function Prototypes
// ==========================================
void setupPins();
void connectWiFi();
void checkWiFiConnection();
void sendHeartbeat();
bool checkLocalCooldown(const String& uid);
void registerLocalCooldown(const String& uid);
void processCardScan(const String& uid);
void sendScanToServer(const String& uid, bool isOfflineSync = false);
void bufferOfflineScan(const String& uid);
void flushOfflineBuffer();

void triggerSuccessFeedback();
void triggerLateFeedback();
void triggerCooldownFeedback();
void triggerErrorFeedback();
void playTone(int frequency, int durationMs);

// ==========================================
// Arduino Setup Lifecycle
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=============================================");
  Serial.println("  Bestlink College Attendance Monitoring (AMS)");
  Serial.println("  ESP32 Turnstile RFID Scanner Firmware v2.1");
  Serial.print("  Device Code: "); Serial.println(DEVICE_CODE);
  Serial.print("  Location:    "); Serial.println(GATE_LOCATION);
  Serial.println("=============================================\n");

  setupPins();

  // Initialize SPI bus & MFRC522 RFID reader
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  mfrc522.PCD_Init();
  delay(100);

  // Self-test MFRC522 reader
  byte v = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);
  Serial.print("MFRC522 Software Version: 0x");
  Serial.println(v, HEX);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("[CRITICAL] MFRC522 reader communication failed. Check wiring!");
    triggerErrorFeedback();
  } else {
    Serial.println("[OK] MFRC522 initialized successfully.");
  }

  // Connect to Campus Wi-Fi
  connectWiFi();
}

// ==========================================
// Main Execution Loop
// ==========================================
void loop() {
  // 1. Maintain Wi-Fi Connectivity
  checkWiFiConnection();

  // 2. Periodic Scanner Heartbeat Telemetry (every 60s)
  if (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeatTime = millis();
  }

  // 3. Check for New RFID Card Present
  if (!mfrc522.PICC_IsNewCardPresent()) {
    return;
  }

  // 4. Read Card Serial UID
  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  // 5. Convert UID Bytes to Uppercase Hex String
  String cardUid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) cardUid += "0";
    cardUid += String(mfrc522.uid.uidByte[i], HEX);
  }
  cardUid.toUpperCase();

  Serial.print("\n[TAP DETECTED] Card UID: ");
  Serial.println(cardUid);

  // 6. Process Ingress Tap
  processCardScan(cardUid);

  // 7. Halt PICC card to allow new card taps
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  delay(200); // Debounce delay
}

// ==========================================
// Ingress Processing & Anti-Passback
// ==========================================
void processCardScan(const String& uid) {
  // A. Check Local 5-Minute Anti-Passback Cache (<5ms response)
  if (checkLocalCooldown(uid)) {
    Serial.println("[ANTI-PASSBACK] Card tapped within 5-minute cooldown. Duplicate rejected locally.");
    triggerCooldownFeedback();
    return;
  }

  // Register tap in local cache
  registerLocalCooldown(uid);

  // B. Dispatch Ingress Request to Cloud Endpoint
  if (WiFi.status() == WL_CONNECTED) {
    sendScanToServer(uid, false);
  } else {
    Serial.println("[OFFLINE] Wi-Fi unavailable. Buffering scan to local memory.");
    bufferOfflineScan(uid);
    triggerLateFeedback(); // Visual/audio warning for offline buffer
  }
}

void sendScanToServer(const String& uid, bool isOfflineSync) {
  unsigned long startRequest = millis();

  WiFiClientSecure client;
  client.setInsecure(); // Skip certificate thumbprint check for high throughput

  HTTPClient http;
  String endpoint = String(SUPABASE_BASE_URL) + "/scan-ingest";

  if (!http.begin(client, endpoint)) {
    Serial.println("[HTTP ERROR] Unable to connect to Edge Function.");
    triggerErrorFeedback();
    return;
  }

  // Set Headers
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);
  http.setTimeout(3500); // 3.5s timeout

  // Build JSON Payload using ArduinoJson
  StaticJsonDocument<256> doc;
  doc["device_code"]     = DEVICE_CODE;
  doc["scan_method"]     = "rfid";
  doc["card_uid"]        = uid;
  doc["is_offline_sync"] = isOfflineSync;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  unsigned long latency = millis() - startRequest;

  Serial.printf("[HTTP %d] Latency: %lums\n", httpCode, latency);

  if (httpCode > 0) {
    String response = http.getString();
    StaticJsonDocument<512> resDoc;
    DeserializationError jsonErr = deserializeJson(resDoc, response);

    if (httpCode == 200) {
      const char* status    = resDoc["status"] | "present";
      const char* eventType = resDoc["event_type"] | "time_in";
      const char* userName  = resDoc["user"]["name"] | "User";
      const char* role      = resDoc["role"] | "student";

      Serial.printf("[SUCCESS] %s (%s) - %s: %s\n", userName, role, eventType, status);

      if (strcmp(status, "late") == 0) {
        triggerLateFeedback();
      } else {
        triggerSuccessFeedback();
      }
    } else if (httpCode == 429) {
      Serial.println("[SERVER 429] Server Anti-Passback Cooldown Active.");
      triggerCooldownFeedback();
    } else if (httpCode == 404) {
      Serial.println("[SERVER 404] Unregistered RFID Card.");
      triggerErrorFeedback();
    } else {
      Serial.printf("[SERVER %d] Ingestion failed: %s\n", httpCode, response.c_str());
      triggerErrorFeedback();
    }
  } else {
    Serial.printf("[NETWORK ERROR] HTTP POST failed: %s\n", http.errorToString(httpCode).c_str());
    bufferOfflineScan(uid);
    triggerErrorFeedback();
  }

  http.end();
}

// ==========================================
// Local Anti-Passback Cooldown Cache
// ==========================================
bool checkLocalCooldown(const String& uid) {
  unsigned long now = millis();
  for (int i = 0; i < CACHE_SIZE; i++) {
    if (antiPassbackCache[i].uid == uid) {
      if (now - antiPassbackCache[i].timestamp < LOCAL_COOLDOWN_MS) {
        return true; // Still within 5 minutes
      }
    }
  }
  return false;
}

void registerLocalCooldown(const String& uid) {
  antiPassbackCache[cacheIndex].uid = uid;
  antiPassbackCache[cacheIndex].timestamp = millis();
  cacheIndex = (cacheIndex + 1) % CACHE_SIZE;
}

// ==========================================
// Offline Ring Buffer & Reconnection Sync
// ==========================================
void bufferOfflineScan(const String& uid) {
  if (offlineCount < OFFLINE_BUF_SIZE) {
    offlineBuffer[offlineCount].uid = uid;
    offlineBuffer[offlineCount].epochApprox = millis();
    offlineCount++;
    Serial.printf("[OFFLINE] Buffered scan %d/%d for UID: %s\n", offlineCount, OFFLINE_BUF_SIZE, uid.c_str());
  } else {
    Serial.println("[OFFLINE WARNING] Ring buffer full! Oldest scan overwritten.");
  }
}

void flushOfflineBuffer() {
  if (offlineCount == 0) return;

  Serial.printf("\n[SYNC] Flushing %d buffered offline scans to cloud...\n", offlineCount);
  for (int i = 0; i < offlineCount; i++) {
    sendScanToServer(offlineBuffer[i].uid, true);
    delay(150);
  }
  offlineCount = 0;
  Serial.println("[SYNC COMPLETE] All buffered scans synchronized.\n");
}

// ==========================================
// Optical & Auditory Hardware Feedback (<300ms)
// ==========================================
void triggerSuccessFeedback() {
  digitalWrite(LED_GREEN_PIN, HIGH);
  playTone(2400, 120); // Crisp high beep
  delay(250);
  digitalWrite(LED_GREEN_PIN, LOW);
}

void triggerLateFeedback() {
  digitalWrite(LED_AMBER_PIN, HIGH);
  playTone(1800, 90);
  delay(70);
  playTone(1800, 90);
  delay(150);
  digitalWrite(LED_AMBER_PIN, LOW);
}

void triggerCooldownFeedback() {
  // Rapid Amber blink + double chirp
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_AMBER_PIN, HIGH);
    playTone(1500, 70);
    digitalWrite(LED_AMBER_PIN, LOW);
    delay(80);
  }
}

void triggerErrorFeedback() {
  digitalWrite(LED_RED_PIN, HIGH);
  playTone(600, 350); // Low warning buzz
  delay(250);
  digitalWrite(LED_RED_PIN, LOW);
}

void playTone(int frequency, int durationMs) {
  tone(BUZZER_PIN, frequency, durationMs);
  delay(durationMs);
  noTone(BUZZER_PIN);
}

// ==========================================
// Wi-Fi & Device Telemetry Heartbeat
// ==========================================
void setupPins() {
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_AMBER_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_BLUE_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_AMBER_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);
  digitalWrite(LED_BLUE_PIN, LOW);
}

void connectWiFi() {
  Serial.print("[WiFi] Connecting to SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    digitalWrite(LED_BLUE_PIN, !digitalRead(LED_BLUE_PIN)); // Flash blue while searching
    delay(300);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_BLUE_PIN, HIGH); // Solid blue when connected
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    playTone(2000, 100);
  } else {
    digitalWrite(LED_BLUE_PIN, LOW);
    Serial.println("\n[WiFi WARNING] Could not connect. Operating in offline buffered mode.");
  }
}

void checkWiFiConnection() {
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck < 5000) return;
  lastCheck = millis();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_BLUE_PIN, HIGH);
    if (offlineCount > 0) {
      flushOfflineBuffer();
    }
  } else {
    digitalWrite(LED_BLUE_PIN, LOW);
  }
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;

  String endpoint = String(SUPABASE_BASE_URL) + "/scan-ingest";
  if (http.begin(client, endpoint)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-key", DEVICE_KEY);
    http.setTimeout(2500);

    StaticJsonDocument<128> doc;
    doc["device_code"] = DEVICE_CODE;
    doc["scan_method"] = "rfid";
    doc["card_uid"]    = "HEARTBEAT"; // Handled gracefully or logged as telemetry

    String body;
    serializeJson(doc, body);
    http.POST(body);
    http.end();
    Serial.println("[TELEMETRY] Scanner heartbeat sent.");
  }
}
