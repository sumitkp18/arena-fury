import * as THREE from 'three';

export class Arena {
  constructor(scene) {
    this.scene = scene;
    
    // Assume ARENA.SIZE = 100 for visual construction
    const arenaSize = 100;

    this.createFloor(arenaSize);
    this.createWalls(arenaSize);
    
    this.time = 0;
  }

  createFloor(size) {
    const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
    
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;

    const fragmentShader = `
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        // Grid pattern
        vec2 grid = abs(fract(vWorldPosition.xz / 4.0 - 0.5) - 0.5) / fwidth(vWorldPosition.xz / 4.0);
        float line = min(grid.x, grid.y);
        
        // Edge glow / falloff
        float distToCenter = length(vWorldPosition.xz) / 50.0;
        float falloff = smoothstep(1.0, 0.2, distToCenter);
        
        float pulse = sin(time * 2.0) * 0.1 + 0.9;
        float lineGlow = 1.0 - min(line, 1.0);
        
        vec3 baseColor = vec3(0.02, 0.02, 0.08);
        vec3 finalColor = mix(baseColor, color * pulse, lineGlow * falloff * 0.5);
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.gridMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0x00ffcc) }
      }
    });

    const floor = new THREE.Mesh(geometry, this.gridMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  createWalls(size) {
    const wallHeight = 10;
    const wallThickness = 2;
    const halfSize = size / 2;
    
    const wallGeo = new THREE.BoxGeometry(size + wallThickness*2, wallHeight, wallThickness);
    
    const colors = [0x00ffcc, 0xff0066, 0x00ffcc, 0xff0066];
    
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.15,
      });
      
      const wall = new THREE.Mesh(wallGeo, mat);
      
      // Position logic
      if (i === 0) { wall.position.set(0, wallHeight/2, -halfSize - wallThickness/2); }
      if (i === 1) { wall.position.set(0, wallHeight/2, halfSize + wallThickness/2); }
      if (i === 2) { wall.rotation.y = Math.PI / 2; wall.position.set(-halfSize - wallThickness/2, wallHeight/2, 0); }
      if (i === 3) { wall.rotation.y = Math.PI / 2; wall.position.set(halfSize + wallThickness/2, wallHeight/2, 0); }
      
      this.scene.add(wall);
      
      // Edge glow
      const edges = new THREE.EdgesGeometry(wallGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: colors[i], linewidth: 2 });
      const edgeLines = new THREE.LineSegments(edges, lineMat);
      wall.add(edgeLines);
    }
  }

  update(time) {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.time.value = time;
    }
  }
}
