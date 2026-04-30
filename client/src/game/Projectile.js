import * as THREE from 'three';

// Shared geometry and material for all projectiles (zero per-instance allocation)
let _sharedGeo = null;
let _sharedMat = null;

function getSharedGeo() {
  if (!_sharedGeo) _sharedGeo = new THREE.SphereGeometry(0.25, 8, 8);
  return _sharedGeo;
}

function getSharedMat() {
  if (!_sharedMat) {
    _sharedMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.95,
    });
  }
  return _sharedMat;
}

/**
 * Lightweight projectile — uses shared geometry/material.
 * No PointLight (expensive), no per-instance allocation.
 */
export class Projectile {
  constructor(data, scene) {
    this.id = data.id;
    this.ownerId = data.ownerId;
    this.currentX = data.x;
    this.currentZ = data.z;
    this.targetX = data.x;
    this.targetZ = data.z;

    this.mesh = new THREE.Mesh(getSharedGeo(), getSharedMat());
    this.mesh.position.set(data.x, 1.0, data.z);
    scene.add(this.mesh);
  }

  setTarget(x, z) {
    this.targetX = x;
    this.targetZ = z;
  }

  update(dt) {
    const t = 1.0 - Math.exp(-15 * dt / 1000);
    this.currentX += (this.targetX - this.currentX) * t;
    this.currentZ += (this.targetZ - this.currentZ) * t;

    this.mesh.position.x = this.currentX;
    this.mesh.position.z = this.currentZ;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    // Don't dispose shared geometry/material
  }
}
