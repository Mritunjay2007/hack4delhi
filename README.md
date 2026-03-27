<div align="center">

  <img src="https://wp.logos-download.com/wp-content/uploads/2019/11/Indian_Railway_Logo_2.png?dl" alt="Indian Railways" width="100" />
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://www.wirecable.in/wp-content/uploads/2023/07/GOI.jpg" alt="GOI" width="150" />
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://media.assettype.com/thequint%2F2016-01%2F5fe4b302-c270-4b8a-8c02-db7cf3ef93ed%2FMake-in-India.jpg?rect=0%2C0%2C1820%2C1024&auto=format%2Ccompress&fmt=webp&width=720" alt="Make in India" width="120" />

  <br/><br/>

  # RailGuard Command Center
  ### AI-Powered Real-Time Railway Sabotage Detection System

  <p>
    <a href="#-problem-statement">Problem</a> •
    <a href="#-key-features">Features</a> •
    <a href="#-system-architecture">Architecture</a> •
    <a href="#-prototype-in-action">Prototype</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-installation--setup">Setup</a>
  </p>

  <img src="https://img.shields.io/badge/Status-Prototype-orange?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/IoT-ESP32%20%7C%20Pico%20W-blue?style=for-the-badge&logo=espressif" alt="IoT Hardware" />
  <img src="https://img.shields.io/badge/AI-Gemini%202.5%20Flash-yellow?style=for-the-badge&logo=google" alt="AI" />
  <img src="https://img.shields.io/badge/ML-Scikit--Learn-F7931E?style=for-the-badge&logo=scikit-learn" alt="ML" />
  <img src="https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Backend-Node.js-339933?style=for-the-badge&logo=nodedotjs" alt="Node" />

</div>


## 🚨 Problem Statement

Railway safety is critical, yet infrastructure is often compromised by sabotage, theft, or tampering. Traditional inspection methods are reactive and intermittent. **RailGuard** provides a **proactive** solution to:

* **Detect** physical tampering (sawing, hammering, removal) in real-time.
* **Analyze** multi-sensor data using Edge AI and Cloud Vision-Language Models (VLMs).
* **Alert** operators instantly via a geospatial dashboard with visual evidence.



## 🌟 Key Features (New)

* **Hybrid Threat Detection:** Combines hard physics thresholds (e.g., 30% relative magnetic drops, >15G vibration spikes) with an unsupervised **Isolation Forest ML model** to catch subtle anomaly patterns.
* **V2X Train Bypass Protocol:** Utilizes Vehicle-to-Infrastructure communication. An approaching train broadcasts its presence via MQTT, dynamically pausing physical threat alerts for 15 seconds to prevent false positives from massive train vibrations.
* **Dynamic Auto-Calibration:** Edge nodes automatically establish a localized magnetic baseline upon boot, preventing false alarms from natural geomagnetic shifts or environmental interference.
* **Desk Testing Mode:** A developer-friendly toggle that adjusts sensitivity thresholds so the heavy-duty railway physics engine can be tested on a standard office desk.



## 🧠 System Architecture

The system follows a linear data pipeline from the physical edge (and V2X Train network) to the operator dashboard, culminating in a "Wake-on-Threat" visual validation.

```mermaid
graph LR
    A[ESP32 Track Node] -->|Sensors MQTT| B(Broker)
    T[Pico W Train Node] -->|V2X MQTT| B
    B -->|Subscribe| C{Node.js Backend}
    C -->|HTTP Post| D[FastAPI Hybrid Engine]
    D -->|Trigger| C
    C -->|API| E[Gemini 2.5 VLM]
    E -->|Validation| C
    C -->|Socket.io| F[React Dashboard]
````

> **Flow:** Track Sensors & V2X Train Signals → MQTT Broker → Node Server → Physics + ML Inference Engine → Wake Camera → VLM Validation → Dashboard UI

## 📸 Prototype in Action

\<table\>
\<tr\>
\<td align="center"\>\<strong\>Hardware: ESP32 Edge Node\</strong\>\</td\>
\<td align="center"\>\<strong\>Hardware: Field Deployment\</strong\>\</td\>
\<td align="center"\>\<strong\>Hardware: Prototype\</strong\>\</td\>
\</tr\>
\<tr\>
\<td\>\<img src="Documents/prototype/hardware\_circuit.jpeg" alt="ESP32 Breadboard Circuit" width="400"/\>\</td\>
\<td\>\<img src="Documents/prototype/hardware\_track.jpeg" alt="Node Deployed on Tracks" width="400"/\>\</td\>
\<td\>\<img src="Documents/prototype/prototype.jpeg" alt="Prototype" width="400"/\>\</td\>
\</tr\>
\<tr\>
\<td align="center"\>\<strong\>Software: Live Telemetry Dashboard\</strong\>\</td\>
\<td align="center"\>\<strong\>Software: VLM Sabotage Detection\</strong\>\</td\>
\</tr\>
\<tr\>
\<td\>\<img src="Documents/prototype/dashboard\_live.jpeg" alt="Dashboard showing live sensor telemetry" width="400"/\>\</td\>
\<td\>\<img src="Documents/prototype/dashboard\_alert.jpeg" alt="Dashboard showing camera visual alert" width="400"/\>\</td\>
\</tr\>
\</table\>

## 🛠 Tech Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Track Hardware** | `ESP32 / ADXL345` | Edge node collecting Vibration, Magnetic (QMC5883L) & Sound (INMP441) data. |
| **V2X Hardware** | `Pico W / ESP32` | Secondary node acting as a Train Impersonator broadcasting approach signals. |
| **Backend** | `Node.js / Express` | Server acting as the bridge between MQTT, AI, and Frontend. |
| **Hybrid AI** | `FastAPI / Scikit-Learn` | Physics rules + Isolation Forest ML model for highly accurate anomaly scoring. |
| **Vision AI** | `Gemini 2.5 Flash` | Cloud VLM used for visual validation of the threat scene. |
| **Frontend** | `React / Vite` | Dashboard with Leaflet Maps (OpenRailwayMap) & Recharts for live telemetry. |
| **Comms** | `MQTT / WebSockets`| Low-latency protocol for IoT sensor data and V2X transmission to UI. |

## ⚙️ Installation & Setup

Follow these steps to set up the system locally.

### Prerequisites

  * **Node.js** (v16 or higher)
  * **Python** (v3.9 or higher)
  * **Git**
  * **Arduino IDE** (If deploying to physical hardware)

### 1️⃣ Clone the Repository

```bash
git clone [https://github.com/thesurajarya/hack4delhi.git](https://github.com/thesurajarya/hack4delhi.git)
cd hack4delhi
```

### 2️⃣ Backend Setup (Node.js)

The backend handles MQTT subscriptions, WebSockets, and Gemini API calls.

```bash
cd Software/backend/node-server
npm install
# Create a .env file and add your GEMINI_API_KEY
```

### 3️⃣ AI Service Setup (Python)

The intelligence layer that processes raw sensor physics and ML models.

```bash
cd Software/backend/node-server/ai-service
pip install -r requirements.txt
```

### 4️⃣ Frontend Setup (React)

The command center dashboard.

```bash
cd Software/frontend
npm install
```

## 🚀 How to Run

To run the full system, you need **three separate terminal windows**.

#### Terminal 1: The Brain (AI Service)

```bash
cd Software/backend/node-server/ai-service
python -m uvicorn dataextract:app --reload --port 5000
```

> *Output:* `==> AI Model Loaded Successfully`

#### Terminal 2: The Bridge (Node Backend)

```bash
cd Software/backend/node-server
node index.js
```

> *Output:* `RailGuard Backend Active` and `Connected to MQTT Broker`

#### Terminal 3: The Interface (Dashboard)

```bash
cd Software/frontend
npm run dev
```

> *Output:* `➜ Local: http://localhost:5173/`

## 🧪 Testing the System

1.  **Open Dashboard:** Navigate to `http://localhost:5173`.
2.  **Select Mode:** Choose **TEST MODE (SIM)** from the header dropdown.
3.  **Simulate Threat:** Click the red `🚨 SIMULATE THREAT` button. The camera will wake up, snap a photo, and send it to the VLM.
4.  **Hardware Test:** If using the physical ESP32 Track Node, switch to **LIVE SENSORS** mode. Allow 20 readings for the magnetic auto-calibration to complete, then shake the sensor violently to trigger the edge-to-cloud alert pipeline.
5.  **V2X Train Test:** Power on your secondary Train Impersonator node (Pico W or ESP32). Press the physical `BOOT` button to broadcast the train's approach. The Python server will automatically pause anomaly detection for 15 seconds, outputting `"severity": "NORMAL (TRAIN PASSING)"`.

\<div align="center"\>
\<b\>Built for Hack4Delhi / Railway Safety Projects 🇮🇳\</b\>

<br>

\<sub\>RDSO Compliant Logic • Indigenous Technology • Make in India\</sub\>

\</div\>