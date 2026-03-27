require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const alertCooldowns = new Map();
const COOLDOWN_TIME = 60 * 1000;

const sendVlmAlert = async (data, isThreat) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

    const nodeId = data.node_id || "SYSTEM_NODE";
    const now = Date.now();

    if (alertCooldowns.has(nodeId)) {
        if (now - alertCooldowns.get(nodeId) < COOLDOWN_TIME) return;
    }
    alertCooldowns.set(nodeId, now);

    // Get coordinates (handling multiple possible naming conventions)
    const lat = data.lat || data.latitude || "28.6427";
    const lng = data.lng || data.longitude || "77.2207";
    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:5173";

    const config = isThreat ? {
        subject: `URGENT: Security Breach Notification - Node ${nodeId}`,
        header: "SECURITY BREACH DETECTED",
        color: "#b91c1c", // Dark Red
        status: "IMMEDIATE ATTENTION REQUIRED"
    } : {
        subject: `Status Update: Security Check Clear - Node ${nodeId}`,
        header: "OPERATIONAL STATUS: SECURE",
        color: "#15803d", // Dark Green
        status: "NO ACTION REQUIRED"
    };

    const mailOptions = {
        from: `"RailGuard Security" <${process.env.EMAIL_USER}>`,
        to: process.env.ALERT_RECEIVER,
        subject: config.subject,
        html: `
            <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; border: 1px solid #e2e8f0; margin: auto; border-radius: 8px; overflow: hidden;">
                <div style="background-color: ${config.color}; color: white; padding: 20px; font-weight: bold; font-size: 18px; text-align: center;">
                    ${config.header}
                </div>
                
                <div style="padding: 25px; line-height: 1.6;">
                    <p style="margin-top: 0;">This report confirms a monitoring assessment at <b>Node ${nodeId}</b>.</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Current Status</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: ${config.color}; text-align: right;">${config.status}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Event Timestamp</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">${new Date().toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;">GPS Coordinates</td>
                            <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">${lat}, ${lng}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; color: #64748b;">Observations</td>
                            <td style="padding: 10px; text-align: right;">${data.reason || "Routine scan completed."}</td>
                        </tr>
                    </table>

                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #f1f5f9;">
                        <a href="${mapUrl}" style="display: inline-block; background-color: #475569; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 5px; font-size: 14px;">
                            📍 VIEW INCIDENT MAP
                        </a>
                        <a href="${dashboardUrl}" style="display: inline-block; background-color: ${config.color}; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 5px; font-size: 14px;">
                            🖥️ OPEN DASHBOARD
                        </a>
                    </div>

                    <p style="font-size: 11px; color: #94a3b8; margin-top: 30px; text-align: center;">
                        Confidential Security Report | RailGuard Autonomous Monitoring System
                    </p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Formal Report Sent: ${isThreat ? 'Threat Alert' : 'Status Clear'}`);
    } catch (error) {
        console.error('❌ Mail System Error:', error.message);
    }
};

module.exports = { sendVlmAlert };