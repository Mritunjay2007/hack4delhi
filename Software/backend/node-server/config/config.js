module.exports = {
    mqtt: {
        brokerUrl: 'mqtt://broker.hivemq.com', // Or 'mqtt://test.mosquitto.org'
        topic: 'railway/sensor/+'
    },
    ai: {
        url: 'http://127.0.0.1:8000/predict'
    },
    server: {
        port: 3000
    },
    frontend: {
        origin: '*' // Allow all for hackathon simplicity
    }
};