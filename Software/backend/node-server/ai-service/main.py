from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
import os
from collections import defaultdict

# ===============================
# 1. INITIALIZE SERVER
# ===============================
app = FastAPI()

# --- STARTUP CHECK ---
# Look for this banner in your terminal to confirm the update!
print("\n" + "="*60)
print("AI SERVICE LOADED: GRAVITY FIX (15.0) | TILT DISABLED | 3-STAGE LOCK ACTIVE")
print("="*60 + "\n")

# ===============================
# 2. LOAD MODEL & SCALER
# ===============================
MODEL_FILE  = "isolation_forest.pkl"
SCALER_FILE = "scaler.pkl"

if os.path.exists(MODEL_FILE) and os.path.exists(SCALER_FILE):
    model  = joblib.load(MODEL_FILE)
    scaler = joblib.load(SCALER_FILE)
    print("==> AI Model Loaded Successfully")
else:
    model  = None
    scaler = None
    print("==> No model found - Running in Physics-Only Mode")

# Features must match your training data exactly
FEATURES = [
    "accel_mag",
    "delta_accel_mag",
    "accel_roll_mean",
    "accel_roll_std",
    "accel_roll_rms",
    "accel_roll_range",
    "mag_norm",
    "delta_mag_norm",
    "TEMPERATURE",
    "HUMIDITY",
    "PRESSURE",
]

# ===============================
# 3. BUFFERS (For Rolling Stats)
# ===============================
# We need history to calculate "accel_std"
node_buffers = defaultdict(lambda: [])
WINDOW_SIZE = 40

# ===============================
# 4. INPUT DATA MODEL
# ===============================
class SensorInput(BaseModel):
    node_id: str
    timestamp: int
    accel_x: float
    accel_y: float
    accel_z: float
    frequency: float = 0.0
    mag_x: float
    mag_y: float
    mag_z: float
    heading: float
    tilt: int
    tilt_alert: bool
    temperature: float
    humidity: float
    pressure: float
    # Optional fields (Defaults prevent crashing if sensor misses one)
    latitude: float = 0.0
    longitude: float = 0.0
    mic_level: float = 0.0  # <--- Added for Mic Graph support
    # Add these lines:
    accel_mag: float = 0.0
    mag_norm: float = 0.0

# ===============================
# 5. API ENDPOINT
# ===============================
@app.post("/predict")
def predict(data: SensorInput):
    try:
        # --- A. CALCULATE PHYSICS ---
        # Calculate Magnitude from X, Y, Z
        # Change the physics calculation to:
        current_accel_mag = data.accel_mag if data.accel_mag else np.sqrt(data.accel_x**2 + data.accel_y**2 + data.accel_z**2)
        current_mag_norm = data.mag_norm if data.mag_norm else np.sqrt(data.mag_x**2 + data.mag_y**2 + data.mag_z**2)

        # Update Buffer for this specific node
        buffer = node_buffers[data.node_id]
        buffer.append(current_accel_mag)
        if len(buffer) > WINDOW_SIZE:
            buffer.pop(0)

        # --- UPDATED: Calculate exact rolling stats needed by the AI Model ---
        accel_roll_mean = np.mean(buffer) if len(buffer) > 0 else 0.0
        accel_roll_std = np.std(buffer) if len(buffer) > 1 else 0.0
        accel_roll_range = (np.max(buffer) - np.min(buffer)) if len(buffer) > 0 else 0.0
        accel_roll_rms = np.sqrt(np.mean(np.square(buffer))) if len(buffer) > 0 else 0.0
        
        # --- B. PREPARE FEATURE ROW FOR AI ---
        # UPDATED: Row now perfectly matches the FEATURES array
        row = {
            "accel_mag": current_accel_mag,
            "delta_accel_mag": 0.0, # Simplified for real-time stream
            "accel_roll_mean": float(accel_roll_mean),
            "accel_roll_range": float(accel_roll_range),
            "accel_roll_rms": float(accel_roll_rms),
            "accel_roll_std": float(accel_roll_std),
            "mag_norm": current_mag_norm,
            "delta_mag_norm": 0.0,
            "TEMPERATURE": data.temperature,
            "HUMIDITY": data.humidity,
            "PRESSURE": data.pressure
        }

        # --- C. ANOMALY DECISION LOGIC ---
        is_anomaly = False
        severity = "LOW"
        anomaly_score = 0.0
        reasons = []

        # RULE 1: 3-STAGE LOCK & PHYSICS SHAKE (The USP Logic)
        
        # Scenario A: High Vibration + High Audio (Sawing/Hammering)
        if current_accel_mag > 15.0 and data.mic_level > 5.0:
            is_anomaly = True
            severity = "CRITICAL"
            anomaly_score = 0.95
            reasons.append(f"Vibration + Acoustic Match (Mag: {current_accel_mag:.1f})")
            print(f"==> TAMPERING DETECTED! Mag: {current_accel_mag:.2f}, Mic: {data.mic_level:.2f}")

        # Scenario B: Magnetic Drop (Bolt/Fishplate Removed)
        elif current_mag_norm < 1400: # Adjust this baseline if your sensor reads differently normally
            is_anomaly = True
            severity = "CRITICAL"
            anomaly_score = 0.90
            reasons.append(f"Magnetic Anomaly (Norm: {current_mag_norm:.1f})")
            print(f"==> MAG ANOMALY DETECTED! Norm: {current_mag_norm:.2f}")

        # Scenario C: High Vibration Only (Threshold 15.0 ignores Gravity)
        elif current_accel_mag > 15.0:
            is_anomaly = True
            severity = "WARNING"
            # Normalize score (15.0 -> 0.0, 25.0 -> 1.0)
            anomaly_score = min((current_accel_mag - 15.0) / 10.0, 1.0)
            reasons.append(f"Violent Shake/Possible Train (Mag: {current_accel_mag:.1f})")
            print(f"==> SHAKE DETECTED! Mag: {current_accel_mag:.2f}")

        # RULE 2: AI MODEL (Only checks if physics didn't already trigger)
        elif not is_anomaly and model and scaler:
            df = pd.DataFrame([row])
            X_scaled = scaler.transform(df[FEATURES])
            
            # Get raw score from Isolation Forest
            raw_score = model.decision_function(X_scaled)[0]
            
            # Threshold: Lower than -0.05 is anomalous
            if raw_score < -0.05:
                is_anomaly = True
                severity = "MEDIUM"
                anomaly_score = abs(raw_score)
                reasons.append("AI Pattern Anomaly")

        # RULE 3: TILT (DISABLED TO PREVENT FALSE ALARMS)
        # Uncomment below lines to re-enable tilt detection
        # if data.tilt == 0:
        #     is_anomaly = True
        #     severity = "CRITICAL"
        #     reasons.append("Tilt Detected")

        # --- D. RETURN RESULT ---
        return {
            "node_id": data.node_id,
            "is_anomaly": is_anomaly,
            "severity": severity,
            "anomaly_score": round(float(anomaly_score), 2),
            "reasons": reasons,
            "location": {"lat": data.latitude, "lng": data.longitude},
            # Return additional fields so Node.js can graph them easily
            "mic_level": data.mic_level,
            "frequency": data.frequency,
            "accel_mag": current_accel_mag,
            "mag_norm": current_mag_norm
        }

    except Exception as e:
        print(f"Error processing: {e}")
        return {
            "node_id": data.node_id,
            "is_anomaly": False,
            "severity": "LOW",
            "anomaly_score": 0.0,
            "error": str(e)
        }

# ===============================
# 6. START SERVER
# ===============================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)