import React, { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import L from "leaflet";
import io from "socket.io-client";
import axios from "axios"; 
import "leaflet/dist/leaflet.css";

// --- ICONS ---
const getIcon = (color) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers-default/${color}-marker.png`,
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

const icons = {
  green: getIcon("green"),
  yellow: getIcon("yellow"),
  red: getIcon("red"),
  grey: getIcon("grey"),
};

const socket = io("http://localhost:3000");
const API_URL = "http://localhost:3000/api/alerts";

export default function Dashboard() {
  const [nodes, setNodes] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    fetchAlerts();

    socket.on("sensor_update", (data) => {
      setNodes((prev) => ({
        ...prev,
        [data.node_id]: {
          lat: data.latitude,
          lng: data.longitude,
          alt: data.altitude,
          lastSeen: data.timestamp,
          status: data.severity || "green",
        },
      }));

      setTelemetry((prev) => {
        const newData = [
          ...prev,
          {
            time: new Date(data.timestamp).toLocaleTimeString(),
            node_id: data.node_id,
            accel_mag: data.accel_mag,
            accel_roll_rms: data.accel_roll_rms,
            mag_norm: data.mag_norm,
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressure,
          },
        ];
        return newData.slice(-50); 
      });
    });

    socket.on("new_alert", (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev]);
      setNodes((prev) => ({
        ...prev,
        [newAlert.nodeId]: {
          ...prev[newAlert.nodeId],
          status: newAlert.severity === "HIGH" ? "red" : "yellow",
        },
      }));
    });

    socket.on("alert_update", (updatedAlert) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a))
      );
    });

    return () => {
      socket.off("sensor_update");
      socket.off("new_alert");
      socket.off("alert_update");
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const res = await axios.get(API_URL);
      setAlerts(res.data);
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    }
  };

  const handleMarkConstruction = async (alertId) => {
    try {
      await axios.post(`${API_URL}/mark-construction`, { id: alertId });
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const graphData = useMemo(() => {
    if (!selectedNode) return telemetry;
    return telemetry.filter((t) => t.node_id === selectedNode);
  }, [telemetry, selectedNode]);

  const latestEnv = graphData.length > 0 ? graphData[graphData.length - 1] : {};

  // --- STYLES ---
  const styles = {
    container: {
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100%", // Changed to 100% to avoid scrollbar issues
      overflow: "hidden",
      fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
      backgroundColor: "#f8fafc",
    },
    header: {
      height: "50px",
      backgroundColor: "#0f172a",
      color: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 20px",
      flexShrink: 0,
      zIndex: 50,
    },
    body: {
      display: "flex",
      flex: 1, 
      height: "calc(100vh - 50px)",
      overflow: "hidden",
      width: "100%",
    },
    
    // --- LEFT PANEL (Fixed Map) ---
    leftPanel: {
      flex: "0 0 35%", // Keeps map at exactly 35%
      height: "100%",
      position: "relative",
      borderRight: "1px solid #e5e7eb",
    },

    // --- RIGHT PANEL (Dynamic Fill) ---
    rightPanel: {
      flex: 1, // FIX: This forces it to fill ALL remaining space
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: "#f8fafc",
      overflowY: "auto",
      minWidth: 0, // Prevents flex item from overflowing
    },

    // --- ALERTS ---
    alertSection: {
      maxHeight: "400px", 
      display: "flex",
      flexDirection: "column",
      backgroundColor: "white",
      borderBottom: "1px solid #e5e7eb",
    },
    alertHeader: {
      padding: "10px 15px",
      borderBottom: "1px solid #eee",
      fontWeight: "bold",
      display: "flex",
      justifyContent: "space-between",
      background: "white",
      position: "sticky",
      top: 0,
      zIndex: 10,
    },
    alertTableWrapper: {
      overflow: "auto",
      maxHeight: "350px", 
    },

    // --- GRAPHS ---
    graphSection: {
      padding: "20px",
      display: "flex",
      flexDirection: "column",
    },
    graphTitle: {
      marginBottom: "15px",
      fontSize: "1rem",
      fontWeight: "bold",
      color: "#475569",
    },
    gridContainer: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr", 
      gap: "20px",
      width: "100%",
    },
    card: {
      background: "white",
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      padding: "15px",
      display: "flex",
      flexDirection: "column",
      height: "300px", 
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
    envCard: {
      background: "white",
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      padding: "15px",
      display: "flex",
      flexDirection: "column",
      height: "300px", 
      gridColumn: "1 / -1", 
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    },
  };

  return (
    <div style={styles.container}>
      {/* GLOBAL RESET */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; width: 100%; overflow: hidden; }
        .leaflet-container { height: 100% !important; width: 100% !important; }
      `}</style>

      <header style={styles.header}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: "bold", margin: 0 }}>
          🚄 RailGuard Command Center
        </h1>
        <div style={{ fontSize: "0.9rem" }}>
          Status:{" "}
          <span style={{ color: "#4ade80", fontWeight: "bold" }}>
            MONITORING
          </span>
        </div>
      </header>

      <div style={styles.body}>
        {/* LEFT: MAP (35%) */}
        <div style={styles.leftPanel}>
            <MapContainer 
              center={[28.6139, 77.209]} 
              zoom={13}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap"
              />
              
              {alerts.map((alert) => (
                <Marker
                    key={`alert-${alert.id}`}
                    position={[alert.lat || 0, alert.lng || 0]}
                    icon={icons.red}
                >
                    <Popup>
                        <div style={{minWidth: '150px'}}>
                            <b style={{color: 'red'}}>🚨 {alert.nodeId}</b><br/>
                            Severity: {alert.severity}<br/>
                            <hr style={{margin: '5px 0'}}/>
                            {alert.isConstruction ? (
                                <div style={{background: '#fef3c7', padding: '5px', borderRadius: '4px', fontSize: '0.8rem', color: '#92400e'}}>
                                    🚧 <b>Construction Site</b><br/>Verified
                                </div>
                            ) : (
                                <button 
                                    onClick={() => handleMarkConstruction(alert.id)}
                                    style={{width: '100%', padding: '5px', cursor: 'pointer', background: '#374151', color: 'white', border: 'none', borderRadius: '4px'}}
                                >
                                    Mark Construction
                                </button>
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
              >
                <Popup>
                  <b>{id}</b><br />Status: {node.status}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* RIGHT: DATA (Fill Remaining Space) */}
        <div style={styles.rightPanel}>
          {/* ALERTS */}
          <div style={styles.alertSection}>
            <div style={styles.alertHeader}>
              <span>Active Incident Feed</span>
              <span style={{ color: "red", fontSize: "0.8rem" }}>
                {alerts.length} Active
              </span>
            </div>
            <div style={styles.alertTableWrapper}>
              <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f1f5f9", color: "#64748b", textAlign: "left", position: "sticky", top: 0 }}>
                  <tr>
                    <th style={{ padding: "12px 15px" }}>Time</th>
                    <th style={{ padding: "12px 15px" }}>Node</th>
                    <th style={{ padding: "12px 15px" }}>Severity</th>
                    <th style={{ padding: "12px 15px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9", background: alert.isConstruction ? '#fffbeb' : 'white' }}>
                      <td style={{ padding: "10px 15px" }}>
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: "10px 15px" }}>{alert.nodeId}</td>
                      <td style={{ padding: "10px 15px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: "bold", background: alert.severity === "HIGH" ? "#fee2e2" : "#fef9c3", color: alert.severity === "HIGH" ? "#991b1b" : "#854d0e" }}>
                          {alert.severity}
                        </span>
                      </td>
                      <td style={{ padding: "10px 15px" }}>
                          {alert.isConstruction ? (
                              <span style={{fontSize: '0.75rem', color: '#b45309'}}>🚧 Site Verified</span>
                          ) : (
                              <button onClick={() => handleMarkConstruction(alert.id)} style={{border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#475569'}}>Mark Construction</button>
                          )}
                      </td>
                    </tr>
                  ))}
                  {alerts.length === 0 && (
                      <tr>
                          <td colSpan="4" style={{padding: '20px', textAlign: 'center', color: '#94a3b8'}}>No active incidents</td>
                      </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* GRAPHS */}
          <div style={styles.graphSection}>
            <div style={styles.graphTitle}>
            📈 Live Telemetry {selectedNode ? `(${selectedNode})` : ''}
            </div>

            <div style={styles.gridContainer}>
              {/* Vibration */}
              <div style={styles.card}>
                <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#94a3b8", marginBottom: "10px", textTransform: "uppercase" }}>VIBRATION</div>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData}>
                      <CartesianGrid stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <YAxis width={30} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="accel_mag" stroke="#6366f1" dot={false} strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Magnetic */}
              <div style={styles.card}>
                <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#94a3b8", marginBottom: "10px", textTransform: "uppercase" }}>MAGNETIC</div>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData}>
                      <CartesianGrid stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <YAxis width={30} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="mag_norm" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Environment */}
              <div style={styles.envCard}>
                <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#94a3b8", marginBottom: "10px", textTransform: "uppercase" }}>ENVIRONMENT</div>
                <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: "Temp", value: latestEnv.temperature || 0, fill: "#ef4444" },
                        { name: "Hum", value: latestEnv.humidity || 0, fill: "#3b82f6" },
                        { name: "Pres", value: (latestEnv.pressure || 0) / 100, fill: "#8b5cf6" },
                      ]}
                      layout="vertical"
                    >
                      <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={50} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}