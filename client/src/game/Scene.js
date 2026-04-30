import * as THREE from 'three';

/**
 * Scene manager — handles renderer, scene, and camera setup.
 * 
 * Bloom/post-processing is DISABLED because:
 * - UnrealBloomPass does 5+ render passes per frame (extract → blur H/V × N → composite)
 * - This halves or thirds the effective frame rate on integrated GPUs
 * - The neon glow aesthetic is achieved through emissive materials and PointLights instead
 */
export class Scene {
  constructor(container) {
    this.container = container;
    
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050515, 0.015);
    this.scene.background = new THREE.Color(0x020205);

    this.camera = new THREE.PerspectiveCamera(
      50, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    this.container.appendChild(this.renderer.domElement);

    this.onWindowResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onWindowResize);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
