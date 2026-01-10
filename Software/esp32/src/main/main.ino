#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <math.h> // Needed for sqrt()

// --- CONFIGURATION ---
const char *ssid = "YOUR_WIFI_NAME";     // <--- UPDATE THIS
const char *password = "YOUR_WIFI_PASS"; // <--- UPDATE THIS
const char *mqtt_server = "broker.hivemq.com";
const char *node_id = "TRACK_SEC_42";

WiFiClient espClient;
PubSubClient client(espClient);

#define BOOT_BUTTON 0 // Built-in button on most ESP32 boards

void setup()
{
  Serial.begin(115200);
  pinMode(BOOT_BUTTON, INPUT_PULLUP);

  // 1. Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");

  // 2. Connect to MQTT
  client.setServer(mqtt_server, 1883);
}

void reconnect()
{
  while (!client.connected())
  {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("RailGuard_Node_ESP32_Unique"))
    {
      Serial.println("connected");
    }
    else
    {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void loop()
{
  if (!client.connected())
    reconnect();
  client.loop();

  // Check for User Input (Tampering Simulation)
  bool isTampering = (digitalRead(BOOT_BUTTON) == LOW);

  // --- 1. SIMULATE RAW SENSOR DATA ---
  float ax, ay, az; // Accelerometer (g)
  float gx, gy, gz; // Gyroscope (dps)
  float mx, my, mz; // Magnetometer (uT)
  float heading;

  if (isTampering)
  {
    // ⚠️ ATTACK SCENARIO: High chaotic values
    ax = random(-400, 400) / 100.0; 
    ay = random(-400, 400) / 100.0;
    az = random(-400, 400) / 100.0;

    mx = 30.0 + (random(-200, 200) / 10.0);
    my = 10.0 + (random(-200, 200) / 10.0);
    mz = -40.0 + (random(-200, 200) / 10.0);
  }
  else
  {
    // ✅ NORMAL SCENARIO: Low noise
    ax = random(-5, 5) / 100.0;
    ay = random(-5, 5) / 100.0;
    az = 1.0 + (random(-5, 5) / 100.0); // Gravity

    mx = 30.0 + (random(-2, 2) / 10.0);
    my = 10.0 + (random(-2, 2) / 10.0);
    mz = -40.0 + (random(-2, 2) / 10.0);
  }

  // --- 2. CALCULATE DERIVED FEATURES (Required for Dashboard) ---
  // We do simple math here to save the backend from doing it
  float accel_mag = sqrt(ax*ax + ay*ay + az*az);
  float mag_norm = sqrt(mx*mx + my*my + mz*mz);
  float accel_roll_rms = accel_mag * 0.707; // Approx RMS

  // --- 3. SIMULATE ENVIRONMENT ---
  float temp = 28.0 + (random(-5, 5) / 10.0);
  float hum = 60.0 + (random(-20, 20) / 10.0);
  float pressure = 1013.0 + (random(-10, 10) / 10.0);

  // --- 4. JSON PACKING ---
  // Large buffer to hold Raw Data + Derived Features + Env Data
  StaticJsonDocument<1024> doc;

  doc["node_id"] = node_id;
  doc["timestamp"] = millis();

  // A. Derived Features (For Dashboard Graphs)
  doc["accel_mag"] = accel_mag;
  doc["accel_roll_rms"] = accel_roll_rms;
  doc["mag_norm"] = mag_norm;

  // B. Raw Data (For Database "Source of Truth")
  doc["accel_x"] = ax; doc["accel_y"] = ay; doc["accel_z"] = az;
  doc["mag_x"] = mx;   doc["mag_y"] = my;   doc["mag_z"] = mz;
  
  // C. Environment & Location
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  doc["pressure"] = pressure;
  doc["latitude"] = 28.6139;
  doc["longitude"] = 77.2090;
  doc["altitude"] = 216.0;

  char buffer[1024];
  size_t n = serializeJson(doc, buffer);

  // --- PUBLISH ---
  client.publish("railway/sensor/1", buffer, n);

  // Debug Output
  Serial.print("Status: "); Serial.print(isTampering ? "TAMPERING " : "NORMAL ");
  Serial.print("| Vib Mag: "); Serial.println(accel_mag);

  delay(500); // 2Hz Update Rate
}