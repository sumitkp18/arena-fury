import { ARENA, PLAYER, PROJECTILE, POWERUP, GAME, NETWORK, PHYSICS } from 'arena-fury-shared';

// Generate 8 spawn points evenly distributed around the arena center
// ARENA.WIDTH = 60, so half = 30. Spawn at 35% of half = ~10 units from center
const SPAWN_RADIUS = (ARENA.WIDTH / 2) * 0.6;
const spawnPoints = [];
for (let i = 0; i < 8; i++) {
  const angle = (i / 8) * Math.PI * 2;
  spawnPoints.push({
    x: Math.cos(angle) * SPAWN_RADIUS,
    z: Math.sin(angle) * SPAWN_RADIUS
  });
}

/**
 * Returns a random spawn point from the predefined array
 * @returns {{x: number, z: number}}
 */
export function getRandomSpawnPoint() {
  const index = Math.floor(Math.random() * spawnPoints.length);
  return { ...spawnPoints[index] };
}

export {
  ARENA,
  PLAYER,
  PROJECTILE,
  POWERUP,
  GAME,
  NETWORK,
  PHYSICS
};
