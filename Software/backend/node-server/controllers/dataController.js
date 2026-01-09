const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/alerts.json');

// Mock GPS Map: Where is each Node located?
const NODE_LOCATIONS = {
    "TRACK_SEC_42": { lat: 28.6139, lng: 77.2090, name: "New Delhi Central" }, // Example: Delhi
    "TRACK_SEC_43": { lat: 28.5355, lng: 77.3910, name: "Noida Sector 18" }
};

// Helper: Read Data
const readAlerts = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { return []; }
};

// Helper: Write Data
const saveAlerts = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const addAlert = (nodeId, severity) => {
    const alerts = readAlerts();
    const location = NODE_LOCATIONS[nodeId] || { lat: 28.6139, lng: 77.2090, name: "Unknown" };
    
    // Check if there is already an ACTIVE alert for this node to avoid spam
    const activeIndex = alerts.findIndex(a => a.nodeId === nodeId && a.status !== 'FIXED');
    
    if (activeIndex !== -1) {
        // Update existing alert timestamp
        alerts[activeIndex].last_seen = new Date().toISOString();
        saveAlerts(alerts);
        return alerts[activeIndex];
    }

    const newAlert = {
        id: Date.now(),
        nodeId,
        lat: location.lat,
        lng: location.lng,
        locationName: location.name,
        severity: severity, // "RED" or "YELLOW"
        status: "ACTIVE", // ACTIVE, FIXED
        isConstruction: false,
        timestamp: new Date().toISOString(),
        last_seen: new Date().toISOString()
    };

    alerts.push(newAlert);
    saveAlerts(alerts);
    return newAlert;
};

const markConstruction = (id) => {
    const alerts = readAlerts();
    const alert = alerts.find(a => a.id === parseInt(id));
    if (alert) {
        alert.isConstruction = true;
        // Prompt says: "After marking - still the location will be red."
        // So we don't change status to FIXED, just tag it.
        saveAlerts(alerts);
        return alert;
    }
    return null;
};

module.exports = { readAlerts, addAlert, markConstruction };