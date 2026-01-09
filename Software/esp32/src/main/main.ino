#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// Update these!
const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASS";
const char* mqtt_server = "broker.hivemq.com"; 

WiFiClient espClient;
PubSubClient client(espClient);

#define BOOT_BUTTON 0 // Built-in button on most ESP32 boards

void setup() {
  Serial.begin(115200);
  pinMode(BOOT_BUTTON, INPUT_PULLUP);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println("WiFi Connected");
  
  client.setServer(mqtt_server, 1883);
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("RailGuard_Node_01")) {
      Serial.println("MQTT Connected");
    } else {
      delay(5000);
    }
  }
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  bool isTampering = (digitalRead(BOOT_BUTTON) == LOW);
  
  // Simulation Logic
  float vibration;
  if (isTampering) {
    // TAMPERING: High spikes (3.0 to 8.0)
    vibration = random(30, 80) / 10.0;
  } else {
    // NORMAL: Low noise (0.0 to 1.5)
    vibration = random(0, 15) / 10.0;
  }

  // JSON Payload
  StaticJsonDocument<200> doc;
  doc["node_id"] = "TRACK_SEC_42";
  doc["vibration_val"] = vibration;
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);
  
  client.publish("railway/sensor/1", buffer);
  
  Serial.print("Sending: "); Serial.println(vibration);
  delay(500); // 2Hz Update Rate
}