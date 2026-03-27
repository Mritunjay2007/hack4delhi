#include <WiFi.h>
#include <PubSubClient.h>

// ===============================
// NETWORK CONFIGURATION
// ===============================
const char* ssid = "OnePlusNord3";
const char* password = "hp97omltp";
const char* mqtt_server = "broker.hivemq.com";
const char* train_id = "EXPRESS-101";

WiFiClient espClient;
PubSubClient client(espClient);

// The physical "BOOT" button on the ESP32 is hardwired to GPIO 0
#define BUTTON_PIN 0 
bool lastButtonState = HIGH;

void setup() {
  Serial.begin(115200);
  delay(2000); // Wait for power to stabilize

  // Setup the physical BOOT button
  pinMode(BUTTON_PIN, INPUT_PULLUP); 

  Serial.println("\n🚆 ESP32 Train Impersonator Booting Up...");

  // --- THE WAKE-UP & POWER SPIKE FIX FOR ESP32 ---
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_8_5dBm); // Prevent USB crash from power spike
  delay(1000); 

  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  // Add a timeout so it doesn't loop forever silently
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    // REMOVED: Do not restore power to 19.5dBm. 
    // Leave it at 8.5dBm permanently so the MQTT transmission doesn't crash the board.
    
    Serial.println("\n✅ WiFi Connected");
    client.setServer(mqtt_server, 1883);
    
    delay(500); // Give the power supply half a second to stabilize before MQTT
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting to V2X Network...");
    Serial.println();
    
    // Generate a random client ID to avoid network collisions
    String clientId = "ESP32Train-";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
    } else {
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  // Read the physical BOOT button on the ESP32
  bool currentButtonState = digitalRead(BUTTON_PIN);

  // If button is pressed (LOW) and it wasn't pressed before
  if (currentButtonState == LOW && lastButtonState == HIGH) {
    Serial.println("📡 Broadcast: TRAIN APPROACHING!");
    
    // Broadcast presence to the Track network
    client.publish("railguard/v2x/train_presence", "APPROACHING");
    
    delay(500); // Debounce delay so it doesn't trigger 10 times in one press
  }

  lastButtonState = currentButtonState;
  delay(50); // Small loop delay for stability
}