from fastapi import FastAPI
from pydantic import BaseModel
from model import AnomalyDetector
import uvicorn

app = FastAPI()
detector = AnomalyDetector()

# Train on startup
@app.on_event("startup")
def load_model():
    detector.train_dummy()

class SensorInput(BaseModel):
    vibration_val: float

@app.post("/predict")
def get_prediction(data: SensorInput):
    return detector.predict(data.vibration_val)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)