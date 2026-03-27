import React, { useEffect, useState, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import L from "leaflet";
import axios from "axios";
import { io } from "socket.io-client";
import "leaflet/dist/leaflet.css";

// --- IMPORT YOUR LOCAL LOGOS HERE ---
import IRLogo from "../assets/IRLogo.png";
import MakeInIndiaLogo from "../assets/MakeInIndiaLogo.jpeg";

// Fallback Emblem (Online)
const LOGO_EMBLEM =
  "https://www.wirecable.in/wp-content/uploads/2023/07/GOI.jpg";

// --- ICONS & ASSETS ---
const getIcon = (color) =>
  new L.DivIcon({
    className: "custom-marker",
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${
        color === "green"
          ? "#10b981"
          : color === "yellow"
            ? "#f59e0b"
            : color === "red"
              ? "#ef4444"
              : "#64748b"
      }" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); width: 42px; height: 42px; transition: transform 0.2s;">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="#ffffff"></circle>
      </svg>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -42],
  });

const icons = {
  green: getIcon("green"),
  yellow: getIcon("yellow"),
  red: getIcon("red"),
  grey: getIcon("grey"),
};

// --- API CONFIGURATION ---
const NODE_SERVER_URL = "http://localhost:3000";
const API_URL = "http://localhost:3000/api/alerts";

// --- STATION COORDINATES (New Delhi Railway Station) ---
const STATION_LAT = 28.6427;
const STATION_LNG = 77.2207;

export default function Dashboard() {
  const lastVisionTriggerTime = useRef(0);

  // --- STATE ---
  const [mode, setMode] = useState("LIVE");
  const [nodes, setNodes] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());

  // --- VISION STATE (Backend-driven) ---
  const [visionResult, setVisionResult] = useState(null);
  const [visionStatus, setVisionStatus] = useState("idle"); // 'idle' | 'analyzing' | 'done'
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);

  // --- FIX: REFS TO PREVENT CAMERA RESTART LOOPS ---
  const telemetryRef = useRef(telemetry);
  const selectedNodeRef = useRef(selectedNode);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  // UX State
  const [activeTab, setActiveTab] = useState("telemetry");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(50);
  const [history, setHistory] = useState([]);

  // Logging State
  const [systemLogs, setSystemLogs] = useState([
    {
      id: 0,
      time: new Date().toLocaleTimeString(),
      type: "info",
      msg: "System Interface Loaded.",
    },
  ]);

  const addLog = (msg, type = "info") => {
    setSystemLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          time: new Date().toLocaleTimeString(),
          type,
          msg,
        },
        ...prev,
      ].slice(0, 50),
    );
  };

  // --- EFFECT: SOCKET.IO & DATA HANDLING ---
  useEffect(() => {
    setNodes({});
    setAlerts([]);
    setTelemetry([]);
    setSystemLogs([]);
    addLog(`Switched to ${mode} MODE`, "warning");

    // Initial History Fetch
    axios
      .get(`${NODE_SERVER_URL}/api/history`)
      .then((res) => setHistory(res.data))
      .catch(() => console.error("Failed to load history"));

    let socket = null;

    if (mode === "LIVE") {
      socket = io(NODE_SERVER_URL);
      socketRef.current = socket;

      socket.on("connect", () => {
        addLog("Connected to Node.js Data Stream", "success");
      });

      socket.on("disconnect", () => {
        addLog("Disconnected from Backend", "error");
      });

      socket.on("sensor_update", (data) => {
        setLastHeartbeat(Date.now());

        setNodes((prev) => ({
          ...prev,
          [data.node_id]: {
            lat: data.latitude || STATION_LAT,
            lng: data.longitude || STATION_LNG,
            lastSeen: data.timestamp,
            status: data.is_anomaly
              ? data.severity === "CRITICAL"
                ? "red"
                : "yellow"
              : "green",
            battery: 98,
            rssi: -45,
          },
        }));

        setTelemetry((prev) => {
          const newPoint = {
            time: new Date(data.timestamp).toLocaleTimeString(),
            node_id: data.node_id,
            accel_mag: data.accel_mag,
            accel_roll_rms: data.accel_roll_rms || 0,
            mag_norm: data.mag_norm,
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressure,
            mic_level: data.mic_level || 0,
            frequency: data.frequency || 0,
            anomaly_score: data.anomaly_score,
          };
          return [...prev, newPoint].slice(-50);
        });
      });

      socket.on("new_alert", (newAlert) => {
        setAlerts((prev) => {
          if (prev.find((a) => a.id === newAlert.id)) return prev;
          try {
            new Audio("/alert.mp3").play().catch(() => {});
          } catch (e) {}
          return [newAlert, ...prev];
        });

        const now = Date.now();
        const VISION_COOLDOWN = 30000;

        if (["MEDIUM", "HIGH", "CRITICAL"].includes(newAlert.severity)) {
          if (now - lastVisionTriggerTime.current > VISION_COOLDOWN) {
            lastVisionTriggerTime.current = now;
            addLog(
              `🚨 Anomaly ${newAlert.nodeId}: Waking local camera for verification...`,
              "warning",
            );

            setActiveTab("vision");
            setVisionStatus("analyzing");
            setVisionResult(null);

            // Wake the local webcam
            setTimeout(() => setCameraActive(true), 300);
          } else {
            addLog("Vision API is on cooldown to prevent rate limits.", "info");
          }
        }
      });

      socket.on("vision_result", (result) => {
        setVisionResult(result);
        setVisionStatus("done");

        addLog(
          `Vision ML [${result.node_id}]: ${result.reason} (${result.confidence}%)`,
          result.confirmed ? "error" : "success",
        );

        setActiveTab("vision");
      });

      socket.on("vision_verdict", (verdict) => {
        setVisionResult({
          confirmed: verdict.confirmed,
          confidence: verdict.confidence,
          reason: verdict.reason,
          node_id: verdict.node_id,
          timestamp: verdict.timestamp,
        });
        setVisionStatus("done");
        addLog(
          `Backend AI Verdict: ${verdict.reason}`,
          verdict.confirmed ? "error" : "success",
        );
        setActiveTab("vision");
      });

      socket.on("new_detection", (detection) => {
        setHistory((prev) => [detection, ...prev].slice(0, 20));
      });
    } else {
      if (socket) socket.disconnect();
      setNodes({
        "TEST-NODE-01": {
          lat: STATION_LAT,
          lng: STATION_LNG,
          status: "green",
          battery: 98,
          rssi: -45,
        },
        "TEST-NODE-03": {
          lat: STATION_LAT - 0.002,
          lng: STATION_LNG + 0.001,
          status: "yellow",
          battery: 40,
          rssi: -80,
        },
      });
      addLog("Test Mode Initialized.", "info");
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [mode]);

  // --- HYBRID CAMERA & UPLOAD LOGIC ---
  useEffect(() => {
    let stream = null;
    let captureInterval = null;

    const captureAndUpload = async () => {
      if (videoRef.current && canvasRef.current && cameraActive) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Compress to ensure fast upload to backend
        const base64Image = canvas.toDataURL("image/jpeg", 0.6);
        
        // FIX: Pull from refs so we don't trigger re-renders
        const currentTelemetry = telemetryRef.current;
        const currentNode = selectedNodeRef.current;
        const latestReading = currentTelemetry.length > 0 ? currentTelemetry[currentTelemetry.length - 1] : {};

        try {
          addLog(
            "Frame captured. Uploading to Backend AI Orchestrator...",
            "info",
          );

          const res = await axios.post(`${NODE_SERVER_URL}/api/vision`, {
            image_base64: base64Image,
            node_id: currentNode || latestReading.node_id || "TRACK_SEC_42",
            telemetry: latestReading,
            alert_id: `ALT-${Date.now()}`,
          });

          if (res.data.status === "throttled") {
            addLog(
              "Backend AI is busy (Flood Protection). Try again shortly.",
              "warning",
            );
            setVisionStatus("idle");
          }
        } catch (error) {
          addLog(`Failed to upload frame to Backend: ${error.message}`, "error");
          setVisionStatus("idle");
        }
      }
    };

    if (cameraActive) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((mediaStream) => {
          stream = mediaStream;
          if (videoRef.current) videoRef.current.srcObject = stream;

          // Give camera 2s to focus/adjust lighting, then take picture
          captureInterval = setTimeout(captureAndUpload, 2000);

          // Turn off camera shortly after capture to save resources
          setTimeout(() => setCameraActive(false), 5000);
        })
        .catch((err) => {
          console.error("Camera error", err);
          setCameraActive(false);
          setVisionStatus("idle");
          addLog("Local camera access denied.", "error");
        });
    }

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      clearTimeout(captureInterval);
    };
  }, [cameraActive]); // FIX: Removed telemetry and selectedNode to prevent loop!

  // --- SIMULATION MODE LOGIC ---
  useEffect(() => {
    if (mode !== "TEST") return;
    const interval = setInterval(() => {
      const t = Date.now();
      const fakeData = {
        node_id: "TEST-NODE-01",
        timestamp: t,
        lat: STATION_LAT,
        lng: STATION_LNG,
        accel_mag: Math.random() * 0.5,
        mag_norm: 45 + Math.cos(t / 1000) * 5,
        mic_level: Math.random() * 80,
        frequency: 48 + Math.random() * 4,
        temperature: 28,
        humidity: 60,
        pressure: 1013,
      };
      setTelemetry((prev) =>
        [
          ...prev,
          { time: new Date(t).toLocaleTimeString(), ...fakeData },
        ].slice(-50),
      );
    }, 500);
    return () => clearInterval(interval);
  }, [mode]);

  // --- ACTIONS ---
  const fetchAlerts = async () => {
    if (mode === "TEST") return;
    try {
      const res = await axios.get(API_URL);
      const mappedAlerts = res.data.map((a) => ({
        ...a,
        status: a.isConstruction ? "CONSTRUCTION" : a.status || "OPEN",
      }));
      setAlerts(mappedAlerts);
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    }
  };

  const handleResolutionChange = async (alertId, resolution) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: resolution,
              isConstruction: resolution === "CONSTRUCTION",
            }
          : a,
      ),
    );
    addLog(`User Action: Marking alert ${alertId} as ${resolution}`, "info");
    if (mode === "TEST") return;
    try {
      if (resolution === "CONSTRUCTION")
        await axios.post(`${API_URL}/mark-construction`, { id: alertId });
    } catch (err) {
      addLog(`Error syncing with backend`, "error");
    }
  };

  const handleDispatch = (alertId) => {
    addLog(`DISPATCH: Team Alpha sent to Site ID: ${alertId}`, "success");
  };

  // --- DATA PROCESSING ---
  const filteredAlerts = useMemo(() => {
    if (filterStatus === "ALL") return alerts;
    if (filterStatus === "HIGH")
      return alerts.filter((a) => a.severity === "HIGH");
    if (filterStatus === "CONSTRUCTION")
      return alerts.filter((a) => a.status === "CONSTRUCTION");
    if (filterStatus === "CLOSED")
      return alerts.filter((a) => a.status === "CLOSED");
    return alerts;
  }, [alerts, filterStatus]);

  const displayTelemetry = useMemo(() => {
    let data = selectedNode
      ? telemetry.filter((t) => t.node_id === selectedNode)
      : telemetry;
    if (replayMode) {
      const endIndex = Math.floor((replayIndex / 100) * data.length);
      const startIndex = Math.max(0, endIndex - 20);
      return data.slice(startIndex, endIndex);
    }
    return data.slice(-20);
  }, [telemetry, selectedNode, replayMode, replayIndex]);

  const latestEnv =
    displayTelemetry.length > 0
      ? displayTelemetry[displayTelemetry.length - 1]
      : {};
  const currentNode = selectedNode ? nodes[selectedNode] : null;

  // --- DARK THEME STYLES ---
  const styles = {
    container: {
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100%",
      overflow: "hidden",
      fontFamily: "'Inter', system-ui, sans-serif",
      backgroundColor: "#0f172a",
      color: "#e2e8f0",
    },
    header: {
      height: "80px",
      background: "rgba(15, 23, 42, 0.95)",
      borderBottom: "1px solid #334155",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      flexShrink: 0,
      zIndex: 50,
    },
    logoContainer: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      background: "#ffffff",
      padding: "4px 12px",
      borderRadius: "8px",
      marginRight: "16px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      height: "64px",
    },
    statusBadge: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px 12px",
      background: "rgba(16, 185, 129, 0.1)",
      border: "1px solid rgba(16, 185, 129, 0.2)",
      borderRadius: "999px",
    },
    body: {
      display: "flex",
      flex: 1,
      height: "calc(100vh - 80px)",
      overflow: "hidden",
      width: "100%",
    },
    leftPanel: {
      flex: "0 0 35%",
      height: "100%",
      position: "relative",
      borderRight: "1px solid #334155",
      zIndex: 10,
    },
    rightPanel: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#020617",
      overflowY: "auto",
      minWidth: 0,
    },
    kpiRow: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "16px",
      padding: "20px",
    },
    kpiCard: {
      background: "#1e293b",
      padding: "16px",
      borderRadius: "12px",
      border: "1px solid #334155",
      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.2)",
    },
    kpiLabel: {
      fontSize: "0.75rem",
      color: "#94a3b8",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    },
    kpiValue: {
      fontSize: "1.5rem",
      fontWeight: "700",
      color: "#f8fafc",
      marginTop: "8px",
    },
    alertSection: {
      margin: "0 20px 20px 20px",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#1e293b",
      borderRadius: "12px",
      border: "1px solid #334155",
      overflow: "hidden",
      flexShrink: 0,
      maxHeight: "40%",
      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.3)",
    },
    alertHeader: {
      padding: "16px 20px",
      borderBottom: "1px solid #334155",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: "#1e293b",
    },
    filterPill: (active) => ({
      padding: "6px 14px",
      borderRadius: "20px",
      fontSize: "0.75rem",
      fontWeight: "600",
      cursor: "pointer",
      background: active ? "#3b82f6" : "#334155",
      color: "white",
      border: "none",
      marginRight: "8px",
      transition: "all 0.2s",
    }),
    graphSection: {
      padding: "0 20px 20px 20px",
      display: "flex",
      flexDirection: "column",
      flex: 1,
    },
    tabHeader: {
      display: "flex",
      gap: "24px",
      borderBottom: "1px solid #334155",
      marginBottom: "20px",
    },
    tab: (active) => ({
      padding: "0 0 12px 0",
      cursor: "pointer",
      fontSize: "0.9rem",
      fontWeight: "600",
      color: active ? "#60a5fa" : "#94a3b8",
      borderBottom: active ? "3px solid #60a5fa" : "3px solid transparent",
      transition: "color 0.2s",
    }),
    gridContainer: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "20px",
    },
    chartCard: {
      background: "#1e293b",
      borderRadius: "12px",
      padding: "20px",
      border: "1px solid #334155",
      height: "280px",
      display: "flex",
      flexDirection: "column",
    },
    footer: {
      height: "160px",
      backgroundColor: "#020617",
      color: "#cbd5e1",
      display: "flex",
      flexDirection: "column",
      borderTop: "1px solid #334155",
      flexShrink: 0,
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      zIndex: 60,
    },
    consoleBody: {
      flex: 1,
      overflowY: "auto",
      padding: "12px 20px",
      fontSize: "0.8rem",
      lineHeight: "1.6",
    },
    modeSelect: {
      padding: "8px 16px",
      borderRadius: "8px",
      border: "1px solid #475569",
      background: "#0f172a",
      color: "white",
      fontWeight: "bold",
      cursor: "pointer",
      outline: "none",
    },
    statusSelect: {
      padding: "6px 10px",
      borderRadius: "6px",
      border: "1px solid #475569",
      fontSize: "0.75rem",
      color: "#e2e8f0",
      cursor: "pointer",
      background: "#334155",
      outline: "none",
    },
    historyItem: (confirmed) => ({
      padding: "10px",
      borderRadius: "8px",
      background: "#1e293b",
      borderLeft: confirmed ? "4px solid #ef4444" : "4px solid #10b981",
      marginBottom: "10px",
    }),
  };

  return (
    <div style={styles.container}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100vw; height: 100vh; max-width: none; padding: 0; margin: 0; overflow: hidden; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .status-dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); } 70% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .leaflet-container { background: #cbd5e1; }
        .btn-action { padding: 6px 12px; border: none; background: #3b82f6; border-radius: 6px; font-size: 0.75rem; font-weight: 600; color: white; cursor: pointer; transition: all 0.2s; }
        .btn-action:hover { background: #2563eb; transform: translateY(-1px); }
        .btn-dispatch { background: #dc2626; color: white; margin-left: 8px; }
        .btn-dispatch:hover { background: #b91c1c; }
        input[type=range] { width: 120px; cursor: pointer; accent-color: #3b82f6; }
        .custom-marker { background: transparent; border: none; }
        .custom-marker svg:hover { transform: scale(1.1); }
        .vision-analyzing-ring {
          width: 80px; height: 80px;
          border: 3px solid #334155;
          border-top-color: #f59e0b;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      `}</style>

      {/* HEADER WITH OFFICIAL LOGOS */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={styles.logoContainer}>
            <img
              src={LOGO_EMBLEM}
              alt="Government of India"
              style={{ height: "100%", width: "auto" }}
            />
            <div
              style={{ width: "1px", height: "40px", background: "#cbd5e1" }}
            ></div>
            <img
              src={IRLogo}
              alt="Indian Railways"
              style={{ height: "60px", width: "auto" }}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://via.placeholder.com/50";
              }}
            />
          </div>

          <div>
            <h1
              style={{
                fontSize: "1.4rem",
                fontWeight: "800",
                letterSpacing: "-0.02em",
                color: "#f8fafc",
                margin: 0,
                lineHeight: 1,
              }}
            >
              RailGuard Command
            </h1>
            <div
              style={{
                fontSize: "0.7rem",
                color: "#94a3b8",
                fontWeight: "600",
                marginTop: "4px",
                letterSpacing: "0.05em",
              }}
            >
              MINISTRY OF RAILWAYS | RDSO COMPLIANT
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              background: "white",
              padding: "4px 12px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              height: "55px",
            }}
          >
            <img
              src={MakeInIndiaLogo}
              alt="Make In India"
              style={{ height: "100%", width: "auto" }}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://via.placeholder.com/50";
              }}
            />
          </div>

          <div
            style={{ width: "1px", height: "30px", background: "#475569" }}
          ></div>

          <select
            style={styles.modeSelect}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="LIVE">LIVE SENSORS</option>
            <option value="TEST">TEST MODE (SIM)</option>
          </select>

          {mode === "TEST" && (
            <button
              style={{
                padding: "8px 16px",
                background: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                cursor: "pointer",
                boxShadow: "0 0 10px rgba(239, 68, 68, 0.5)",
              }}
              onClick={() => {
                try {
                  new Audio("/alert.mp3").play().catch(() => {});
                } catch (e) {}

                const fakeAlert = {
                  id: `TEST-${Date.now()}`,
                  nodeId: "TEST-NODE-01",
                  severity: "CRITICAL",
                  lat: STATION_LAT,
                  lng: STATION_LNG,
                  status: "OPEN",
                  timestamp: Date.now(),
                };

                setAlerts((prev) => [fakeAlert, ...prev]);
                setNodes((prev) => ({
                  ...prev,
                  "TEST-NODE-01": { ...prev["TEST-NODE-01"], status: "red" },
                }));

                // Trigger real webcam + backend flow
                setActiveTab("vision");
                setVisionStatus("analyzing");
                setVisionResult(null);
                setCameraActive(true); 
                addLog(
                  "Simulating threat. Activating local camera for Backend AI processing...",
                  "warning",
                );
              }}
            >
              🚨 SIMULATE THREAT
            </button>
          )}

          <div style={styles.statusBadge}>
            <div
              className="status-dot"
              style={{ background: mode === "LIVE" ? "#10b981" : "#f59e0b" }}
            ></div>
            <span
              style={{
                fontSize: "0.8rem",
                color: mode === "LIVE" ? "#10b981" : "#f59e0b",
                fontWeight: "700",
              }}
            >
              {mode === "LIVE" ? "SYSTEM ACTIVE" : "SIMULATION"}
            </span>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div style={styles.body}>
        {/* LEFT: MAP */}
        <div style={styles.leftPanel}>
          <MapContainer
            center={[STATION_LAT, STATION_LNG]}
            zoom={16}
            zoomControl={false}
            style={{ height: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap"
              maxZoom={19}
            />
            <TileLayer
              url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
              attribution="&copy; OpenRailwayMap"
              maxZoom={19}
            />

            {filteredAlerts.map((alert) => (
              <Marker
                key={`alert-${alert.id}`}
                position={[alert.lat || 0, alert.lng || 0]}
                icon={icons.red}
              >
                <Popup className="custom-popup">
                  <div
                    style={{
                      fontFamily: "Inter, sans-serif",
                      color: "#1e293b",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ fontSize: "1.2rem" }}>🚨</span>
                      <b style={{ color: "#ef4444", fontSize: "1rem" }}>
                        THREAT DETECTED
                      </b>
                    </div>
                    <div style={{ fontSize: "0.85rem", marginBottom: "4px" }}>
                      <b>Node:</b> {alert.nodeId}
                    </div>
                    <div style={{ fontSize: "0.85rem", marginBottom: "8px" }}>
                      <b>Severity:</b>{" "}
                      <span style={{ fontWeight: "bold", color: "#ef4444" }}>
                        {alert.severity}
                      </span>
                    </div>
                    {alert.reasons && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          marginBottom: "8px",
                          fontStyle: "italic",
                          color: "#64748b",
                        }}
                      >
                        {alert.reasons}
                      </div>
                    )}
                    <hr
                      style={{
                        margin: "8px 0",
                        borderTop: "1px solid #e2e8f0",
                      }}
                    />
                    {alert.status === "CONSTRUCTION" ? (
                      <div
                        style={{
                          background: "#fef3c7",
                          padding: "6px",
                          borderRadius: "6px",
                          color: "#b45309",
                          fontSize: "0.75rem",
                          textAlign: "center",
                          fontWeight: "600",
                        }}
                      >
                        Construction Verified
                      </div>
                    ) : alert.status === "CLOSED" ? (
                      <div
                        style={{
                          background: "#dcfce7",
                          padding: "6px",
                          borderRadius: "6px",
                          color: "#166534",
                          fontSize: "0.75rem",
                          textAlign: "center",
                          fontWeight: "600",
                        }}
                      >
                        Resolved / Closed
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <label
                          style={{
                            fontSize: "0.75rem",
                            color: "#64748b",
                            fontWeight: "600",
                          }}
                        >
                          IMMEDIATE ACTION:
                        </label>
                        <select
                          style={{
                            padding: "6px",
                            borderRadius: "4px",
                            border: "1px solid #cbd5e1",
                            cursor: "pointer",
                            width: "100%",
                          }}
                          onChange={(e) =>
                            handleResolutionChange(alert.id, e.target.value)
                          }
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Select Resolution...
                          </option>
                          <option value="CONSTRUCTION">
                            🚧 Verify Construction
                          </option>
                          <option value="CLOSED">Close Alert</option>
                        </select>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
            {Object.entries(nodes).map(([id, node]) => (
              <Marker
                key={id}
                position={[node.lat || 0, node.lng || 0]}
                icon={icons[node.status] || icons.green}
                eventHandlers={{ click: () => setSelectedNode(id) }}
              />
            ))}
          </MapContainer>
        </div>

        {/* RIGHT: DATA */}
        <div style={styles.rightPanel}>
          {/* 1. KPI CARDS */}
          <div style={styles.kpiRow}>
            <div style={styles.kpiCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={styles.kpiLabel}>System Uptime</div>
                <div style={{ color: "#10b981" }}>●</div>
              </div>
              <div style={{ ...styles.kpiValue, color:  "#10b981" }}>
                99.98%
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={styles.kpiLabel}>Active Nodes</div>
                <div style={{ color: "#3b82f6" }}>●</div>
              </div>
              <div style={{ ...styles.kpiValue, color: "#60a5fa" }}>
                {Object.keys(nodes).length}{" "}
                <span style={{ fontSize: "0.9rem", color: "#64748b" }}>
                  / {Object.keys(nodes).length + 2}
                </span>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={styles.kpiLabel}>Max Impact</div>
                <div style={{ color: "#f59e0b" }}>●</div>
              </div>
              <div style={{ ...styles.kpiValue, color:  "#f8fafc" }}>
                {latestEnv.accel_mag ? latestEnv.accel_mag.toFixed(3) : "0.00"}{" "}
                <span style={{ fontSize: "0.9rem", color: "#64748b" }}>g</span>
              </div>
            </div>
          </div>

          {/* 2. ALERTS */}
          <div style={styles.alertSection}>
            <div style={styles.alertHeader}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <span
                  style={{
                    fontWeight: "700",
                    fontSize: "0.9rem",
                    color: "#f1f5f9",
                  }}
                >
                  INCIDENT FEED
                </span>
                {filteredAlerts.length > 0 && (
                  <span
                    style={{
                      background: "rgba(239, 68, 68, 0.2)",
                      color: "#fca5a5",
                      fontSize: "0.7rem",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontWeight: "700",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                    }}
                  >
                    {filteredAlerts.length} ACTIVE
                  </span>
                )}
              </div>
              <div>
                {["ALL", "HIGH", "CONSTRUCTION", "CLOSED"].map((filter) => (
                  <button
                    key={filter}
                    style={styles.filterPill(filterStatus === filter)}
                    onClick={() => setFilterStatus(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead
                  style={{
                    background: "#1e293b",
                    position: "sticky",
                    top: 0,
                    zIndex: 5,
                  }}
                >
                  <tr>
                    {["TIME", "NODE ID", "LOCATION", "SEVERITY", "RESPONSE"].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 4 ? "right" : "left",
                          padding: "12px 20px",
                          fontSize: "0.7rem",
                          color: "#64748b",
                          borderBottom: "1px solid #334155",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid #334155",
                        background:
                          alert.status === "CONSTRUCTION"
                            ? "rgba(245, 158, 11, 0.1)"
                            : alert.status === "CLOSED"
                              ? "rgba(16, 185, 129, 0.05)"
                              : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: "12px 20px",
                          fontSize: "0.8rem",
                          color: "#cbd5e1",
                        }}
                      >
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </td>
                      <td
                        style={{
                          padding: "12px 20px",
                          fontSize: "0.85rem",
                          fontWeight: "600",
                          color: "#f8fafc",
                        }}
                      >
                        {alert.nodeId}
                      </td>
                      <td
                        style={{
                          padding: "12px 20px",
                          fontSize: "0.8rem",
                          fontFamily: "monospace",
                          color: "#94a3b8",
                        }}
                      >
                        {Number(alert.lat).toFixed(3)},{" "}
                        {Number(alert.lng).toFixed(3)}
                      </td>
                      <td style={{ padding: "12px 20px" }}>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "0.7rem",
                            fontWeight: "bold",
                            background: ["MEDIUM", "HIGH", "CRITICAL"].includes(
                              alert.severity,
                            )
                              ? "rgba(239, 68, 68, 0.2)"
                              : "rgba(245, 158, 11, 0.2)",
                            color: ["MEDIUM", "HIGH", "CRITICAL"].includes(
                              alert.severity,
                            )
                              ? "#fca5a5"
                              : "#fcd34d",
                            border: `1px solid ${["MEDIUM", "HIGH", "CRITICAL"].includes(alert.severity) ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                          }}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td style={{ padding: "12px 20px", textAlign: "right" }}>
                        {alert.status === "CONSTRUCTION" ? (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "#f59e0b",
                              fontWeight: "600",
                            }}
                          >
                            🚧 Verified Const.
                          </span>
                        ) : alert.status === "CLOSED" ? (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "#10b981",
                              fontWeight: "600",
                            }}
                          >
                            ✅ Incident Closed
                          </span>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: "8px",
                            }}
                          >
                            <select
                              style={styles.statusSelect}
                              onChange={(e) =>
                                handleResolutionChange(alert.id, e.target.value)
                              }
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Action ▼
                              </option>
                              <option value="CONSTRUCTION">
                                🚧 Verify Construction
                              </option>
                              <option value="CLOSED">✅ Close Alert</option>
                            </select>
                            <button
                              className="btn-action btn-dispatch"
                              onClick={() => handleDispatch(alert.id)}
                            >
                              DISPATCH
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAlerts.length === 0 && (
                    <tr>
                      <td
                        colSpan="5"
                        style={{
                          textAlign: "center",
                          padding: "40px",
                          color: "#64748b",
                          fontSize: "0.9rem",
                        }}
                      >
                        No active alerts. System nominal.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. TABS & GRAPHS */}
          <div style={styles.graphSection}>
            <div style={styles.tabHeader}>
              <span
                style={styles.tab(activeTab === "telemetry")}
                onClick={() => setActiveTab("telemetry")}
              >
                LIVE TELEMETRY
              </span>
              <span
                style={styles.tab(activeTab === "health")}
                onClick={() => setActiveTab("health")}
              >
                DEVICE HEALTH
              </span>
              <span
                style={styles.tab(activeTab === "vision")}
                onClick={() => setActiveTab("vision")}
              >
                VISION FEED (AI)
                {visionStatus === "analyzing" && (
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: "8px",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#f59e0b",
                      animation: "pulse 1s infinite",
                      verticalAlign: "middle",
                    }}
                  />
                )}
              </span>
              <span
                style={styles.tab(activeTab === "history")}
                onClick={() => setActiveTab("history")}
              >
                DETECTION HISTORY
              </span>
              
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "#64748b",
                    fontWeight: "600",
                  }}
                >
                  PLAYBACK:
                </span>
                <input
                  type="checkbox"
                  checked={replayMode}
                  onChange={(e) => setReplayMode(e.target.checked)}
                  style={{ accentColor: "#3b82f6" }}
                />
                {replayMode && (
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={replayIndex}
                    onChange={(e) => setReplayIndex(e.target.value)}
                    style={{ width: "100px" }}
                  />
                )}
              </div>
            </div>

            {activeTab === "telemetry" ? (
              <div style={styles.gridContainer}>
                {/* 1. VIBRATION */}
                <div style={styles.chartCard}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        color: "#94a3b8",
                      }}
                    >
                      VIBRATION MAGNITUDE
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#60a5fa" }}>
                      ACCELEROMETER
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayTelemetry}>
                      <CartesianGrid
                        stroke="#334155"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis dataKey="time" hide />
                      <YAxis
                        width={30}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderRadius: "8px",
                          border: "1px solid #334155",
                          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                          color: "#f8fafc",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="accel_mag"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* 2. MAGNETIC */}
                <div style={styles.chartCard}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        color: "#94a3b8",
                      }}
                    >
                      MAGNETIC FLUX (µT)
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#f59e0b" }}>
                      MAGNETOMETER
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayTelemetry}>
                      <CartesianGrid
                        stroke="#334155"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis dataKey="time" hide />
                      <YAxis
                        width={30}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        domain={["auto", "auto"]}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderRadius: "8px",
                          border: "1px solid #334155",
                          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                          color: "#f8fafc",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="mag_norm"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* 3. SOUND MONITOR */}
                <div style={styles.chartCard}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        color: "#94a3b8",
                      }}
                    >
                      ACOUSTIC NOISE (dB)
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#3b82f6" }}>
                      MICROPHONE
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={displayTelemetry}>
                      <defs>
                        <linearGradient
                          id="colorMic"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3b82f6"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3b82f6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="#334155"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis dataKey="time" hide />
                      <YAxis
                        domain={[0, 100]}
                        width={30}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderRadius: "8px",
                          border: "1px solid #334155",
                          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                          color: "#f8fafc",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="mic_level"
                        stroke="#3b82f6"
                        fillOpacity={1}
                        fill="url(#colorMic)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 4. FREQUENCY MONITOR */}
                <div style={styles.chartCard}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        color: "#94a3b8",
                      }}
                    >
                      VIBRATION FREQUENCY (Hz)
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#8b5cf6" }}>
                      SPECTRAL ANALYSIS
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={displayTelemetry}>
                      <defs>
                        <linearGradient
                          id="colorFreq"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8b5cf6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="#334155"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis dataKey="time" hide />
                      <YAxis
                        domain={["auto", "auto"]}
                        width={30}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderRadius: "8px",
                          border: "1px solid #334155",
                          boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                          color: "#f8fafc",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="frequency"
                        stroke="#8b5cf6"
                        fillOpacity={1}
                        fill="url(#colorFreq)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : activeTab === "health" ? (
              <div style={styles.gridContainer}>
                <div style={styles.chartCard}>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: "700",
                      color: "#94a3b8",
                      marginBottom: "10px",
                    }}
                  >
                    TRACK TEMPERATURE
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[latestEnv]} layout="vertical">
                      <CartesianGrid stroke="#334155" horizontal={false} />
                      <XAxis type="number" domain={[0, 60]} hide />
                      <YAxis
                        type="category"
                        dataKey="temperature"
                        width={1}
                        hide
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid #334155",
                        }}
                      />
                      <Bar
                        dataKey="temperature"
                        barSize={40}
                        radius={[0, 4, 4, 0]}
                      >
                        {[latestEnv].map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.temperature > 45 ? "#ef4444" : "#10b981"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div
                    style={{
                      textAlign: "center",
                      marginTop: "10px",
                      fontSize: "1.2rem",
                      color: "#f8fafc",
                    }}
                  >
                    {latestEnv.temperature?.toFixed(1)}°C{" "}
                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      / CRITICAL: 45°C
                    </span>
                  </div>
                </div>
                <div style={styles.chartCard}>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: "700",
                      color: "#94a3b8",
                      marginBottom: "10px",
                    }}
                  >
                    NODE STATUS
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                      marginTop: "10px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "5px",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                          Battery Level
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "#10b981" }}>
                          {currentNode?.battery || 85}%
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          background: "#334155",
                          borderRadius: "4px",
                        }}
                      >
                        <div
                          style={{
                            width: `${currentNode?.battery || 85}%`,
                            height: "100%",
                            background: "#10b981",
                            borderRadius: "4px",
                            boxShadow: "0 0 10px rgba(16,185,129,0.3)",
                          }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "5px",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                          Signal Strength (RSSI)
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "#3b82f6" }}>
                          Good
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          background: "#334155",
                          borderRadius: "4px",
                        }}
                      >
                        <div
                          style={{
                            width: "70%",
                            height: "100%",
                            background: "#3b82f6",
                            borderRadius: "4px",
                            boxShadow: "0 0 10px rgba(59,130,246,0.3)",
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === "vision" ? (
              /* --- VISION UI: RESULTS DISPLAY + PIP CAMERA --- */
              <div
                style={{
                  ...styles.chartCard,
                  height: "400px",
                  position: "relative",
                  border:
                    visionStatus === "analyzing"
                      ? "2px solid #f59e0b"
                      : visionResult?.confirmed
                        ? "2px solid #ef4444"
                        : visionResult
                          ? "2px solid #10b981"
                          : "1px solid #334155",
                  transition: "border-color 0.4s ease",
                }}
              >
                <canvas ref={canvasRef} style={{ display: "none" }} />
                
                {/* Picture-in-Picture Local Camera Feed */}
                {cameraActive && (
                  <div style={{ position: "absolute", top: 10, right: 10, width: "150px", height: "100px", borderRadius: "8px", overflow: "hidden", border: "2px solid #3b82f6", zIndex: 10 }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: 0, background: "rgba(0,0,0,0.6)", width: "100%", fontSize: "0.6rem", textAlign: "center", color: "white", padding: "2px" }}>Capturing...</div>
                  </div>
                )}

                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "0.85rem",
                      fontWeight: "700",
                      color:
                        visionStatus === "analyzing"
                          ? "#f59e0b"
                          : visionResult?.confirmed
                            ? "#ef4444"
                            : visionResult
                              ? "#10b981"
                              : "#94a3b8",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background:
                          visionStatus === "analyzing"
                            ? "#f59e0b"
                            : visionResult?.confirmed
                              ? "#ef4444"
                              : visionResult
                                ? "#10b981"
                                : "#475569",
                        animation:
                          visionStatus === "analyzing"
                            ? "pulse 1s infinite"
                            : "none",
                      }}
                    />
                    BACKEND VISION ANALYSIS
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginRight: cameraActive ? "160px" : "0" }}>
                    GEMINI 1.5 FLASH (VLM) — SERVER-SIDE
                  </div>
                </div>

                {/* Content area */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: "24px",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: "10px",
                    padding: "32px",
                  }}
                >
                  {visionStatus === "idle" && (
                    <div
                      style={{
                        color: "#475569",
                        textAlign: "center",
                        fontFamily: "monospace",
                      }}
                    >
                      <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>
                        🔍
                      </div>
                      <div style={{ fontSize: "0.9rem", color: "#64748b" }}>
                        Awaiting threat detection
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#334155",
                          marginTop: "6px",
                        }}
                      >
                        Vision analysis runs automatically on the backend
                        <br />
                        when a MEDIUM / HIGH / CRITICAL alert is triggered.
                      </div>
                    </div>
                  )}

                  {visionStatus === "analyzing" && (
                    <div style={{ textAlign: "center" }}>
                      <div
                        className="vision-analyzing-ring"
                        style={{ margin: "0 auto 20px" }}
                      />
                      <div
                        style={{
                          fontSize: "1rem",
                          fontWeight: "700",
                          color: "#f59e0b",
                          marginBottom: "8px",
                        }}
                      >
                        ANALYSIS IN PROGRESS
                      </div>
                      <div
                        style={{ fontSize: "0.8rem", color: "#64748b", fontFamily: "monospace" }}
                      >
                        Uploading local frame to Backend orchestrator...
                        <br />
                        Sending to Gemini VLM for inference...
                      </div>
                    </div>
                  )}

                  {visionStatus === "done" && visionResult && (
                    <div style={{ width: "100%", textAlign: "center" }}>
                      {/* Main verdict banner */}
                      <div
                        style={{
                          background: visionResult.confirmed
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(16, 185, 129, 0.15)",
                          border: `1px solid ${visionResult.confirmed ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.4)"}`,
                          borderRadius: "10px",
                          padding: "20px 28px",
                          marginBottom: "20px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.8rem",
                            marginBottom: "8px",
                          }}
                        >
                          {visionResult.confirmed ? "⚠️" : "✅"}
                        </div>
                        <div
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: "800",
                            color: visionResult.confirmed ? "#fca5a5" : "#6ee7b7",
                            letterSpacing: "0.05em",
                            marginBottom: "6px",
                          }}
                        >
                          {visionResult.confirmed
                            ? "THREAT VISUALLY CONFIRMED"
                            : "VISUAL CHECK CLEAR"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#94a3b8",
                            fontStyle: "italic",
                          }}
                        >
                          "{visionResult.reason}"
                        </div>
                      </div>

                      {/* Meta row */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          gap: "32px",
                          fontSize: "0.8rem",
                          color: "#64748b",
                        }}
                      >
                        <div>
                          <span style={{ color: "#94a3b8", fontWeight: "600" }}>
                            AI CONFIDENCE
                          </span>
                          <br />
                          <span
                            style={{
                              fontSize: "1.2rem",
                              fontWeight: "700",
                              color: visionResult.confirmed ? "#fca5a5" : "#6ee7b7",
                            }}
                          >
                            {visionResult.confidence}%
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "#94a3b8", fontWeight: "600" }}>
                            NODE
                          </span>
                          <br />
                          <span
                            style={{
                              fontSize: "1rem",
                              fontWeight: "700",
                              color: "#f8fafc",
                              fontFamily: "monospace",
                            }}
                          >
                            {visionResult.node_id}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "#94a3b8", fontWeight: "600" }}>
                            ANALYSED AT
                          </span>
                          <br />
                          <span
                            style={{
                              fontSize: "0.9rem",
                              fontWeight: "600",
                              color: "#cbd5e1",
                              fontFamily: "monospace",
                            }}
                          >
                            {visionResult.timestamp
                              ? new Date(visionResult.timestamp).toLocaleTimeString()
                              : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Dismiss / Reset */}
                      <button
                        style={{
                          marginTop: "20px",
                          padding: "8px 20px",
                          background: "#1e293b",
                          border: "1px solid #334155",
                          borderRadius: "6px",
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          fontWeight: "600",
                        }}
                        onClick={() => {
                          setVisionResult(null);
                          setVisionStatus("idle");
                        }}
                      >
                        CLEAR RESULT
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === "history" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "15px",
                  maxHeight: "500px",
                  overflowY: "auto",
                }}
              >
                {history.length > 0 ? (
                  history.map((item) => (
                    <div
                      key={item.id}
                      style={styles.historyItem(item.confirmed)}
                    >
                      <img
                        src={item.imageUrl}
                        alt="Forensic"
                        style={{
                          width: "100%",
                          height: "120px",
                          objectFit: "cover",
                          borderRadius: "4px",
                        }}
                      />
                      <div style={{ marginTop: "10px", fontSize: "0.75rem" }}>
                        <p>
                          <strong>Node:</strong> {item.node_id} |{" "}
                          <strong>Confidence:</strong> {item.confidence}%
                        </p>
                        <p
                          style={{
                            color: "#94a3b8",
                            fontStyle: "italic",
                            marginTop: "4px",
                          }}
                        >
                          "{item.reason}"
                        </p>
                        <p style={{ marginTop: "5px", color: "#60a5fa" }}>
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      gridColumn: "1/3",
                      textAlign: "center",
                      padding: "40px",
                    }}
                  >
                    No forensic logs recorded.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div
          style={{
            padding: "8px 24px",
            background: "#020617",
            fontSize: "0.75rem",
            fontWeight: "bold",
            color: "#64748b",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{">"}_ SYSTEM CONSOLE OUTPUT</span>
          <span style={{ color: "#10b981" }}>
            ● SECURE CONNECTION ESTABLISHED
          </span>
        </div>
        <div style={styles.consoleBody} className="console-logs">
          {systemLogs.map((log) => (
            <div
              key={log.id}
              style={{
                marginBottom: "6px",
                display: "flex",
                gap: "12px",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <span style={{ color: "#475569" }}>[{log.time}]</span>
              <span
                style={{
                  color:
                    log.type === "error"
                      ? "#ef4444"
                      : log.type === "warning"
                        ? "#f59e0b"
                        : log.type === "success"
                          ? "#10b981"
                          : "#cbd5e1",
                }}
              >
                {log.type === "error"
                  ? "✖ "
                  : log.type === "success"
                    ? "✔ "
                    : "ℹ "}
                {log.msg}
              </span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}