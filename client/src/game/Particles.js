import * as THREE from 'three';

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.systems = [];
    
    this.createAmbientParticles();
  }

  createAmbientParticles() {
    const count = 60;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i*3] = (Math.random() - 0.5) * 100;
      positions[i*3+1] = Math.random() * 20;
      positions[i*3+2] = (Math.random() - 0.5) * 100;
      
      velocities.push(Math.random() * 0.5 + 0.1); // upward speed
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x00ffcc,
      size: 0.15,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.ambientPoints = new THREE.Points(geometry, material);
    this.scene.add(this.ambientPoints);
    this.ambientVelocities = velocities;
  }

  spawnExplosion(x, z, colorHex, count = 30) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color(colorHex);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i*3] = x;
      positions[i*3+1] = 1.0;
      positions[i*3+2] = z;
      
      colors[i*3] = color.r;
      colors[i*3+1] = color.g;
      colors[i*3+2] = color.b;
      
      // Random outward velocity
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 15 + 5;
      const up = Math.random() * 10 - 2;
      
      velocities.push({
        x: Math.cos(angle) * speed,
        y: up,
        z: Math.sin(angle) * speed
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    this.systems.push({
      points,
      velocities,
      life: 1.0,
      decay: 1.5 // units per second
    });
  }

  update(dt) {
    const sdt = dt / 1000; // seconds
    
    // Update ambient
    if (this.ambientPoints) {
      const pos = this.ambientPoints.geometry.attributes.position.array;
      for (let i = 0; i < this.ambientVelocities.length; i++) {
        pos[i*3+1] += this.ambientVelocities[i] * sdt * 10;
        if (pos[i*3+1] > 20) {
          pos[i*3+1] = 0; // Wrap to bottom
        }
      }
      this.ambientPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Update dynamic systems
    for (let i = this.systems.length - 1; i >= 0; i--) {
      const sys = this.systems[i];
      sys.life -= sys.decay * sdt;
      
      if (sys.life <= 0) {
        this.scene.remove(sys.points);
        sys.points.geometry.dispose();
        sys.points.material.dispose();
        this.systems.splice(i, 1);
        continue;
      }
      
      sys.points.material.opacity = sys.life;
      
      const pos = sys.points.geometry.attributes.position.array;
      for (let j = 0; j < sys.velocities.length; j++) {
        pos[j*3] += sys.velocities[j].x * sdt;
        pos[j*3+1] += sys.velocities[j].y * sdt;
        pos[j*3+2] += sys.velocities[j].z * sdt;
        
        // Gravity/drag
        sys.velocities[j].y -= 20 * sdt;
        sys.velocities[j].x *= 0.95;
        sys.velocities[j].z *= 0.95;
      }
      sys.points.geometry.attributes.position.needsUpdate = true;
    }
  }
}
