from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
import os
from collections import defaultdict, deque

app = FastAPI()

# -----------------------------
# Load Model
# -----------------------------
if os.path.exists("isolation_forest.pkl") and os.path.exists("scaler.pkl"):
    model = joblib.load("isolation_forest.pkl")
    scaler = joblib.load("scaler.pkl")
    print("✅ AI Model Loaded")
else:
    model = None
    scaler = None
    print("⚠️ No model found, running in Rule-Based Mode")

FEATURE_COLUMNS = [
    "accel_mag", "delta_accel_mag", "accel_roll_mean", "accel_roll_std",
    "accel_roll_rms", "accel_roll_range", "mag_norm", "delta_mag_norm",
    "TEMPERATURE", "HUMIDITY", "PRESSURE"
]

# -----------------------------
# IMPROVEMENT: Per-Node Buffers
# -----------------------------
# Dictionary where key=node_id, value=rolling_buffer_list
node_buffers = defaultdict(lambda: [])
WINDOW = 40

class SensorInput(BaseModel):
    node_id: str
    timestamp: int
    latitude: float
    longitude: float
    accel_x: float
    accel_y: float
    accel_z: float
    mag_x: float
    mag_y: float
    mag_z: float
    heading: float
    tilt: int
    tilt_alert: bool
    accel_mag: float
    accel_roll_rms: float
    mag_norm: float
    mic_level: float
    temperature: float
    humidity: float
    pressure: float

@app.post("/predict")
def predict(data: SensorInput):
    try:
        # 1. Get buffer specific to this node
        buffer = node_buffers[data.node_id]

        # 2. Server-Side Calculation (Trust this over ESP32 for internal logic)
        current_accel_mag = np.sqrt(data.accel_x**2 + data.accel_y**2 + data.accel_z**2)

        buffer.append(current_accel_mag)
        if len(buffer) > WINDOW:
            buffer.pop(0)

        # 3. Calculate Rolling Stats
        accel_roll_mean = float(np.mean(buffer))
        accel_roll_std  = float(np.std(buffer)) if len(buffer) > 1 else 0.0
        accel_roll_rms  = float(np.sqrt(np.mean(np.square(buffer))))
        accel_roll_range = float(max(buffer) - min(buffer)) if len(buffer) > 1 else 0.0

        # --- ANOMALY LOGIC ---
        is_anomaly = False
        severity = "LOW"
        anomaly_score = 0.0

        # Rule 1: Tilt
        if data.tilt == 0:
            is_anomaly = True
            severity = "CRITICAL"
            anomaly_score = 0.98
            print(f"🚨 TILT DETECTED at {data.node_id}")

        # Rule 2: Vibration (Using server calculated value)
        elif current_accel_mag > 2.5:
            is_anomaly = True
            severity = "HIGH"
            anomaly_score = min(current_accel_mag / 4.0, 1.0)

        # Rule 3: AI Model
        elif model and scaler:
            # Note: delta_accel_mag is hardcoded to 0 for stream simplicity.
            # ideally, you would calculate (current - previous) here.
            feature_row = pd.DataFrame([{
                "accel_mag": current_accel_mag,
                "delta_accel_mag": 0, 
                "accel_roll_mean": accel_roll_mean,
                "accel_roll_std": accel_roll_std,
                "accel_roll_rms": accel_roll_rms,
                "accel_roll_range": accel_roll_range,
                "mag_norm": data.mag_norm,
                "delta_mag_norm": 0,
                "TEMPERATURE": data.temperature,
                "HUMIDITY": data.humidity,
                "PRESSURE": data.pressure
            }])

            X_scaled = scaler.transform(feature_row[FEATURE_COLUMNS])
            prediction = model.predict(X_scaled)[0]
            score = model.decision_function(X_scaled)[0]

            if prediction == -1:
                is_anomaly = True
                severity = "MEDIUM"
                anomaly_score = abs(float(score))

        return {
            "node_id": data.node_id,
            "is_anomaly": is_anomaly,
            "severity": severity,
            "anomaly_score": round(anomaly_score, 2),
            "ai_decision": {
                "tilt_detected": data.tilt == 0,
                "vibration_peak": round(current_accel_mag, 3),
                "rolling_rms": round(accel_roll_rms, 3),
                "mic_level": data.mic_level
            },
            "environment": {
                "temp": data.temperature,
                "hum": data.humidity
            }
        }

    except Exception as e:
        print(f"Error processing: {e}")
        # Return safe fallback instead of 500 error to keep system running
        return {
            "node_id": data.node_id,
            "is_anomaly": False,
            "severity": "LOW",
            "anomaly_score": 0.0,
            "ai_decision": {"error": str(e)}
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)