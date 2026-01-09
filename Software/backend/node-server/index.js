const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser'); // Import body-parser
const { initSocket, broadcastUpdate } = require('./socket/socket');
const { connectMQTT } = require('./mqtt/mqttClient');
const dataController = require('./controllers/dataController');

const app = express();
app.use(cors());
app.use(bodyParser.json()); // Enable JSON body parsing

const server = http.createServer(app);
const io = initSocket(server);

// --- API ROUTES ---

// 1. Get all historical alerts (for map load)
app.get('/api/alerts', (req, res) => {
    res.json(dataController.readAlerts());
});

// 2. Mark as Construction
app.post('/api/alerts/mark-construction', (req, res) => {
    const { id } = req.body;
    const updated = dataController.markConstruction(id);
    if(updated) {
        io.emit('alert_update', updated); // Notify frontend immediately
        res.json({ success: true, alert: updated });
    } else {
        res.status(404).json({ error: "Alert not found" });
    }
});

// MQTT Logic Integration
const mqttClient = connectMQTT((data) => {
    // This callback runs when AI detects anomaly
    if (data.is_anomaly) {
        const severity = data.confidence < -0.2 ? "RED" : "YELLOW"; // Example logic
        const savedAlert = dataController.addAlert(data.node_id, severity);
        
        // Broadcast FULL alert object with Lat/Lng to Frontend
        io.emit('new_alert', savedAlert);
    }
});

server.listen(3000, () => console.log('🚀 Server + API running on 3000'));