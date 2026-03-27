#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <driver/i2s.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <QMC5883LCompass.h>
#include <math.h> 

// ===============================
// 1. NETWORK CONFIGURATION
// ===============================
const char* ssid = "OnePlusNord3";
const char* password = "hp97omltp";
// const char* ssid = "Server";
// const char* password = "1@23.qpalzm.";
// const char* mqtt_server = "test.mosquitto.org";
const char* mqtt_server = "broker.hivemq.com";
const char* node_id = "TEST-TRACK-01";

WiFiClient espClient;
PubSubClient client(espClient);

// ===============================
// 2. SENSOR PINS & OBJECTS
// ===============================

// I2C PINS (ADXL345 & QMC5883L)
#define SDA_PIN 21
#define SCL_PIN 22

// I2S MIC PINS (INMP441)
#define I2S_WS   26
#define I2S_SD   34
#define I2S_SCK  25
#define I2S_PORT I2S_NUM_0

// TILT SENSOR (Digital)
#define TILT_PIN 35 

// OBJECTS
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);
QMC5883LCompass compass;

// ===============================
// --- NEW: V2X TRAIN PASSING STATE ---
// ===============================
unsigned long lastTrainPassTime = 0;
bool isTrainPassing = false;
const unsigned long TRAIN_COOLDOWN_MS = 15000; // Ignore anomalies for 15 seconds

// ===============================
// 3. I2S CONFIGURATION
// ===============================
void initINMP441() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000, 
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S_MSB,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT);
}

// ===============================
// --- NEW: MQTT CALLBACK LISTENER ---
// ===============================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  
  if (String(topic) == "railguard/v2x/train_presence") {
    if (msg == "APPROACHING") {
      isTrainPassing = true;
      lastTrainPassTime = millis();
      Serial.println("\n🚆 [V2X RADIO] TRAIN DETECTED! Suppressing physical alerts for 15 seconds...\n");
    }
  }
}

// ===============================
// 4. SETUP
// ===============================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(SDA_PIN, SCL_PIN);
  pinMode(TILT_PIN, INPUT); 

  Serial.println("Initializing Sensors...");

  if (!accel.begin()) {
    Serial.println("❌ ADXL345 Error");
  }
  accel.setRange(ADXL345_RANGE_16_G);

  compass.init();
  // FIXED: Removed the incorrect compass.setMode() line. init() handles default setup.

  initINMP441();

  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected");

  client.setServer(mqtt_server, 1883);
  client.setCallback(mqttCallback); // <-- ADDED: Attach the listener
  client.setBufferSize(1024);
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "RailGuardClient-";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      // <-- ADDED: Subscribe to the train radio frequency
      client.subscribe("railguard/v2x/train_presence"); 
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// ===============================
// 5. MAIN LOOP
// ===============================
void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long currentTime = millis();

  // --- NEW: Reset the train passing flag after the cooldown period ends ---
  if (isTrainPassing && (currentTime - lastTrainPassTime > TRAIN_COOLDOWN_MS)) {
      isTrainPassing = false;
      Serial.println("\n✅ [V2X RADIO] Train cleared. Resuming normal monitoring.\n");
  }

  // --- 1. READ ACCELEROMETER ---
  sensors_event_t event;
  accel.getEvent(&event);
  
  float ax = event.acceleration.x;
  float ay = event.acceleration.y;
  float az = event.acceleration.z;
  
  float accel_mag = sqrt(ax*ax + ay*ay + az*az);
  float accel_roll_rms = accel_mag * 0.707; 

  // --- 2. READ MAGNETOMETER ---
  compass.read();
  float mx = compass.getX();
  float my = compass.getY();
  float mz = compass.getZ();
  float mag_norm = sqrt(mx*mx + my*my + mz*mz);

  float heading = atan2(my, mx) * 180.0 / PI;
  if (heading < 0) heading += 360;

  // --- 3. READ TILT ---
  int tilt_val = digitalRead(TILT_PIN); 

  // --- 4. READ MICROPHONE ---
  int32_t mic_sample = 0;
  size_t bytes_read = 0;
  int32_t sample_buffer[64]; 
  
  // FIXED: Removed the '&' before sample_buffer
  i2s_read(I2S_PORT, sample_buffer, sizeof(sample_buffer), &bytes_read, 100);
  
  long mic_sum = 0;
  for(int i=0; i<64; i++) {
     mic_sum += abs(sample_buffer[i] >> 14); 
  }
  float mic_noise_level = mic_sum / 64.0;

  // --- 5. PREPARE JSON PACKET ---
  // FIXED: Reduced buffer size to 512 to save ESP32 memory
  StaticJsonDocument<512> doc;
  
  doc["node_id"] = node_id;
  doc["timestamp"] = currentTime; // Changed to use the currentTime variable
  doc["train_passing"] = isTrainPassing; // <-- ADDED: Tell Python the train is here

  // GPS (Constant for now)
  doc["latitude"] = 28.6139;
  doc["longitude"] = 77.2090;

  // Raw Sensors
  doc["accel_x"] = ax;
  doc["accel_y"] = ay;
  doc["accel_z"] = az;
  // FIXED: Replaced undeclared freq_val with a placeholder 0.0
  doc["frequency"] = 0.0; 
  doc["mag_x"] = mx;
  doc["mag_y"] = my;
  doc["mag_z"] = mz;
  doc["heading"] = heading;
  doc["tilt"] = tilt_val;       
  doc["tilt_alert"] = (tilt_val == LOW); 

  // Calculated Features
  doc["accel_mag"] = accel_mag;
  doc["accel_roll_rms"] = accel_roll_rms;
  doc["mag_norm"] = mag_norm;
  doc["mic_level"] = mic_noise_level;

  // Constant Environment Data
  doc["temperature"] = 25.0; 
  doc["humidity"] = 50.0;
  doc["pressure"] = 1013.25;

  // Serialize & Send
  char buffer[512];
  size_t n = serializeJson(doc, buffer);

  // FIXED: Removed the 'n' argument. publish() only needs topic and payload.
  client.publish("railguard_live_stream", buffer);

  // --- DEBUG PRINT: All Raw Values ---
  if (isTrainPassing) {
      Serial.print("🚆 [TRAIN PASSING] ");
  }
  Serial.print("Ax:"); Serial.print(ax, 2);
  Serial.print(" Ay:"); Serial.print(ay, 2);
  Serial.print(" Az:"); Serial.print(az, 2);
  Serial.print(" | Mx:"); Serial.print(mx, 0);
  Serial.print(" My:"); Serial.print(my, 0);
  Serial.print(" Mz:"); Serial.print(mz, 0);
  Serial.print(" Magnetic sensor norm:"); Serial.print(mag_norm, 0);
  Serial.print(" Accelerometer sensor norm:"); Serial.print(accel_mag, 0);
  Serial.print(" | Tilt:"); Serial.print(tilt_val);
  Serial.print(" | Mic:"); Serial.println(mic_noise_level, 1);

  delay(750); // 2Hz Transmission
}