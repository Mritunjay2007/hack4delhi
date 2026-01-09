const { Server } = require('socket.io');
const config = require('../config/config');

let io;

const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: { origin: config.frontend.origin }
    });
    
    io.on('connection', (socket) => {
        console.log('Frontend Dashboard Connected:', socket.id);
    });
    
    return io;
};

const broadcastUpdate = (data) => {
    if (io) io.emit('sensor_update', data);
};

module.exports = { initSocket, broadcastUpdate };