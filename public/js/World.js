import * as THREE from 'three';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.createGrid();
    }
    
    createGrid() {
        // Create ground
        const gridHelper = new THREE.GridHelper(1000, 50, 0xff00ff, 0x00ffff);
        this.scene.add(gridHelper);
        
        // Create ground plane with simpler geometry
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000, 1, 1);
        const groundMaterial = new THREE.MeshBasicMaterial({
            color: 0x000033,
            transparent: true,
            opacity: 0.8
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        this.scene.add(ground);
    }
    
    update(camera) {
        // Only update objects that are within view distance
        const viewDistance = 200;
        // Implement distance-based detail levels
    }
}
