import * as THREE from 'three';

const PLAYER_SPEED = 12;
const HALF_W = 30;
const HALF_D = 30;
const PAD = 0.6;

export class Player {
  constructor(data, scene, isLocal) {
    this.id = data.id;
    this.colorHex = data.color || '#ffffff';
    this.isLocal = isLocal;
    
    this.radius = 1.5;

    // Position
    this.x = data.x || 0;
    this.z = data.z || 0;

    // Remote player target
    this.targetX = this.x;
    this.targetZ = this.z;

    // Movement direction (local player only)
    this.moveDirX = 0;
    this.moveDirZ = 0;

    this.rotation = data.rotation || 0;
    this.lastHealth = data.health || 100;

    // Pre-allocated
    this._pos = { x: 0, z: 0 };
    
    this.group = new THREE.Group();
    this.group.position.set(this.x, this.radius, this.z);
    
    this.createMesh();
    scene.add(this.group);
  }

  createMesh() {
    const geo = new THREE.SphereGeometry(this.radius, 32, 32);
    
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 color;
      uniform float time;
      uniform float damageFlash;
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      
      void main() {
        float fresnel = dot(vNormal, vPositionNormal);
        fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
        fresnel = pow(fresnel, 2.5);
        
        float pulse = sin(time * 5.0) * 0.1 + 0.9;
        
        vec3 baseColor = color * 0.35;
        vec3 glowColor = color * fresnel * 3.5 * pulse;
        
        vec3 finalColor = baseColor + glowColor;
        finalColor = mix(finalColor, vec3(1.0, 0.0, 0.0), damageFlash);
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        color: { value: new THREE.Color(this.colorHex) },
        time: { value: 0 },
        damageFlash: { value: 0 }
      },
      transparent: true
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.group.add(this.mesh);
  }

  // ─── Methods ────────────────────────────────────────

  setMovement(dx, dz) {
    this.moveDirX = dx;
    this.moveDirZ = dz;
  }

  setTarget(x, z, rotation) {
    this.targetX = x;
    this.targetZ = z;
    this.rotation = rotation;
  }

  setPosition(x, z) {
    this.x = x;
    this.z = z;
    this.targetX = x;
    this.targetZ = z;
  }

  /**
   * Update every frame.
   * Local player: simple velocity integration (same as the smooth test page).
   * Remote player: exponential smoothing toward server target.
   */
  update(dt) {
    const dtSec = dt / 1000;

    if (this.isLocal) {
      // Simple velocity — proven smooth in movement-test.html
      this.x += this.moveDirX * PLAYER_SPEED * dtSec;
      this.z += this.moveDirZ * PLAYER_SPEED * dtSec;

      // Clamp to arena
      this.x = Math.max(-HALF_W + PAD, Math.min(HALF_W - PAD, this.x));
      this.z = Math.max(-HALF_D + PAD, Math.min(HALF_D - PAD, this.z));
    } else {
      // Exponential smoothing toward server target
      const t = 1.0 - Math.exp(-12 * dtSec);
      this.x += (this.targetX - this.x) * t;
      this.z += (this.targetZ - this.z) * t;
    }
    
    this.group.position.x = this.x;
    this.group.position.z = this.z;
    this.group.rotation.y = this.rotation;

    // Store for getPosition
    this._pos.x = this.x;
    this._pos.z = this.z;

    // Visual effects
    this.material.uniforms.time.value = performance.now() * 0.001;
    
    if (this.material.uniforms.damageFlash.value > 0) {
      this.material.uniforms.damageFlash.value -= dt * 0.005;
      if (this.material.uniforms.damageFlash.value < 0) {
        this.material.uniforms.damageFlash.value = 0;
      }
    }
    
    this.mesh.rotation.x *= 0.9;
    this.mesh.rotation.z *= 0.9;
  }

  getPosition() {
    return this._pos;
  }

  takeDamage() {
    this.material.uniforms.damageFlash.value = 1.0;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
