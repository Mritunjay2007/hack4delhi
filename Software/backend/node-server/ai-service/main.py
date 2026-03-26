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
print("\n" + "="*60)
print("AI SERVICE: AUTO-CALIBRATION & MAG-DROP PROTECTION ACTIVE")
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
# 3. BUFFERS & CALIBRATION STATE
# ===============================
node_buffers = defaultdict(lambda: [])
WINDOW_SIZE = 40

# --- NEW: Calibration Storage ---
node_baselines = {} # Stores the "Normal" magnetic value for each node
calibration_count = defaultdict(int)
CALIBRATION_LIMIT = 20 # Number of samples to wait before arming the system

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
    latitude: float = 0.0
    longitude: float = 0.0
    mic_level: float = 0.0  
    accel_mag: float = 0.0
    mag_norm: float = 0.0

# ===============================
# 5. API ENDPOINT
# ===============================
@app.post("/predict")
def predict(data: SensorInput):
    try:
        # --- A. CALCULATE PHYSICS ---
        current_accel_mag = data.accel_mag if data.accel_mag > 0 else np.sqrt(data.accel_x**2 + data.accel_y**2 + data.accel_z**2)
        current_mag_norm = data.mag_norm if data.mag_norm > 0 else np.sqrt(data.mag_x**2 + data.mag_y**2 + data.mag_z**2)

        # Update Buffer
        buffer = node_buffers[data.node_id]
        buffer.append(current_accel_mag)
        if len(buffer) > WINDOW_SIZE:
            buffer.pop(0)

        # --- B. AUTO-CALIBRATION LOGIC ---
        # If node not in baselines, initialize it as a list for samples
        if data.node_id not in node_baselines:
            node_baselines[data.node_id] = []
            calibration_count[data.node_id] = 0

        # If it's still a list, we are in calibration mode
        if isinstance(node_baselines[data.node_id], list):
            node_baselines[data.node_id].append(current_mag_norm)
            calibration_count[data.node_id] += 1
            
            if calibration_count[data.node_id] >= CALIBRATION_LIMIT:
                avg_baseline = sum(node_baselines[data.node_id]) / len(node_baselines[data.node_id])
                node_baselines[data.node_id] = float(avg_baseline) # Convert list to float
                print(f"✅ CALIBRATION COMPLETE for {data.node_id}: Baseline set to {avg_baseline:.2f}")
            
            return {
                "node_id": data.node_id,
                "is_anomaly": False,
                "severity": "CALIBRATING",
                "reasons": [f"Initializing... ({calibration_count[data.node_id]}/{CALIBRATION_LIMIT})"],
                "accel_mag": float(current_accel_mag),
                "mag_norm": float(current_mag_norm)
            }

        # --- C. PREPARE ROLLING STATS ---
        accel_roll_mean = np.mean(buffer) if len(buffer) > 0 else 0.0
        accel_roll_std = np.std(buffer) if len(buffer) > 1 else 0.0
        accel_roll_range = (np.max(buffer) - np.min(buffer)) if len(buffer) > 0 else 0.0
        accel_roll_rms = np.sqrt(np.mean(np.square(buffer))) if len(buffer) > 0 else 0.0
        
        row = {
            "accel_mag": float(current_accel_mag),
            "delta_accel_mag": 0.0, 
            "accel_roll_mean": float(accel_roll_mean),
            "accel_roll_range": float(accel_roll_range),
            "accel_roll_rms": float(accel_roll_rms),
            "accel_roll_std": float(accel_roll_std),
            "mag_norm": float(current_mag_norm),
            "delta_mag_norm": 0.0,
            "TEMPERATURE": data.temperature,
            "HUMIDITY": data.humidity,
            "PRESSURE": data.pressure
        }

        # --- D. ANOMALY DECISION LOGIC ---
        is_anomaly = False
        severity = "LOW"
        anomaly_score = 0.0
        reasons = []

        # This is now guaranteed to be a float
        baseline = node_baselines[data.node_id]

        # Scenario A: High Vibration + High Audio
        
        # ==========================================
        # ENVIRONMENT THRESHOLDS (Toggle these for testing)
        # ==========================================
        # Set to True if testing on a desk. Set to False for real track deployment.
        DESK_TESTING_MODE = True 

        if DESK_TESTING_MODE:
            VIB_THRESHOLD = 30.0       # Requires a very hard shake/hit to trigger
            MIC_THRESHOLD = 60.0       # Requires a loud clap or shout (ignores talking)
            MAG_DROP_RATIO = 0.4       # Requires a 60% drop in magnetic field to trigger
            ML_THRESHOLD = -0.5        # Highly forgiving ML threshold (ignores slight ambient noise)
        else:
            VIB_THRESHOLD = 15.0       # Production Railway Vibration
            MIC_THRESHOLD = 5.0        # Production Railway Audio
            MAG_DROP_RATIO = 0.7       # Production 30% Mag Drop
            ML_THRESHOLD = -0.1        # Strict ML Anomaly Detection

        # --- D. ANOMALY DECISION LOGIC ---
        is_anomaly = False
        severity = "LOW"
        anomaly_score = 0.0
        reasons = []

        baseline = node_baselines[data.node_id]

        # Scenario A: High Vibration + High Audio
        if current_accel_mag > VIB_THRESHOLD and data.mic_level > MIC_THRESHOLD:
            is_anomaly = True
            severity = "CRITICAL"
            anomaly_score = 0.95
            reasons.append("Sabotage Pattern: Vibration + Audio Match")

        # Scenario B: RELATIVE Magnetic Drop
        elif current_mag_norm < (baseline * MAG_DROP_RATIO): 
            is_anomaly = True
            severity = "CRITICAL"
            anomaly_score = 0.90
            reasons.append(f"Magnetic Drop: {current_mag_norm:.1f} vs Base: {baseline:.1f}")

        # Scenario C: High Vibration Only
        elif current_accel_mag > VIB_THRESHOLD:
            is_anomaly = True
            severity = "WARNING"
            # Scale score based on how far past the threshold it went
            anomaly_score = min((current_accel_mag - VIB_THRESHOLD) / 10.0, 1.0)
            reasons.append("Heavy Vibration Detected")

        # RULE 2: AI MODEL
        elif not is_anomaly and model and scaler:
            df = pd.DataFrame([row])
            X_scaled = scaler.transform(df[FEATURES])
            raw_score = model.decision_function(X_scaled)[0]
            
            if raw_score < ML_THRESHOLD:
                is_anomaly = True
                severity = "MEDIUM"
                anomaly_score = abs(raw_score)
                reasons.append(f"AI Pattern Anomaly (Score: {raw_score:.2f})")

        return {
            "node_id": data.node_id,
            "is_anomaly": is_anomaly,
            "severity": severity,
            "anomaly_score": round(float(anomaly_score), 2),
            "reasons": reasons,
            "location": {"lat": data.latitude, "lng": data.longitude},
            "mic_level": float(data.mic_level),
            "accel_mag": float(current_accel_mag),
            "mag_norm": float(current_mag_norm)
        }

    except Exception as e:
        import traceback
        print(f"Error processing: {e}")
        traceback.print_exc() # This will show exactly which line failed in terminal
        return {
            "node_id": data.node_id,
            "is_anomaly": False,
            "severity": "ERROR",
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)