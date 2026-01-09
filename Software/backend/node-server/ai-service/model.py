import numpy as np
from sklearn.ensemble import IsolationForest
import joblib

class AnomalyDetector:
    def __init__(self):
        self.clf = IsolationForest(contamination=0.1, random_state=42)
        self.is_trained = False

    def train_dummy(self):
        # Simulate training on "Normal" low-vibration data (0.0 to 2.0)
        rng = np.random.RandomState(42)
        X_train = rng.uniform(low=0.0, high=2.0, size=(200, 1))
        self.clf.fit(X_train)
        self.is_trained = True
        print("✅ AI Model Trained on Normal Baseline")

    def predict(self, value):
        if not self.is_trained:
            self.train_dummy()
            
        X = np.array([[value]])
        pred = self.clf.predict(X)[0] # 1 is normal, -1 is anomaly
        score = self.clf.decision_function(X)[0]
        
        return {
            "status": "NORMAL" if pred == 1 else "TAMPERING DETECTED",
            "is_anomaly": bool(pred == -1),
            "confidence": float(score) # Lower/Negative = High Anomaly Confidence
        }