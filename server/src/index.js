import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { gameLoop } from './game/GameLoop.js';
import SocketHandler from './network/SocketHandler.js';

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0'; // Listen on all interfaces for LAN access

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO with CORS (allow any origin for LAN play)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize Socket event routing
SocketHandler.init(io, gameLoop);

// Start game loop
gameLoop.start();

// Start HTTP server
httpServer.listen(PORT, HOST, () => {
  console.log(`[Server] Arena Fury server running on ${HOST}:${PORT}`);
  console.log(`[Server] LAN players can connect via your local IP on port ${PORT}`);
});
