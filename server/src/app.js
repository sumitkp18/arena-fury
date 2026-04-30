import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import { gameLoop } from './game/GameLoop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());

// In production, serve the built client files
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

app.get('/health', (req, res) => {
  let playerCount = 0;
  const rooms = gameLoop.getRoomList();
  for (const room of rooms) {
    playerCount += room.playerCount;
  }
  
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    players: playerCount,
    rooms: rooms.length
  });
});

app.get('/api/rooms', (req, res) => {
  res.json(gameLoop.getRoomList());
});

// SPA fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

export default app;
