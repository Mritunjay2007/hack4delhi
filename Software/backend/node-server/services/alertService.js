require('dotenv').config(); // Load environment variables
const nodemailer = require('nodemailer');

// --- DEBUGGING: Check if variables are loaded ---
console.log("Checking Email Credentials...");
console.log("USER:", process.env.EMAIL_USER ? "Loaded ✅" : "Missing ❌");
console.log("PASS:", process.env.EMAIL_PASS ? "Loaded ✅" : "Missing ❌");
console.log("RECEIVER:", process.env.ALERT_RECEIVER ? "Loaded ✅" : "Missing ❌");

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("CRITICAL ERROR: Email credentials are missing. Check your .env file.");
}

// 1. Configure Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS  
    }
});

// 2. Anti-Spam Mechanism (Rate Limiting)
const alertCooldowns = new Map();
const COOLDOWN_TIME = 60 * 1000; // 1 Minute

const sendCriticalAlert = async (data) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("Skipping email alert: Missing credentials.");
        return;
    }

    const nodeId = data.node_id || data.nodeId || "UNKNOWN_NODE";
    const now = Date.now();

    if (alertCooldowns.has(nodeId)) {
        const lastAlertTime = alertCooldowns.get(nodeId);
        if (now - lastAlertTime < COOLDOWN_TIME) {
            console.log(`⏳ Email suppressed for ${nodeId} (Cooldown active)`);
            return;
        }
    }

    alertCooldowns.set(nodeId, now);

    // --- NEW: Robust Image Buffer Preparation ---
    let attachments = [];
    if (data.image) {
        // Strip the data URL prefix (handles jpeg, png, etc.)
        const base64Data = data.image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        console.log(`📸 Image Attachment Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

        attachments.push({
            filename: 'evidence.jpg',
            content: imageBuffer,
            cid: 'threatimage' // Link this to the <img src="cid:threatimage" />
        });
    }

    // 3. Compose Email with Image Attachment & AI Reasoning
    const mailOptions = {
        from: `"RailGuard AI System" <${process.env.EMAIL_USER}>`,
        to: process.env.ALERT_RECEIVER,
        subject: `🚨 VISUAL CONFIRMATION: Tampering at ${nodeId}`,
        html: `
            <div style="font-family: Arial, sans-serif; border: 3px solid #dc2626; padding: 20px; max-width: 600px;">
                <h2 style="color: #dc2626; margin-top: 0;">⚠️ VISUAL THREAT CONFIRMED</h2>
                <p style="font-size: 1.1em;"><strong>AI Analysis:</strong> ${data.reason || "Unauthorized activity detected."}</p>
                <p><strong>AI Confidence:</strong> ${data.confidence || 0}%</p>
                <hr style="border: 1px solid #eee;" />
                
                <p><strong>Node ID:</strong> ${nodeId}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Location:</strong> <a href="https://www.google.com/maps?q=${data.latitude || 28.6427},${data.longitude || 77.2207}">View Exact Track Location</a></p>
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0; font-size: 0.9em; color: #64748b;">SENSOR SNAPSHOT:</h3>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        <li>Vibration: <b>${data.accel_mag?.toFixed(3) || 'N/A'} g</b></li>
                        <li>Magnetic Flux: <b>${data.mag_norm?.toFixed(2) || 'N/A'} µT</b></li>
                    </ul>
                </div>

                <div style="text-align: center; margin: 20px 0;">
                    <h3 style="text-align: left; font-size: 1em;">Captured Evidence:</h3>
                    <img src="cid:threatimage" style="width: 100%; border: 2px solid #334155; border-radius: 4px;" alt="Threat Evidence" />
                </div>

                <br />
                <a href="http://localhost:5173" style="display: block; background: #dc2626; color: white; padding: 12px; text-align: center; text-decoration: none; font-weight: bold; border-radius: 6px;">OPEN COMMAND CENTER</a>
            </div>
        `,
        attachments: attachments
    };

    // 4. Send
    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Final AI-Verified Email Alert sent for ${nodeId}`);
    } catch (error) {
        console.error('❌ Failed to send verified email:', error);
    }
};

module.exports = { sendCriticalAlert };