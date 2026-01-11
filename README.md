```
# 🚆 Railway Track Tampering Detection System

An AI-powered IoT solution designed to detect intentional railway track tampering in real-time. This system fuses sensor data from ESP32 nodes with an Isolation Forest AI model to identify anomalies (vibration, magnetic changes, tilt) and alert operators instantly via a live dashboard.

## 🚀 Problem Statement
Railway safety is often compromised by sabotage or tampering. This system aims to:
* **Detect** physical tampering events (sawing, hammering, removal) in real-time.
* **Analyze** sensor data using Edge AI and Cloud AI.
* **Visualize** threats on a geospatial dashboard for immediate action.

## 🛠 Tech Stack

* **Hardware:** ESP32 (C/C++), ADXL345 (Accelerometer), QMC5883L (Magnetometer), INMP441 (Microphone).
* **Communication:** MQTT (HiveMQ Broker), WebSockets (Socket.io).
* **Backend:** Node.js + Express.
* **AI Service:** Python + FastAPI + scikit-learn (Isolation Forest).
* **Frontend:** React.js + Recharts + Leaflet Maps + Tailwind CSS.

## 🔄 System Architecture

**`ESP32 Node`** 📡 *(MQTT)* ➔ **`HiveMQ Broker`** ☁️ ➔ **`Node.js Backend`** ⚙️ 
➔ **`Python AI Service`** 🧠 *(HTTP)* ➔ **`Node.js Backend`** ⚡ *(Socket.io)* ➔ **`React Dashboard`** 🖥️

---

## ⚙️ Installation & Setup

### Prerequisites
* Node.js (v16+)
* Python (v3.9+)
* Git

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd <your-repo-name>

```

### 2. Setup Frontend

```bash
cd Software/frontend
npm install

```

### 3. Setup Backend (Node.js)

```bash
cd ../backend/node-server
npm install

```

### 4. Setup AI Service (Python)

```bash
cd ai-service
# It is recommended to create a virtual environment first
pip install -r requirements.txt

```

---

## 🏃‍♂️ How to Run

To run the full system, you will need **three separate terminal windows**.

### Terminal 1: Start AI Service (Python)

This service processes sensor data to detect anomalies.

```bash
# Navigate to: Software/backend/node-server/ai-service
python -m uvicorn main:app --reload --port 5000

```

*You should see:* `✅ AI Model Loaded` or `INFO: Uvicorn running on http://127.0.0.1:5000`

### Terminal 2: Start Backend Server (Node.js)

This acts as the bridge between MQTT, AI, and the Dashboard.

```bash
# Navigate to: Software/backend/node-server
node index.js

```

*You should see:* ```
🚀 Server running on http://localhost:3000
✅ Connected to MQTT Broker
📡 Socket Stream Active

```

### Terminal 3: Start Dashboard (Frontend)
The user interface for monitoring.
```bash
# Navigate to: Software/frontend
npm run dev

```

*You should see:* `➜ Local: http://localhost:5173/`

---

## 🧪 Testing the System

1. **Open Dashboard:** Go to `http://localhost:5173` in your browser.
2. **Select Mode:**
* **LIVE:** Connects to your real ESP32 device.
* **TEST (SIM):** Simulates data if you don't have the hardware connected.


3. **Trigger Anomaly:**
* Shake the ESP32 or bring a magnet close to it.
* The Dashboard graph should spike, and a **Red Alert** marker should appear on the map.



## 📂 Project Structure

```
Software/
├── frontend/                 # React Dashboard
├── backend/
│   └── node-server/          # Main Server (Express + MQTT)
│       ├── ai-service/       # Python AI Model (FastAPI)
│       ├── mqtt/             # MQTT Client Logic
│       ├── socket/           # WebSocket Logic
│       └── index.js          # Entry Point

```

## 🚧 Status

**Hackathon Prototype** - Functional MVP with real-time detection and alerting.
