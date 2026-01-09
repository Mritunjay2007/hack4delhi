const axios = require('axios');
const config = require('../config/config');

async function getPrediction(sensorData) {
    try {
        const response = await axios.post(config.ai.url, {
            vibration_val: sensorData.vibration_val
        });
        return response.data;
    } catch (error) {
        console.error("AI Service Error:", error.message);
        // Fallback in case AI is down
        return { status: "UNKNOWN", confidence: 0, is_anomaly: false };
    }
}

module.exports = { getPrediction };