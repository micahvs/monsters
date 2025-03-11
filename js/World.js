import * as THREE from 'three';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.createGrid();
    }
    
    createGrid() {
        // Create ground
        const gridHelper = new THREE.GridHelper(1000, 100, 0xff00ff, 0x00ffff);
        this.scene.add(gridHelper);
        
        // Create ground plane
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
        const groundMaterial = new THREE.MeshPhongMaterial({
            color: 0x000000,
            shininess: 0
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        this.scene.add(ground);
    }
    
    update() {
        // Add any world updates here
    }
}
