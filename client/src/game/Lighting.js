import * as THREE from 'three';

/**
 * Lightweight lighting setup.
 * Uses only ambient + hemisphere + directional (no shadows).
 * All PointLights removed to reduce per-fragment lighting cost.
 * The neon aesthetic comes from emissive ShaderMaterials, not dynamic lights.
 */
export class Lighting {
  constructor(scene) {
    this.scene = scene;
    this.setupLighting();
  }

  setupLighting() {
    // Ambient — provides base visibility
    const ambient = new THREE.AmbientLight(0x2a2a5e, 0.6);
    this.scene.add(ambient);

    // Hemisphere — subtle sky/ground color gradient
    const hemi = new THREE.HemisphereLight(0x4466ff, 0x111122, 0.4);
    hemi.position.set(0, 20, 0);
    this.scene.add(hemi);

    // Directional — main scene illumination (NO shadows)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(10, 30, 20);
    dirLight.castShadow = false;
    this.scene.add(dirLight);
  }

  update(time) {
    // No-op — static lighting is cheapest
  }
}
