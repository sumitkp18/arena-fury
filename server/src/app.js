import express from 'express';
import cors from 'cors';
import { gameLoop } from './game/GameLoop.js';

const app = express();

app.use(cors());
app.use(express.json());

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

export default app;
