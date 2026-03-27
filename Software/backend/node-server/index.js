require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { initSocket } = require('./socket/socket');
const { connectMQTT } = require('./mqtt/mqttClient');
const dataController = require('./controllers/dataController');
const { sendCriticalAlert } = require('./services/alertService');
const { GoogleGenerativeAI } = require("@google/generative-ai");
// Change this line
const { sendVlmAlert } = require('./services/alertService');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// 1. STORAGE & HISTORY SETUP
// ==========================================
const uploadDir = path.join(__dirname, 'public', 'captures');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
// Serve captured images to the React Dashboard
app.use('/captures', express.static(uploadDir));

// In-memory forensic history (Replace with MongoDB in production)
let detectionHistory = [];

const server = http.createServer(app);
const io = initSocket(server);

// ==========================================
// 2. SYSTEM CONFIGURATION
// ==========================================
const PYTHON_AI_URL = 'http://127.0.0.1:5000/predict';
const dashboardAlertCooldowns = new Map();
const DASHBOARD_COOLDOWN_TIME = 15 * 1000; // 15 Seconds

// Vision Orchestrator State
let isVisionProcessing = false;
let lastVisionRequestTime = 0;
const VISION_MIN_INTERVAL = 10000; // 10 seconds between Gemini requests

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// 3. STANDARD API ROUTES
// ==========================================
app.get('/api/alerts', (req, res) => {
    res.json(dataController.readAlerts());
});

app.post('/api/alerts/mark-construction', (req, res) => {
    const { id } = req.body;
    const updated = dataController.markConstruction(id);
    if (updated) {
        io.emit('alert_update', updated);
        res.json({ success: true, alert: updated });
    } else {
        res.status(404).json({ error: "Alert not found" });
    }
});

app.get('/api/history', (req, res) => {
    // Return the 30 most recent forensic captures
    res.json(detectionHistory.slice(0, 30));
});

// ==========================================
// 4. VISION ORCHESTRATOR (GEMINI VLM)
// ==========================================
app.post('/api/vision', async (req, res) => {
    const { image_base64, node_id, telemetry, alert_id } = req.body;
    const now = Date.now();

    // --- A. THROTTLE GATEKEEPER ---
    if (isVisionProcessing) {
        return res.status(429).json({ status: "throttled", message: "AI is currently busy analyzing a frame." });
    }
    if (now - lastVisionRequestTime < VISION_MIN_INTERVAL) {
        return res.status(429).json({ status: "throttled", message: "Flood Protection: Cooldown active." });
    }

    try {
        isVisionProcessing = true;
        lastVisionRequestTime = now;
        console.log(`[AI-Service] Received image from ${node_id}. Starting Gemini analysis...`);

        // --- B. SAVE EVIDENCE TO DISK ---
        const fileName = `capture_${node_id || 'UNKNOWN'}_${now}.jpg`;
        const filePath = path.join(uploadDir, fileName);

        // Strip base64 headers if present
        const base64Data = image_base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
        fs.writeFileSync(filePath, base64Data, 'base64');

        const imageUrl = `http://localhost:3000/captures/${fileName}`;

        // --- C. GEMINI VLM ANALYSIS ---
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `You are a highly secure railway monitoring AI. Analyze this image of a railway track.
        Determine if there is any evidence of tampering, sabotage, missing components, or unauthorized presence.
        Respond ONLY with a JSON object in this exact format:
        {"confirmed": true/false, "confidence": <number 0-100>, "reason": "<A brief, 1-sentence specific explanation>"}`;

        const imagePart = { inlineData: { data: base64Data, mimeType: "image/jpeg" } };
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = await result.response.text();

        // Safely parse JSON (strip markdown blocks if Gemini included them)
        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        const aiVerdict = JSON.parse(cleanJson);

        console.log(`[AI-Service] Verdict: ${aiVerdict.confirmed ? 'SABOTAGE' : 'CLEAR'} (${aiVerdict.confidence}%)`);

        // --- D. LOGGING & BROADCASTING ---
        const detectionLog = {
            id: alert_id || `DET-${now}`,
            node_id: node_id || "UNKNOWN",
            imageUrl: imageUrl,
            confirmed: aiVerdict.confirmed,
            confidence: aiVerdict.confidence,
            reason: aiVerdict.reason,
            timestamp: new Date().toISOString(),
            telemetry: telemetry || {}
        };

        // Save to in-memory forensic gallery
        detectionHistory.unshift(detectionLog);

        // Broadcast to Dashboard UI
        io.emit('vision_verdict', detectionLog);
        io.emit('new_detection', detectionLog);

        // --- E. DISPATCH CRITICAL EMAIL ---
        // --- E. DISPATCH FORMAL EMAIL NOTIFICATIONS ---
        // This will now send a Green mail if secure, or a Red mail if a threat is confirmed
        const alertData = {
            node_id: detectionLog.node_id,
            reason: aiVerdict.reason,
            confidence: aiVerdict.confidence,
            ...telemetry
        };

        if (aiVerdict.confirmed && aiVerdict.confidence >= 70) {
            // 1. Send Formal Threat Alert (Red)
            await sendVlmAlert(alertData, true);
        } else {
            // 2. Send Formal Status Secure Update (Green)
            await sendVlmAlert(alertData, false);
        }

        res.json({ status: "success", ...detectionLog });

    } catch (error) {
        // --- UPGRADED ERROR LOGGING ---
        console.log("\n❌ --- VISION SERVICE CRASH --- ❌");
        console.error("Error Message:", error.message);

        if (error.status === 403) console.error("Cause: Invalid Gemini API Key.");
        if (error.message.includes("sendCriticalAlert")) console.error("Cause: Email Service Failed.");
        if (error.message.includes("JSON")) console.error("Cause: Gemini returned weird text instead of JSON.");

        console.log("--------------------------------\n");

        res.status(500).json({ status: "error", message: error.message });
    } finally {
        isVisionProcessing = false;
    }
});

// ==========================================
// 5. MQTT SENSOR STREAM BRIDGE
// ==========================================
const mqttClient = connectMQTT(async (rawData) => {
    const targetNodeId = rawData.nodeId || rawData.node_id;

    if (targetNodeId) {
        try {
            // Forward raw data to Python Isolation Forest
            const aiResponse = await axios.post(PYTHON_AI_URL, rawData, { timeout: 5000 });
            const aiAnalysis = aiResponse.data;

            // Broadcast merged telemetry to React Dashboard
            const telemetryPacket = {
                ...rawData,
                ...aiAnalysis,
                timestamp: rawData.timestamp || Date.now(),
                node_id: targetNodeId
            };
            io.emit('sensor_update', telemetryPacket);

            // Trigger Alerts if Python detects physical anomaly
            if (aiAnalysis.is_anomaly) {
                const now = Date.now();
                const lastAlertTime = dashboardAlertCooldowns.get(targetNodeId) || 0;

                if (now - lastAlertTime > DASHBOARD_COOLDOWN_TIME) {
                    dashboardAlertCooldowns.set(targetNodeId, now);
                    console.log(`🚨 Sensor Anomaly triggered at: ${targetNodeId}`);

                    const severity = aiAnalysis.severity || "CRITICAL";
                    const savedAlert = dataController.addAlert(targetNodeId, severity);

                    io.emit('new_alert', {
                        ...savedAlert,
                        lat: rawData.lat || rawData.latitude || 28.6427,
                        lng: rawData.lng || rawData.longitude || 77.2207,
                        nodeId: targetNodeId,
                        severity: severity,
                        reasons: aiAnalysis.reasons ? aiAnalysis.reasons.join(", ") : "",
                        telemetry: {
                            accel_mag: aiAnalysis.accel_mag,
                            mag_norm: aiAnalysis.mag_norm
                        }
                    });
                }
            }
        } catch (error) {
            console.error("AI Bridge Error:", error.message);
        }
    }
});

// ==========================================
// 6. STARTUP
// ==========================================
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`RailGuard Orchestrator Active`);
    console.log(`PORT:      ${PORT}`);
    console.log(`STORAGE:   /public/captures (Forensic Gallery)`);
    console.log(`GEMINI:    v1.5-flash (Secure Mode)`);
    console.log(`==================================================\n`);
});