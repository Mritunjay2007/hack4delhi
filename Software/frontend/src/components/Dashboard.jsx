import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import io from 'socket.io-client';
import axios from 'axios';

// Fix for default Leaflet marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Red Marker for Alerts
const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers-default/red-marker.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const socket = io('http://localhost:3000');
const API_URL = 'http://localhost:3000/api/alerts';

export default function Dashboard() {
    const [alerts, setAlerts] = useState([]);
    const [activeTab, setActiveTab] = useState('map'); // 'map' or 'list'

    // 1. Initial Load & Socket Listeners
    useEffect(() => {
        // Fetch existing JSON data on load
        fetchAlerts();

        // Listen for NEW alerts from MQTT->Node
        socket.on('new_alert', (newAlert) => {
            setAlerts(prev => {
                // Replace if exists, else add
                const exists = prev.find(a => a.id === newAlert.id);
                if (exists) return prev.map(a => a.id === newAlert.id ? newAlert : a);
                return [...prev, newAlert];
            });
        });

        // Listen for UPDATES (e.g., Construction marked)
        socket.on('alert_update', (updatedAlert) => {
            setAlerts(prev => prev.map(a => a.id === updatedAlert.id ? updatedAlert : a));
        });

        return () => {
            socket.off('new_alert');
            socket.off('alert_update');
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

    // 2. Handle "Mark as Construction"
    const handleMarkConstruction = async (id) => {
        try {
            await axios.post(`${API_URL}/mark-construction`, { id });
            // State update handled by socket 'alert_update'
        } catch (err) {
            alert("Failed to update status");
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header */}
            <header className="bg-blue-900 text-white p-4 shadow-lg flex justify-between items-center">
                <h1 className="text-2xl font-bold">🚄 RailGuard Command Center</h1>
                <div className="space-x-4">
                    <button onClick={() => setActiveTab('map')} className={`px-4 py-2 rounded ${activeTab==='map' ? 'bg-blue-600' : 'bg-blue-800'}`}>Live Map</button>
                    <button onClick={() => setActiveTab('list')} className={`px-4 py-2 rounded ${activeTab==='list' ? 'bg-blue-600' : 'bg-blue-800'}`}>Alert Feed ({alerts.length})</button>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden">
                
                {/* LEFT PANEL: Map */}
                <div className={`${activeTab === 'map' ? 'w-full' : 'hidden'} md:w-2/3 md:block relative h-full`}>
                    <MapContainer center={[28.6139, 77.2090]} zoom={11} style={{ height: "100%", width: "100%" }}>
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; OpenStreetMap contributors'
                        />
                        
                        {alerts.map(alert => (
                            <Marker 
                                key={alert.id} 
                                position={[alert.lat, alert.lng]}
                                icon={alert.status === 'ACTIVE' ? redIcon : DefaultIcon}
                            >
                                <Popup>
                                    <div className="p-2">
                                        <h3 className="font-bold text-red-600">{alert.nodeId}</h3>
                                        <p>Lat: {alert.lat}, Lng: {alert.lng}</p>
                                        <p className="font-semibold">Status: {alert.status}</p>
                                        
                                        {alert.isConstruction && (
                                            <div className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded mt-1 border border-yellow-400">
                                                🚧 Near Construction Site
                                            </div>
                                        )}

                                        {!alert.isConstruction && (
                                            <button 
                                                onClick={() => handleMarkConstruction(alert.id)}
                                                className="mt-2 bg-gray-800 text-white text-xs px-3 py-1 rounded hover:bg-gray-700 w-full"
                                            >
                                                Mark Construction
                                            </button>
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                    
                    {/* Floating Legend */}
                    <div className="absolute bottom-5 left-5 bg-white p-3 rounded shadow-lg z-[1000]">
                        <h4 className="font-bold text-sm mb-2">Track Status</h4>
                        <div className="flex items-center text-xs mb-1"><span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span> Operational</div>
                        <div className="flex items-center text-xs"><span className="w-3 h-3 bg-red-600 rounded-full mr-2"></span> Tampering Detected</div>
                    </div>
                </div>

                {/* RIGHT PANEL: Alert List */}
                <div className={`${activeTab === 'list' ? 'w-full' : 'hidden'} md:w-1/3 md:block bg-white border-l border-gray-200 overflow-y-auto p-4`}>
                    <h2 className="text-xl font-bold mb-4 text-gray-800">Live Alerts</h2>
                    
                    {alerts.length === 0 && <p className="text-gray-500 text-center mt-10">No active alerts. System Normal.</p>}

                    {alerts.slice().reverse().map(alert => (
                        <div key={alert.id} className="mb-4 p-4 border rounded-lg shadow-sm hover:shadow-md transition bg-white border-l-4 border-red-500 relative">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg">{alert.nodeId}</h3>
                                <span className={`text-xs px-2 py-1 rounded ${alert.severity === 'RED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                    {alert.severity} CRITICAL
                                </span>
                            </div>
                            
                            <div className="text-sm text-gray-600 space-y-1">
                                <p>📍 {alert.locationName} ({alert.lat}, {alert.lng})</p>
                                <p>⏰ {new Date(alert.timestamp).toLocaleTimeString()}</p>
                                <p>📡 Status: <strong>{alert.status}</strong></p>
                            </div>

                            {/* Construction Tag in List */}
                            {alert.isConstruction ? (
                                <div className="mt-3 flex items-center text-yellow-700 text-sm font-semibold bg-yellow-50 p-2 rounded">
                                    🚧 Construction Area Verified
                                </div>
                            ) : (
                                <button 
                                    onClick={() => handleMarkConstruction(alert.id)}
                                    className="mt-3 w-full border border-gray-300 text-gray-600 text-sm py-1 rounded hover:bg-gray-50"
                                >
                                    Mark as Near Construction Site
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}