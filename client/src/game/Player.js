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
    this.lives = data.lives || 3;
    this.isDead = false;

    // Invulnerability
    this.invulnerable = false;
    this.invulnEndTime = 0;

    // Pre-allocated
    this._pos = { x: 0, z: 0 };
    
    this.group = new THREE.Group();
    this.group.position.set(this.x, this.radius, this.z);
    
    this.createMesh();
    this.createShield();
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
      uniform float invuln;
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
        
        // Invulnerability: bright white-gold pulse
        if (invuln > 0.0) {
          float invPulse = sin(time * 12.0) * 0.3 + 0.7;
          vec3 invColor = vec3(1.0, 0.95, 0.7) * invPulse;
          finalColor = mix(finalColor, invColor, invuln * 0.6);
        }
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        color: { value: new THREE.Color(this.colorHex) },
        time: { value: 0 },
        damageFlash: { value: 0 },
        invuln: { value: 0 }
      },
      transparent: true
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.group.add(this.mesh);
  }

  /**
   * Create a transparent shield sphere shown during invulnerability.
   */
  createShield() {
    const shieldGeo = new THREE.SphereGeometry(this.radius * 1.6, 24, 24);
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      wireframe: true,
      depthWrite: false
    });
    this.shield = new THREE.Mesh(shieldGeo, this.shieldMat);
    this.group.add(this.shield);
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
   * Trigger respawn visuals: teleport to position, start invulnerability glow.
   */
  respawn(x, z, invulnDuration) {
    this.isDead = false;
    this.x = x;
    this.z = z;
    this.targetX = x;
    this.targetZ = z;
    this.group.visible = true;
    this.invulnerable = true;
    this.invulnEndTime = performance.now() + invulnDuration;
    this.lastHealth = 100;
  }

  /**
   * Mark player as dead — hide mesh.
   */
  die() {
    this.isDead = true;
    this.group.visible = false;
    this.moveDirX = 0;
    this.moveDirZ = 0;
  }

  update(dt) {
    if (this.isDead) return;

    const dtSec = dt / 1000;

    if (this.isLocal) {
      this.x += this.moveDirX * PLAYER_SPEED * dtSec;
      this.z += this.moveDirZ * PLAYER_SPEED * dtSec;
      this.x = Math.max(-HALF_W + PAD, Math.min(HALF_W - PAD, this.x));
      this.z = Math.max(-HALF_D + PAD, Math.min(HALF_D - PAD, this.z));
    } else {
      const t = 1.0 - Math.exp(-12 * dtSec);
      this.x += (this.targetX - this.x) * t;
      this.z += (this.targetZ - this.z) * t;
    }
    
    this.group.position.x = this.x;
    this.group.position.z = this.z;
    this.group.rotation.y = this.rotation;

    this._pos.x = this.x;
    this._pos.z = this.z;

    const now = performance.now();
    this.material.uniforms.time.value = now * 0.001;
    
    // Damage flash decay
    if (this.material.uniforms.damageFlash.value > 0) {
      this.material.uniforms.damageFlash.value -= dt * 0.005;
      if (this.material.uniforms.damageFlash.value < 0) {
        this.material.uniforms.damageFlash.value = 0;
      }
    }

    // Invulnerability visual
    if (this.invulnerable) {
      if (now > this.invulnEndTime) {
        this.invulnerable = false;
        this.material.uniforms.invuln.value = 0;
        this.shieldMat.opacity = 0;
      } else {
        // Fade out gradually in last second
        const remaining = (this.invulnEndTime - now) / 1000;
        const intensity = remaining > 1 ? 1.0 : remaining;
        this.material.uniforms.invuln.value = intensity;

        // Shield wireframe pulse
        const pulse = Math.sin(now * 0.008) * 0.5 + 0.5;
        this.shieldMat.opacity = intensity * 0.15 * pulse;
        this.shieldMat.color.setHSL(0.12, 0.8, 0.6 + pulse * 0.4);
        this.shield.rotation.y += dtSec * 2;
        this.shield.rotation.x += dtSec * 1.5;
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
    this.shield.geometry.dispose();
    this.shieldMat.dispose();
  }
}
