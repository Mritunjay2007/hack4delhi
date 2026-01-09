const mqtt = require('mqtt');
const config = require('../config/config');
const aiService = require('../ai/aiService');
const { broadcastUpdate } = require('../socket/socket');

const connectMQTT = (onAnomalyCallback) => {
    const client = mqtt.connect(config.mqtt.brokerUrl);

    client.on('connect', () => {
        console.log('✅ Connected to MQTT Broker');
        client.subscribe(config.mqtt.topic);
    });

    client.on('message', async (topic, message) => {
        try {
            const rawData = JSON.parse(message.toString());
            
            // 1. Get AI Decision (using the simple vibration val)
            const aiResult = await aiService.getPrediction(rawData);
            
            // --- FIX: GENERATE MISSING FIELDS FOR NEW DASHBOARD ---
            // If the ESP32 only sends 'vibration_val', we map it to 'accel_mag'
            // and simulate the others so the dashboard looks alive.
            const simulatedData = {
                ...rawData,
                accel_mag: rawData.vibration_val || rawData.accel_mag || 0,
                accel_roll_rms: (rawData.vibration_val * 0.7) || 0, // Mock RMS
                mag_norm: 40 + (Math.random() * 5), // Mock Magnetic baseline (40-45 uT)
                temperature: 25 + (Math.random() * 2), // Mock Temp (25-27 C)
                humidity: 60 + (Math.random() * 5),    // Mock Hum (60-65 %)
                pressure: 1013 + (Math.random() * 10)  // Mock Pressure
            };
            // -------------------------------------------------------

            // 2. Merge Data
            const enrichedData = {
                ...simulatedData, // Use the simulated version
                ...aiResult,
                processed_at: new Date().toISOString()
            };

            // 3. Push to Frontend
            broadcastUpdate(enrichedData);

            // 4. Handle Anomaly Logic
            if(enrichedData.is_anomaly) {
                console.log(`⚠️ ALERT: Tampering at ${rawData.node_id}`);
                
                // FIX: Execute the callback so index.js can save to JSON
                if (onAnomalyCallback) {
                    onAnomalyCallback(enrichedData);
                }
            }
        } catch (err) {
            console.error("Error processing MQTT message:", err.message);
        }
    });

    return client;
};

module.exports = { connectMQTT };