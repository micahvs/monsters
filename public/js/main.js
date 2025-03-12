import * as THREE from 'three';
import { MonsterTruck } from './MonsterTruck.js';
import { World } from './World.js';

const TRUCK_SPECS = {
    'NEON CRUSHER': {
        acceleration: 0.019,   // Reduced by 5%
        maxSpeed: 0.95,        // Reduced by 5%
        handling: 0.018,       // Kept the same
        braking: 0.03,         // Kept the same
        mass: 1.0,             // Kept the same
        grip: 0.85,            // Kept the same
        turnInertia: 0.8,      // Kept the same
        deceleration: 0.015,   // Kept the same
        dimensions: { width: 2, height: 1, length: 3 },
        health: 100,           // Base health
        armor: 1.0             // Damage resistance multiplier
    },
    'GRID RIPPER': {
        acceleration: 0.02375,  // Reduced by 5%
        maxSpeed: 1.235,        // Reduced by 5%
        handling: 0.016,        // Kept the same
        braking: 0.025,         // Kept the same
        mass: 0.8,              // Kept the same
        grip: 0.75,             // Kept the same
        turnInertia: 0.9,       // Kept the same
        deceleration: 0.012,    // Kept the same
        dimensions: { width: 1.8, height: 0.8, length: 3.2 },
        health: 80,             // Lower health due to light armor
        armor: 0.7              // Lower damage resistance
    },
    'LASER WHEEL': {
        acceleration: 0.01425,  // Reduced by 5%
        maxSpeed: 0.76,         // Reduced by 5%
        handling: 0.014,        // Kept the same
        braking: 0.035,         // Kept the same
        mass: 1.2,              // Kept the same
        grip: 0.95,             // Kept the same
        turnInertia: 0.7,       // Kept the same
        deceleration: 0.018,    // Kept the same
        dimensions: { width: 2.2, height: 1.2, length: 2.8 },
        health: 120,            // Higher health due to heavy armor
        armor: 1.4              // Higher damage resistance
    }
};

class Projectile {
    constructor(position, direction, speed, damage, source) {
        const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        geometry.rotateX(Math.PI / 2);
        
        const projectileColor = source === 'player' ? 0xff00ff : 0xff0000;
        const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(projectileColor),
            emissive: new THREE.Color(projectileColor),
            emissiveIntensity: 1,
            transparent: true,
            opacity: 0.8,
            shininess: 30
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        
        this.light = new THREE.PointLight(projectileColor, 0.5, 3);
        this.light.position.copy(position);
        
        this.direction = direction.normalize();
        this.speed = speed;
        this.damage = damage;
        this.source = source;
        this.alive = true;
        this.lifespan = 200;
        
        this.mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            this.direction
        );
    }

    update() {
        // Update position with higher speed
        const movement = this.direction.clone().multiplyScalar(this.speed);
        this.mesh.position.add(movement);
        this.light.position.copy(this.mesh.position);
        
        this.lifespan--;
        if (this.lifespan <= 0) this.alive = false;
        
        // Add trail effect
        this.createTrail();
    }

    createTrail() {
        // Create particle trail
        const trailGeometry = new THREE.SphereGeometry(0.05, 4, 4);
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: this.source === 'player' ? 0xff00ff : 0xff0000,
            transparent: true,
            opacity: 0.5
        });
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.copy(this.mesh.position);
        
        // Fade out and remove trail particles
        setTimeout(() => {
            trail.material.opacity -= 0.1;
            if (trail.material.opacity <= 0) {
                trail.parent.remove(trail);
            }
        }, 50);
        
        return trail;
    }
}

class Turret {
    constructor(position) {
        // Create turret base
        const baseGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
        const baseMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(0xff0000),
            shininess: 30
        });
        this.base = new THREE.Mesh(baseGeometry, baseMaterial);
        this.base.position.copy(position);

        // Create turret gun
        const gunGeometry = new THREE.BoxGeometry(0.3, 0.3, 2);
        const gunMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(0x666666),
            shininess: 30
        });
        this.gun = new THREE.Mesh(gunGeometry, gunMaterial);
        this.gun.position.y = 0.5;
        this.gun.position.z = 0.5;
        this.base.add(this.gun);

        this.health = 5;
        this.shootCooldown = 0;
        this.alive = true;
    }

    update(playerPosition) {
        if (!this.alive) return;

        // Rotate to face player
        const direction = new THREE.Vector3()
            .subVectors(playerPosition, this.base.position)
            .normalize();
        this.base.rotation.y = Math.atan2(direction.x, direction.z);

        // Update shooting cooldown
        if (this.shootCooldown > 0) this.shootCooldown--;
    }

    damage() {
        this.health--;
        if (this.health <= 0) {
            this.alive = false;
            this.base.material.color.setHex(0x333333); // Darkened color when destroyed
        }
    }

    canShoot() {
        return this.alive && this.shootCooldown <= 0;
    }
}

class Game {
    constructor() {
        console.log("Game constructor called");
        
        // Basic initialization
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.truck = null;
        this.multiplayer = null; // Add multiplayer manager
        this.isInitialized = false;
        this.debugMode = true; // Enable debug mode
        this.isGameOver = false;
        
        // Controls
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            ' ': false,
            'd': false, // Debug key
            'm': false  // Debug movement
        };
        
        // Game state
        this.health = 100;
        this.score = 0;
        this.sparks = [];
        
        // Shooting mechanics
        this.projectiles = [];
        this.shootCooldown = 0;
        this.ammo = 30; // Limited ammo
        this.maxAmmo = 30;
        this.reloadTime = 0;
        
        // Start initialization
        this.init();

        // Update the socket connection with error handling
        try {
            this.socket = io('https://monster-truck-game-server.fly.dev', {
                withCredentials: true,
                transports: ['websocket'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5
            });

            this.socket.on('connect_error', (error) => {
                console.log('Connection Error:', error);
                // Handle connection error gracefully
            });

            this.socket.on('connect', () => {
                console.log('Connected to game server');
            });
        } catch (error) {
            console.log('Socket initialization error:', error);
        }
    }
    
    init() {
        console.log("Initializing game");
        
        try {
            // Create scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x120023);
            console.log("Scene created");
            
            // Create camera
            this.camera = new THREE.PerspectiveCamera(
                75, 
                window.innerWidth / window.innerHeight, 
                0.1, 
                1000
            );
            this.camera.position.set(0, 5, 10);
            console.log("Camera created");
            
            // Create renderer
            const canvas = document.getElementById('game');
            if (!canvas) {
                console.error("Canvas element not found!");
                return;
            }
            
            this.renderer = new THREE.WebGLRenderer({ 
                canvas: canvas,
                antialias: true 
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            console.log("Renderer created");
            
            // Add lights
            this.addLights();
            
            // Add grid and ground
            this.createArena();
            
            // Create a simple truck
            this.createSimpleTruck();
            
            // Add stadium around the arena (after truck but before turrets)
            this.createStadium();
            
            // Create turrets (after stadium is created)
            this.createTurrets();
            
            // Initialize HUD
            this.initHUD();
            
            // Set up controls
            this.setupControls();
            
            // Mark as initialized
            this.isInitialized = true;
            
            // Remove loading screen
            this.removeLoadingScreen();
            
            // Initialize multiplayer
            this.initMultiplayer();
            
            console.log("Game initialized, starting animation loop");
            
            // Start animation loop
            this.animate();
        } catch (error) {
            console.error("Error during initialization:", error);
        }
    }
    
    addLights() {
        try {
            // Add ambient light
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            this.scene.add(ambientLight);
            
            // Add directional light
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(50, 50, 50);
            this.scene.add(directionalLight);
            
            console.log("Lights added");
        } catch (error) {
            console.error("Error adding lights:", error);
        }
    }
    
    createArena() {
        try {
            const arenaSize = 1600; // 16x larger than original (4x larger than current)
            console.log("Creating arena with size:", arenaSize);
            
            // Add grid floor - increased spacing for better performance with larger arena
            const gridHelper = new THREE.GridHelper(arenaSize, arenaSize / 16, 0xff00ff, 0x00ffff);
            this.scene.add(gridHelper);
            
            // Add ground plane
            const groundGeometry = new THREE.PlaneGeometry(arenaSize, arenaSize);
            const groundMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x120023,
                shininess: 10
            });
            const ground = new THREE.Mesh(groundGeometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2;
            this.scene.add(ground);
            
            // Create boundary walls - DIRECT APPROACH
            this.createSimpleWalls(arenaSize);
            
            // Add distance markers for scale reference
            this.addDistanceMarkers(arenaSize);
            
            console.log("Mega-sized arena created");
        } catch (error) {
            console.error("Error creating arena:", error);
        }
    }
    
    // Add distance markers to help players get a sense of scale in the larger arena
    addDistanceMarkers(arenaSize) {
        const markerMaterial = new THREE.MeshPhongMaterial({
            color: 0xffff00,
            emissive: 0xffff00,
            emissiveIntensity: 0.3
        });
        
        // Create markers at various distances from center
        const distances = [100, 200, 400, 600];
        const directions = [
            { x: 1, z: 0 },  // East
            { x: 0, z: 1 },  // North
            { x: -1, z: 0 }, // West
            { x: 0, z: -1 }  // South
        ];
        
        distances.forEach(distance => {
            directions.forEach(dir => {
                // Create marker post
                const markerGeometry = new THREE.BoxGeometry(5, 15, 5);
                const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                
                // Position marker
                marker.position.set(
                    dir.x * distance,
                    7.5, // Half the height
                    dir.z * distance
                );
                
                this.scene.add(marker);
                
                // Add a point light to make the marker more visible
                const markerLight = new THREE.PointLight(0xffff00, 0.5, 50);
                markerLight.position.set(
                    dir.x * distance,
                    15,
                    dir.z * distance
                );
                this.scene.add(markerLight);
            });
        });
    }
    
    // Enhanced wall creation for the larger arena
    createSimpleWalls(arenaSize) {
        try {
            console.log("Creating walls for mega arena");
            const halfSize = arenaSize / 2;
            
            // Create more impressive walls with details
            const wallHeight = 30; // Taller walls for the larger arena
            
            // Base wall material with glow effect
            const wallMaterial = new THREE.MeshPhongMaterial({ 
                color: 0xff00ff,
                emissive: 0x330033,
                shininess: 70
            });
            
            // Alternate material for visual variety
            const altWallMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x00ffff,
                emissive: 0x003333,
                shininess: 70
            });
            
            // Create the main boundary walls
            const walls = [
                // North Wall (back)
                {
                    geometry: new THREE.BoxGeometry(arenaSize, wallHeight, 10),
                    position: [0, wallHeight/2, -halfSize],
                    material: wallMaterial,
                    name: "North wall"
                },
                // South Wall (front)
                {
                    geometry: new THREE.BoxGeometry(arenaSize, wallHeight, 10),
                    position: [0, wallHeight/2, halfSize],
                    material: wallMaterial,
                    name: "South wall"
                },
                // East Wall (right)
                {
                    geometry: new THREE.BoxGeometry(10, wallHeight, arenaSize),
                    position: [halfSize, wallHeight/2, 0],
                    material: wallMaterial,
                    name: "East wall"
                },
                // West Wall (left)
                {
                    geometry: new THREE.BoxGeometry(10, wallHeight, arenaSize),
                    position: [-halfSize, wallHeight/2, 0],
                    material: wallMaterial,
                    name: "West wall"
                }
            ];
            
            // Create walls with details
            walls.forEach(wallData => {
                const wall = new THREE.Mesh(wallData.geometry, wallData.material);
                wall.position.set(...wallData.position);
                wall.name = wallData.name; // Set the name property so we can filter out walls later
                this.scene.add(wall);
                console.log(`${wallData.name} added at`, wall.position);
                
                // Add decorative elements along wall at intervals
                const segmentCount = 20; // Number of segments along each wall
                const segmentSize = arenaSize / segmentCount;
                
                // Add pillars along the wall
                for (let i = 0; i < segmentCount; i++) {
                    // Skip some pillars for variety
                    if (i % 3 === 0) continue;
                    
                    // Calculate position along the wall
                    let pillarX, pillarZ;
                    if (wallData.name.includes("North") || wallData.name.includes("South")) {
                        pillarX = -halfSize + (i * segmentSize) + segmentSize/2;
                        pillarZ = wallData.position[2];
                    } else {
                        pillarX = wallData.position[0];
                        pillarZ = -halfSize + (i * segmentSize) + segmentSize/2;
                    }
                    
                    // Create pillar
                    const pillar = new THREE.Mesh(
                        new THREE.BoxGeometry(10, wallHeight + 10, 10),
                        i % 2 === 0 ? wallMaterial : altWallMaterial
                    );
                    pillar.position.set(pillarX, (wallHeight + 10)/2, pillarZ);
                    this.scene.add(pillar);
                    
                    // Add light on top of some pillars
                    if (i % 4 === 0) {
                        const light = new THREE.PointLight(0xff00ff, 1, 100);
                        light.position.set(pillarX, wallHeight + 15, pillarZ);
                        this.scene.add(light);
                    }
                }
            });
            
            // Create impressive corner towers
            const cornerMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x00ffff,
                emissive: 0x003333,
                shininess: 90
            });
            
            const cornerPositions = [
                [-halfSize, 0, -halfSize],
                [halfSize, 0, -halfSize],
                [-halfSize, 0, halfSize],
                [halfSize, 0, halfSize]
            ];
            
            cornerPositions.forEach((pos, index) => {
                // Base tower
                const cornerTower = new THREE.Mesh(
                    new THREE.BoxGeometry(30, wallHeight * 2, 30),
                    cornerMaterial
                );
                cornerTower.position.set(pos[0], wallHeight, pos[2]);
                this.scene.add(cornerTower);
                
                // Tower top
                const towerTop = new THREE.Mesh(
                    new THREE.ConeGeometry(20, 30, 4),
                    cornerMaterial
                );
                towerTop.position.set(pos[0], wallHeight * 2 + 15, pos[2]);
                this.scene.add(towerTop);
                
                // Tower light
                const towerLight = new THREE.PointLight(0x00ffff, 2, 200);
                towerLight.position.set(pos[0], wallHeight * 2 + 30, pos[2]);
                this.scene.add(towerLight);
                
                console.log(`Corner tower ${index} added at`, cornerTower.position);
            });
            
            console.log("Enhanced walls and towers created");
        } catch (error) {
            console.error("Error creating walls:", error);
        }
    }
    
    createSimpleTruck() {
        try {
            // Get saved settings from localStorage
            const truckType = localStorage.getItem('monsterTruckType') || 'neonCrusher';
            let machineTypeId;
            
            switch(truckType) {
                case 'gridRipper':
                    machineTypeId = 'grid-ripper';
                    break;
                case 'laserWheel':
                    machineTypeId = 'cyber-beast';
                    break;
                default:
                    machineTypeId = 'neon-crusher';
            }
            
            const color = localStorage.getItem('monsterTruckColor') || '#ff00ff';
            
            // Create the monster truck with selected settings
            this.monsterTruck = new MonsterTruck(this.scene, new THREE.Vector3(0, 0.5, 0), {
                machineType: machineTypeId,
                color: color
            });
            
            // For compatibility with existing code
            this.truck = this.monsterTruck.body;
            this.truck.velocity = 0;
            this.truck.acceleration = 0;
            this.truck.turning = 0;
            
            // Initialize health based on truck settings
            this.health = this.monsterTruck.health;
            this.maxHealth = this.monsterTruck.maxHealth;
            
            console.log("Truck created at", this.truck.position);
            console.log("Truck specs:", {
                type: machineTypeId,
                health: this.health,
                armor: this.monsterTruck.armorRating
            });
        } catch (error) {
            console.error("Error creating truck:", error);
        }
    }
    
    setupControls() {
        try {
            // Set up keyboard controls
            window.addEventListener('keydown', (e) => {
                if (this.keys.hasOwnProperty(e.key)) {
                    this.keys[e.key] = true;
                    
                    // Debug key to teleport to arena edge
                    if (e.key === 'd' && this.debugMode) {
                        this.teleportToArenaEdge();
                    }
                    
                    // Debug key to log movement data
                    if (e.key === 'm' && this.debugMode) {
                        this.debugMovement();
                    }
                }
            });
            
            window.addEventListener('keyup', (e) => {
                if (this.keys.hasOwnProperty(e.key)) {
                    this.keys[e.key] = false;
                }
            });
            
            // Handle window resize
            window.addEventListener('resize', () => {
                if (this.camera && this.renderer) {
                    this.camera.aspect = window.innerWidth / window.innerHeight;
                    this.camera.updateProjectionMatrix();
                    this.renderer.setSize(window.innerWidth, window.innerHeight);
                }
            });
            
            console.log("Controls set up");
        } catch (error) {
            console.error("Error setting up controls:", error);
        }
    }
    
    // Debug function to teleport to arena edge
    teleportToArenaEdge() {
        if (!this.truck) return;
        
        const arenaSize = 1600;
        const halfSize = arenaSize / 2;
        
        // Teleport to north edge
        this.truck.position.set(0, 0.5, -halfSize + 20);
        this.camera.position.set(0, 5, -halfSize + 40);
        
        console.log("Teleported to arena edge at", this.truck.position);
    }
    
    removeLoadingScreen() {
        try {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.opacity = '0';
                loadingScreen.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    loadingScreen.remove();
                }, 500);
            }
            console.log("Loading screen removed");
        } catch (error) {
            console.error("Error removing loading screen:", error);
        }
    }
    
    update() {
        if (!this.isInitialized || this.isGameOver) return;
        
        try {
            // Handle controls
            this.handleControls();
            
            // Update truck position
            this.updateTruck();
            
            // Update monster truck (handles damage visual effects, etc.)
            if (this.monsterTruck) {
                this.monsterTruck.update();
                
                // Sync health from MonsterTruck to Game
                this.health = this.monsterTruck.health;
            }
            
            // Check for wall collisions
            if (typeof this.checkWallCollisions === 'function') {
                this.checkWallCollisions();
            }
            
            // Update projectiles
            if (typeof this.updateProjectiles === 'function') {
                this.updateProjectiles();
            }
            
            // Update turrets
            if (typeof this.updateTurrets === 'function') {
                this.updateTurrets();
            }
            
            // Update visual effects
            if (typeof this.updateSparks === 'function' && this.sparks && this.sparks.length > 0) {
                this.updateSparks();
            }
            
            // Update stadium spectators
            if (typeof this.updateSpectators === 'function' && this.spectators) {
                this.updateSpectators();
            }
            
            // Update camera to follow truck
            this.updateCamera();
            
            // Update HUD
            this.updateHUD();
            
            // Update multiplayer
            if (this.multiplayer) {
                this.multiplayer.update();
            }
            
            // Debug info - update position display
            if (this.truck && window.updateDebugInfo) {
                window.updateDebugInfo(this.truck.position);
            }
        } catch (error) {
            console.error("Error in update:", error);
        }
    }
    
    handleControls() {
        if (!this.truck) return;
        
        // Reset acceleration and turning
        this.truck.acceleration = 0;
        this.truck.turning = 0;
        
        // Forward/Backward - FIXED
        if (this.keys.ArrowUp) {
            // Up arrow = forward
            this.truck.acceleration = 0.02;
        } else if (this.keys.ArrowDown) {
            // Down arrow = backward
            this.truck.acceleration = -0.02;
        }
        
        // Turning - FIXED
        if (this.keys.ArrowLeft) {
            // Left arrow = turn left (counter-clockwise)
            this.truck.turning = 0.02;
        } else if (this.keys.ArrowRight) {
            // Right arrow = turn right (clockwise)
            this.truck.turning = -0.02;
        }
        
        // Shooting
        if (this.keys[' '] && this.shootCooldown <= 0 && this.ammo > 0 && this.reloadTime <= 0) {
            this.shoot();
            this.shootCooldown = 10;
            this.ammo--;
            this.updateAmmoDisplay();
        }
        
        // Decrease cooldown
        if (this.shootCooldown > 0) {
            this.shootCooldown--;
        }
        
        // Auto-reload when empty
        if (this.ammo <= 0 && this.reloadTime <= 0) {
            this.reloadTime = 120;
            this.showReloadingMessage();
        }
        
        // Handle reload timer
        if (this.reloadTime > 0) {
            this.reloadTime--;
            if (this.reloadTime === 0) {
                this.ammo = this.maxAmmo;
                this.updateAmmoDisplay();
                this.hideReloadingMessage();
            }
        }
    }
    
    updateTruck() {
        if (!this.truck) return;
        
        // Update velocity based on acceleration
        this.truck.velocity += this.truck.acceleration;
        
        // Apply speed limits
        const maxSpeed = 1.0;
        if (Math.abs(this.truck.velocity) > maxSpeed) {
            this.truck.velocity = Math.sign(this.truck.velocity) * maxSpeed;
        }
        
        // Apply friction/drag to gradually slow down
        const friction = 0.02;
        this.truck.velocity *= (1 - friction);
        
        // Stop completely if very slow
        if (Math.abs(this.truck.velocity) < 0.001) {
            this.truck.velocity = 0;
        }
        
        // Only update position if moving
        if (Math.abs(this.truck.velocity) > 0) {
            // Calculate movement direction based on truck's rotation
            // FIXED: Ensure correct direction calculation
            const moveX = Math.sin(this.truck.rotation.y) * this.truck.velocity;
            const moveZ = Math.cos(this.truck.rotation.y) * this.truck.velocity;
            
            // Apply movement
            this.truck.position.x += moveX;
            this.truck.position.z += moveZ;
        }
        
        // Apply turning (always update rotation)
        this.truck.rotation.y += this.truck.turning;
        
        // Update speed display
        this.updateSpeedDisplay();
    }
    
    updateCamera() {
        if (!this.camera || !this.truck) return;
        
        // Zoomed out follow camera for better visibility
        const cameraDistance = 8; // Increased from 5 for wider view
        const cameraHeight = 5;   // Increased from 3 for higher perspective
        
        this.camera.position.x = this.truck.position.x - Math.sin(this.truck.rotation.y) * cameraDistance;
        this.camera.position.z = this.truck.position.z - Math.cos(this.truck.rotation.y) * cameraDistance;
        this.camera.position.y = cameraHeight;
        
        // Look at a point slightly ahead of the truck instead of directly at it
        // This gives better visibility of what's in front of the player
        const lookAtPoint = new THREE.Vector3(
            this.truck.position.x + Math.sin(this.truck.rotation.y) * 2,
            this.truck.position.y,
            this.truck.position.z + Math.cos(this.truck.rotation.y) * 2
        );
        
        this.camera.lookAt(lookAtPoint);
    }
    
    animate() {
        if (!this.isInitialized) return;
        
        requestAnimationFrame(() => this.animate());
        
        try {
            // Update game state
            this.update();
            
            // Render scene
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        } catch (error) {
            console.error("Error in animate:", error);
        }
    }

    // Add collision detection and handling to the Game class

    // First, let's add a method to check for collisions with walls
    checkWallCollisions() {
        if (!this.truck) return false;
        
        const arenaSize = 1600; // Updated to match the larger arena
        const halfSize = arenaSize / 2;
        const wallThickness = 10; // Thicker walls in larger arena
        
        // Get truck dimensions - can be dynamic based on type
        let truckWidth, truckLength;
        
        if (this.monsterTruck) {
            const machineType = this.monsterTruck.config.machineType;
            
            if (machineType === 'neon-crusher') {
                truckWidth = 3.5; // Wider for Crusher
                truckLength = 5;
            } else if (machineType === 'cyber-beast') {
                truckWidth = 3;
                truckLength = 5.2;
            } else {
                truckWidth = 2.5; // Grid Ripper
                truckLength = 5;
            }
        } else {
            // Fallback dimensions
            truckWidth = 2;
            truckLength = 3;
        }
        
        // Calculate truck bounds with some buffer for collision detection
        const truckBounds = {
            minX: this.truck.position.x - truckWidth/2 - 0.2,
            maxX: this.truck.position.x + truckWidth/2 + 0.2,
            minZ: this.truck.position.z - truckLength/2 - 0.2,
            maxZ: this.truck.position.z + truckLength/2 + 0.2
        };
        
        // Check collision with each wall
        let collision = false;
        let collisionNormal = { x: 0, z: 0 };
        
        // North wall (back)
        if (truckBounds.minZ <= -halfSize + wallThickness) {
            collision = true;
            collisionNormal = { x: 0, z: 1 }; // Pointing south
            this.truck.position.z = -halfSize + wallThickness + truckLength/2 + 0.2; // Push back
        }
        
        // South wall (front)
        else if (truckBounds.maxZ >= halfSize - wallThickness) {
            collision = true;
            collisionNormal = { x: 0, z: -1 }; // Pointing north
            this.truck.position.z = halfSize - wallThickness - truckLength/2 - 0.2; // Push back
        }
        
        // East wall (right)
        else if (truckBounds.maxX >= halfSize - wallThickness) {
            collision = true;
            collisionNormal = { x: -1, z: 0 }; // Pointing west
            this.truck.position.x = halfSize - wallThickness - truckWidth/2 - 0.2; // Push back
        }
        
        // West wall (left)
        else if (truckBounds.minX <= -halfSize + wallThickness) {
            collision = true;
            collisionNormal = { x: 1, z: 0 }; // Pointing east
            this.truck.position.x = -halfSize + wallThickness + truckWidth/2 + 0.2; // Push back
        }
        
        // Handle collision if detected
        if (collision) {
            this.handleWallCollision(collisionNormal);
            
            // Create more visual feedback for wall collisions in the larger arena
            this.createWallCollisionEffect(this.truck.position, collisionNormal);
        }
        
        return collision;
    }
    
    // Add enhanced wall collision effects for the larger arena
    createWallCollisionEffect(position, normal) {
        // Create a burst of particles at the collision point
        const particleCount = 15;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            // Create particle
            const size = Math.random() * 0.3 + 0.1;
            const particleGeometry = new THREE.SphereGeometry(size, 8, 8);
            const particleMaterial = new THREE.MeshPhongMaterial({
                color: 0xff00ff,
                emissive: 0xff00ff,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position at collision point, slightly offset
            particle.position.set(
                position.x + (Math.random() - 0.5) * 2,
                position.y + Math.random() * 2,
                position.z + (Math.random() - 0.5) * 2
            );
            
            // Set velocity - away from wall
            const speed = Math.random() * 0.2 + 0.1;
            const velocityX = normal.x !== 0 ? normal.x * speed : (Math.random() - 0.5) * speed;
            const velocityZ = normal.z !== 0 ? normal.z * speed : (Math.random() - 0.5) * speed;
            
            particle.userData = {
                velocity: {
                    x: velocityX,
                    y: Math.random() * 0.2 + 0.1, // Up
                    z: velocityZ
                },
                life: 1.0
            };
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate and remove particles
        const animateParticles = () => {
            let allDead = true;
            
            for (let i = 0; i < particles.length; i++) {
                const particle = particles[i];
                
                if (particle.userData.life > 0) {
                    // Update position
                    particle.position.x += particle.userData.velocity.x;
                    particle.position.y += particle.userData.velocity.y;
                    particle.position.z += particle.userData.velocity.z;
                    
                    // Apply gravity
                    particle.userData.velocity.y -= 0.01;
                    
                    // Update life and opacity
                    particle.userData.life -= 0.05;
                    particle.material.opacity = particle.userData.life;
                    
                    // Shrink particle
                    particle.scale.multiplyScalar(0.95);
                    
                    allDead = false;
                } else if (particle.parent) {
                    // Remove dead particles
                    this.scene.remove(particle);
                }
            }
            
            if (!allDead) {
                requestAnimationFrame(animateParticles);
            }
        };
        
        animateParticles();
    }

    // Handle wall collision with damage and bounce effect
    handleWallCollision(normal) {
        // Calculate impact speed (how fast we're moving toward the wall)
        const impactSpeed = Math.abs(this.truck.velocity);
        
        // Only process significant collisions
        if (impactSpeed < 0.05) return;
        
        console.log(`Wall collision detected with impact speed: ${impactSpeed}`);
        
        // Calculate damage based on impact speed
        const damage = Math.floor(impactSpeed * 50);
        
        // Apply damage
        this.takeDamage(damage);
        
        // Bounce effect - reverse velocity with damping
        this.truck.velocity = -this.truck.velocity * 0.7;
        
        // Add visual and audio feedback
        this.showCollisionEffect(impactSpeed);
        
        // Add camera shake based on impact
        this.shakeCamera(impactSpeed * 3);
    }

    // Take damage method
    takeDamage(amount) {
        // Use the provided damage amount directly for better balance
        // Minor minimum to ensure feedback but not too harsh
        const minDamage = 5;
        const appliedAmount = Math.max(amount, minDamage);
        
        // If we have a MonsterTruck instance, use its damage method
        if (this.monsterTruck) {
            // Respect the damage cooldown for more balanced gameplay
            if (this.monsterTruck.damageTimeout <= 0) {
                // Apply damage through MonsterTruck
                const actualDamage = this.monsterTruck.takeDamage(appliedAmount);
                
                // Sync health with monster truck
                this.health = this.monsterTruck.health;
                
                // Add screen flash effect for significant damage
                if (actualDamage > 8) {
                    this.addDamageScreenEffect(actualDamage);
                }
                
                console.log(`Damage: ${actualDamage} points. Health: ${this.health}`);
                
                // Add subtle camera shake for good feedback
                this.shakeCamera(actualDamage / 6);
            } else {
                // Still showing hit but not applying damage during cooldown
                console.log("Hit during damage cooldown - reduced effect");
            }
        } else {
            // Legacy fallback behavior
            this.health = Math.max(0, this.health - appliedAmount);
            console.log(`Damage: ${appliedAmount} points. Health: ${this.health}`);
            
            // Add screen effect for significant damage
            if (appliedAmount > 8) {
                this.addDamageScreenEffect(appliedAmount);
            }
            
            // Add subtle camera shake
            this.shakeCamera(appliedAmount / 6);
        }
        
        // Update HUD
        const healthDisplay = document.getElementById('health');
        if (healthDisplay) {
            // Color coding based on health percentage
            const healthPercent = Math.floor((this.health / this.maxHealth) * 100);
            let healthColor = '#00ff00'; // Green
            
            if (healthPercent < 30) {
                healthColor = '#ff0000'; // Red
            } else if (healthPercent < 70) {
                healthColor = '#ffff00'; // Yellow
            }
            
            healthDisplay.innerHTML = `HEALTH: <span style="color:${healthColor}">${healthPercent}%</span>`;
            
            // Subtle flash on the HUD element for feedback
            if (this.monsterTruck && this.monsterTruck.damageTimeout <= 0) {
                healthDisplay.style.transition = 'none';
                healthDisplay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                
                setTimeout(() => {
                    healthDisplay.style.transition = 'background-color 0.5s ease';
                    healthDisplay.style.backgroundColor = 'transparent';
                }, 50);
            }
        }
        
        // Check for game over
        if (this.health <= 0) {
            this.gameOver();
        }
        
        return appliedAmount; // Return the amount of damage that was actually applied
    }
    
    // Add screen flash effect for damage
    addDamageScreenEffect(amount) {
        // Create a red flash overlay that fades out
        const overlay = document.createElement('div');
        const opacity = Math.min(0.8, amount / 50); // Scale opacity with damage
        
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(255, 0, 0, ${opacity});
            pointer-events: none;
            z-index: 1000;
            transition: opacity 0.5s ease;
        `;
        
        document.body.appendChild(overlay);
        
        // Fade out and remove
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
            }, 500);
        }, 100);
        
        // Add camera shake proportional to damage
        this.shakeCamera(amount / 5);
    }

    // Show collision effect
    showCollisionEffect(intensity) {
        // Flash the screen red
        const flashOverlay = document.createElement('div');
        flashOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(255, 0, 0, ${Math.min(0.7, intensity)});
            pointer-events: none;
            z-index: 1000;
            opacity: 0.7;
        `;
        
        document.body.appendChild(flashOverlay);
        
        // Fade out and remove
        setTimeout(() => {
            flashOverlay.style.transition = 'opacity 0.5s';
            flashOverlay.style.opacity = '0';
            setTimeout(() => {
                flashOverlay.remove();
            }, 500);
        }, 100);
        
        // Add spark particles at collision point
        this.createCollisionSparks();
    }

    // Create spark particles at collision point
    createCollisionSparks() {
        if (!this.scene || !this.truck) return;
        
        // Create 10-20 spark particles
        const sparkCount = 10 + Math.floor(Math.random() * 10);
        const sparkGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        
        // Ensure sparks array exists
        if (!this.sparks) this.sparks = [];
        
        for (let i = 0; i < sparkCount; i++) {
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            
            // Position at truck
            spark.position.copy(this.truck.position);
            
            // Random velocity
            const velocity = {
                x: (Math.random() - 0.5) * 0.3,
                y: Math.random() * 0.2 + 0.1,
                z: (Math.random() - 0.5) * 0.3
            };
            
            // Add to scene
            this.scene.add(spark);
            
            // Add to sparks array for animation
            this.sparks.push({
                mesh: spark,
                velocity: velocity,
                life: 1.0 // Life counter (1.0 to 0.0)
            });
        }
    }

    // Add camera shake effect
    shakeCamera(intensity) {
        if (!this.camera) return;
        
        // Store original camera position
        if (!this.cameraBasePosition) {
            this.cameraBasePosition = {
                x: this.camera.position.x,
                y: this.camera.position.y,
                z: this.camera.position.z
            };
        }
        
        // Set shake parameters
        this.shakeIntensity = intensity;
        this.shakeDuration = 500; // ms
        this.shakeStartTime = Date.now();
        
        // Start shake if not already shaking
        if (!this.isShaking) {
            this.isShaking = true;
            this.updateCameraShake();
        }
    }

    // Update camera shake
    updateCameraShake() {
        if (!this.isShaking || !this.camera) return;
        
        const elapsed = Date.now() - this.shakeStartTime;
        
        if (elapsed < this.shakeDuration) {
            // Calculate remaining shake intensity
            const remaining = 1 - (elapsed / this.shakeDuration);
            const currentIntensity = this.shakeIntensity * remaining;
            
            // Apply random offset to camera
            this.camera.position.x += (Math.random() - 0.5) * currentIntensity;
            this.camera.position.y += (Math.random() - 0.5) * currentIntensity;
            this.camera.position.z += (Math.random() - 0.5) * currentIntensity;
            
            // Continue shaking
            requestAnimationFrame(() => this.updateCameraShake());
        } else {
            // End shake
            this.isShaking = false;
        }
    }

    // Game over method
    gameOver() {
        if (this.isGameOver) return;
        
        this.isGameOver = true;
        console.log("Game over!");
        
        // Create game over overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            font-family: 'Orbitron', sans-serif;
            color: #ff00ff;
        `;

        overlay.innerHTML = `
            <h1 style="text-shadow: 0 0 10px #ff00ff;">GAME OVER!</h1>
            <h2 style="text-shadow: 0 0 10px #ff00ff;">SCORE: ${this.score}</h2>
            <button onclick="window.location.reload()" style="
                background: linear-gradient(45deg, #ff00ff, #aa00ff);
                color: white;
                border: none;
                padding: 15px 30px;
                margin-top: 20px;
                font-size: 18px;
                border-radius: 5px;
                cursor: pointer;
                font-family: 'Orbitron', sans-serif;
                text-transform: uppercase;
                letter-spacing: 2px;
                box-shadow: 0 0 20px rgba(255, 0, 255, 0.5);
            ">TRY AGAIN</button>
        `;

        document.body.appendChild(overlay);
    }

    // Update HUD method
    updateHUD() {
        // Update speed display
        const speedDisplay = document.getElementById('speed');
        if (speedDisplay && this.truck) {
            const speedMPH = Math.abs(Math.round(this.truck.velocity * 100));
            speedDisplay.textContent = `SPEED: ${speedMPH} MPH`;
        }
    }

    // Add shooting mechanics to the Game class

    // Shoot method
    shoot() {
        if (!this.scene || !this.truck) return;
        
        console.log("Shooting projectile");
        
        // Create projectile
        const projectileGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);
        projectileGeometry.rotateX(Math.PI / 2); // Rotate to point forward
        
        const projectileMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 1,
            shininess: 30
        });
        
        const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
        
        // Calculate direction based on truck's rotation - FIXED: Correct direction calculation
        const truckDirection = new THREE.Vector3(
            Math.sin(this.truck.rotation.y), // X component
            0,                               // Y component (level)
            Math.cos(this.truck.rotation.y)  // Z component
        );
        
        // Position at front of truck
        projectile.position.copy(this.truck.position);
        projectile.position.y += 0.5; // Slightly above truck
        projectile.position.x += truckDirection.x * 2; // In front of truck
        projectile.position.z += truckDirection.z * 2;
        
        // Set rotation to match truck direction
        projectile.rotation.y = this.truck.rotation.y;
        
        // Add to scene
        this.scene.add(projectile);
        
        // Store projectile data
        this.projectiles.push({
            mesh: projectile,
            direction: truckDirection,
            speed: 2.0, // Fast projectile
            damage: 20,
            lifetime: 100, // Frames before despawning
            source: 'player'
        });
        
        // Notify multiplayer system about the projectile
        if (this.multiplayer && this.multiplayer.isConnected) {
            this.multiplayer.sendProjectileCreated(this.projectiles[this.projectiles.length - 1]);
        }
        
        // Add muzzle flash effect
        this.createMuzzleFlash(projectile.position.clone(), truckDirection);
        
        // Add recoil effect
        this.truck.velocity -= 0.02; // Small backward push
    }

    // Create muzzle flash effect
    createMuzzleFlash(position, direction) {
        // Create point light for flash
        const flashLight = new THREE.PointLight(0x00ffff, 2, 5);
        flashLight.position.copy(position);
        this.scene.add(flashLight);
        
        // Create flash sprite
        const flashGeometry = new THREE.PlaneGeometry(1, 1);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 1
        });
        
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(position);
        flash.lookAt(position.x + direction.x, position.y + direction.y, position.z + direction.z);
        this.scene.add(flash);
        
        // Fade out and remove
        let flashLife = 5;
        const fadeFlash = () => {
            flashLife--;
            if (flashLife > 0) {
                flashLight.intensity = flashLife / 5 * 2;
                flash.material.opacity = flashLife / 5;
                requestAnimationFrame(fadeFlash);
            } else {
                this.scene.remove(flashLight);
                this.scene.remove(flash);
            }
        };
        
        fadeFlash();
    }

    // Update projectiles
    updateProjectiles() {
        if (!this.projectiles || !this.scene) return;
        
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            
            // Update position using all direction components (x, y, z)
            projectile.mesh.position.x += projectile.direction.x * projectile.speed;
            projectile.mesh.position.y += projectile.direction.y * projectile.speed; // Apply vertical movement
            projectile.mesh.position.z += projectile.direction.z * projectile.speed;
            
            // Rotate projectile to face direction of movement
            if (projectile.direction.length() > 0) {
                // Create a quaternion from the direction vector
                const quaternion = new THREE.Quaternion();
                const upVector = new THREE.Vector3(0, 1, 0);
                
                // Create a dummy object to calculate quaternion
                const lookAt = new THREE.Object3D();
                lookAt.position.copy(projectile.mesh.position);
                lookAt.lookAt(
                    projectile.mesh.position.x + projectile.direction.x,
                    projectile.mesh.position.y + projectile.direction.y,
                    projectile.mesh.position.z + projectile.direction.z
                );
                
                // Apply the rotation
                projectile.mesh.quaternion.copy(lookAt.quaternion);
            }
            
            // Add tracer effect
            this.createProjectileTrail(projectile);
            
            // Decrease lifetime
            projectile.lifetime--;
            
            // Check for collisions
            const hitResult = this.checkProjectileCollisions(projectile);
            
            // Remove if lifetime ended or collision occurred
            if (projectile.lifetime <= 0 || hitResult) {
                this.scene.remove(projectile.mesh);
                this.projectiles.splice(i, 1);
                
                // Create impact effect if collision occurred
                if (hitResult) {
                    this.createImpactEffect(projectile.mesh.position, hitResult);
                }
            }
        }
    }

    // Create projectile trail effect
    createProjectileTrail(projectile) {
        // Create small trail particles
        const trailGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.7
        });
        
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.copy(projectile.mesh.position);
        this.scene.add(trail);
        
        // Fade out and remove
        let trailLife = 10;
        const fadeTrail = () => {
            trailLife--;
            if (trailLife > 0) {
                trail.material.opacity = trailLife / 10 * 0.7;
                trail.scale.multiplyScalar(0.9);
                requestAnimationFrame(fadeTrail);
            } else {
                this.scene.remove(trail);
            }
        };
        
        fadeTrail();
    }

    // Check projectile collisions
    checkProjectileCollisions(projectile) {
        // Get projectile position
        const pos = projectile.mesh.position;
        
        // Check collision with walls
        const arenaSize = 1600;
        const halfSize = arenaSize / 2;
        const wallThickness = 10;
        
        // Wall collision
        if (
            pos.x > halfSize - wallThickness || 
            pos.x < -halfSize + wallThickness ||
            pos.z > halfSize - wallThickness || 
            pos.z < -halfSize + wallThickness
        ) {
            return 'wall';
        }
        
        // Check collision with truck (only if not player's projectile)
        if (projectile.source !== 'player' && this.truck) {
            // Get vehicle dimensions and height based on type
            let truckDimensions = {width: 2, length: 3, height: 1};
            
            if (this.monsterTruck) {
                const machineType = this.monsterTruck.config.machineType;
                
                if (machineType === 'cyber-beast') {
                    truckDimensions = {width: 3, length: 5, height: 2.2}; // Taller with spoiler
                } else if (machineType === 'grid-ripper') {
                    truckDimensions = {width: 3, length: 5, height: 1.6}; // Low-profile
                } else { // neon-crusher
                    truckDimensions = {width: 3, length: 5, height: 2.0}; // Medium height
                }
            }
            
            // Moderately larger collision box for better hit detection but not overpowered
            // Slightly larger than actual vehicle for more reliable hit detection
            const expansionFactor = 0.5; // Reduced from 1.0 for more balanced gameplay
                
            // Create a proper 3D bounding box for the vehicle with reasonable margins
            const truckBounds = {
                minX: this.truck.position.x - (truckDimensions.width / 2) - expansionFactor,
                maxX: this.truck.position.x + (truckDimensions.width / 2) + expansionFactor,
                minY: this.truck.position.y - 0.2, // Less below-ground extension
                maxY: this.truck.position.y + truckDimensions.height + 0.5, // Less excessive height
                minZ: this.truck.position.z - (truckDimensions.length / 2) - expansionFactor,
                maxZ: this.truck.position.z + (truckDimensions.length / 2) + expansionFactor
            };
            
            // Very generous collision detection to ensure hits register
            if (
                pos.x >= truckBounds.minX && 
                pos.x <= truckBounds.maxX &&
                pos.z >= truckBounds.minZ && 
                pos.z <= truckBounds.maxZ &&
                pos.y >= truckBounds.minY &&
                pos.y <= truckBounds.maxY
            ) {
                // Calculate impact point for visuals
                const impactPoint = new THREE.Vector3(pos.x, pos.y, pos.z);
                
                // Apply damage directly from projectile without multiplier
                const baseDamage = projectile.source === 'turret' ? 
                    projectile.damage : projectile.damage; // No additional multiplier
                
                // Ensure damage is reasonable but noticeable
                const actualDamage = baseDamage;
                
                // Log hit information
                console.log(`Hit registered: Vehicle hit for ${actualDamage} damage`);
                
                // Take damage - ensure this works by calling directly
                this.takeDamage(actualDamage);
                
                // Create impact effect at hit position
                this.createProjectileImpactOnVehicle(impactPoint);
                
                return 'player';
            } else {
                // Check if projectile is close to vehicle for debugging
                const distance = Math.sqrt(
                    Math.pow(this.truck.position.x - pos.x, 2) +
                    Math.pow(this.truck.position.y + 1 - pos.y, 2) +
                    Math.pow(this.truck.position.z - pos.z, 2)
                );
                
                // Log near misses for debugging
                if (distance < 5) {
                    console.log(`Near miss: distance=${distance.toFixed(2)}, pos=${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}`);
                }
            }
        }
        
        // Check collision with turrets (if implemented)
        if (this.turrets) {
            for (let i = 0; i < this.turrets.length; i++) {
                const turret = this.turrets[i];
                
                // Skip destroyed turrets
                if (turret.destroyed) continue;
                
                const turretBounds = {
                    minX: turret.mesh.position.x - 1.5,
                    maxX: turret.mesh.position.x + 1.5,
                    minZ: turret.mesh.position.z - 1.5,
                    maxZ: turret.mesh.position.z + 1.5
                };
                
                if (
                    pos.x >= turretBounds.minX && 
                    pos.x <= turretBounds.maxX &&
                    pos.z >= turretBounds.minZ && 
                    pos.z <= turretBounds.maxZ &&
                    pos.y <= turret.mesh.position.y + 2
                ) {
                    // Turret hit by projectile
                    if (projectile.source === 'player') {
                        this.damageTurret(turret, projectile.damage);
                        return 'turret';
                    }
                }
            }
        }
        
        // Check for collisions with multiplayer players
        if (this.multiplayer && this.multiplayer.isConnected) {
            if (projectile.source === 'player' && this.multiplayer.checkProjectileHits(projectile)) {
                return 'remote-player';
            }
        }
        
        return null;
    }

    // Create impact effect
    createImpactEffect(position, targetType) {
        // Create flash
        const impactLight = new THREE.PointLight(
            targetType === 'wall' ? 0x00ffff : 0xff0000, 
            1, 
            5
        );
        impactLight.position.copy(position);
        this.scene.add(impactLight);
        
        // Create particles
        const particleCount = 10;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: targetType === 'wall' ? 0x00ffff : 0xff0000,
                transparent: true,
                opacity: 1
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            
            // Random velocity
            particle.velocity = {
                x: (Math.random() - 0.5) * 0.2,
                y: Math.random() * 0.2,
                z: (Math.random() - 0.5) * 0.2
            };
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate particles
        let impactLife = 20;
        const animateImpact = () => {
            impactLife--;
            
            if (impactLife > 0) {
                // Update light
                impactLight.intensity = impactLife / 20;
                
                // Update particles
                for (const particle of particles) {
                    particle.position.x += particle.velocity.x;
                    particle.position.y += particle.velocity.y;
                    particle.position.z += particle.velocity.z;
                    
                    // Apply gravity
                    particle.velocity.y -= 0.01;
                    
                    // Fade out
                    particle.material.opacity = impactLife / 20;
                }
                
                requestAnimationFrame(animateImpact);
            } else {
                // Remove light and particles
                this.scene.remove(impactLight);
                for (const particle of particles) {
                    this.scene.remove(particle);
                }
            }
        };
        
        animateImpact();
    }
    
    // Create impact effect specifically for vehicle hits
    createProjectileImpactOnVehicle(position) {
        if (!this.scene) return;
        
        // Create a more intense impact for vehicle hits
        
        // 1. Add intense flash
        const impactLight = new THREE.PointLight(0xff3300, 2, 8);
        impactLight.position.copy(position);
        this.scene.add(impactLight);
        
        // 2. Add sparks, smoke and fire effect
        const particleCount = 20;
        const particles = [];
        
        // Create smoke and fire particles
        for (let i = 0; i < particleCount; i++) {
            // Alternating colors for fire and smoke effect
            const isFire = i % 3 === 0;
            const isSmoke = i % 3 === 1;
            const isSpark = i % 3 === 2;
            
            const size = isSpark ? 0.08 : (Math.random() * 0.2 + 0.1);
            const particleGeometry = new THREE.SphereGeometry(size, 6, 6);
            
            const particleColor = isFire ? 0xff5500 : (isSmoke ? 0x333333 : 0xff0000);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: particleColor,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            
            // Random velocities
            const speed = isSpark ? 0.3 : 0.15;
            particle.velocity = {
                x: (Math.random() - 0.5) * speed,
                y: Math.random() * 0.2 + (isSpark ? 0.15 : 0.05),
                z: (Math.random() - 0.5) * speed
            };
            
            // Add unique properties
            particle.isFire = isFire;
            particle.isSmoke = isSmoke;
            particle.isSpark = isSpark;
            particle.fadeRate = isSpark ? 0.1 : (isFire ? 0.04 : 0.02);
            particle.gravity = isSpark ? 0.02 : (isFire ? 0.005 : 0.001);
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // 3. Add metal debris
        const debrisCount = 5;
        for (let i = 0; i < debrisCount; i++) {
            const debrisGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
            const debrisMaterial = new THREE.MeshPhongMaterial({
                color: 0x777777,
                shininess: 80
            });
            
            const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
            debris.position.copy(position);
            
            // Higher velocity for debris
            debris.velocity = {
                x: (Math.random() - 0.5) * 0.4,
                y: Math.random() * 0.3 + 0.2,
                z: (Math.random() - 0.5) * 0.4
            };
            
            // Add rotation
            debris.rotationSpeed = {
                x: (Math.random() - 0.5) * 0.2,
                y: (Math.random() - 0.5) * 0.2,
                z: (Math.random() - 0.5) * 0.2
            };
            
            this.scene.add(debris);
            particles.push(debris);
        }
        
        // 4. Animate everything
        let impactLife = 30;
        const animateVehicleImpact = () => {
            impactLife--;
            
            if (impactLife > 0) {
                // Update light
                impactLight.intensity = (impactLife / 30) * 2;
                
                // Update particles
                for (const particle of particles) {
                    // Update position
                    particle.position.x += particle.velocity.x;
                    particle.position.y += particle.velocity.y;
                    particle.position.z += particle.velocity.z;
                    
                    // Apply gravity
                    particle.velocity.y -= particle.gravity || 0.01;
                    
                    // Update rotation for debris
                    if (particle.rotationSpeed) {
                        particle.rotation.x += particle.rotationSpeed.x;
                        particle.rotation.y += particle.rotationSpeed.y;
                        particle.rotation.z += particle.rotationSpeed.z;
                    }
                    
                    // Handle fading
                    if (particle.material && particle.material.opacity) {
                        particle.material.opacity -= particle.fadeRate || 0.03;
                    }
                    
                    // Fire particles should change color as they cool down
                    if (particle.isFire && impactLife < 20) {
                        const r = 1;
                        const g = Math.max(0, (impactLife / 20) * 0.8);
                        const b = 0;
                        particle.material.color.setRGB(r, g, b);
                    }
                    
                    // Smoke particles should expand
                    if (particle.isSmoke) {
                        particle.scale.multiplyScalar(1.03);
                    }
                }
                
                requestAnimationFrame(animateVehicleImpact);
            } else {
                // Remove everything
                this.scene.remove(impactLight);
                for (const particle of particles) {
                    this.scene.remove(particle);
                }
            }
        };
        
        animateVehicleImpact();
    }

    // Update ammo display
    updateAmmoDisplay() {
        const ammoDisplay = document.getElementById('ammo');
        if (ammoDisplay) {
            ammoDisplay.textContent = `AMMO: ${this.ammo}/${this.maxAmmo}`;
        }
    }

    // Show reloading message
    showReloadingMessage() {
        const ammoDisplay = document.getElementById('ammo');
        if (ammoDisplay) {
            ammoDisplay.innerHTML = `<span style="color: #ff0000;">RELOADING...</span>`;
        }
    }

    // Hide reloading message
    hideReloadingMessage() {
        const ammoDisplay = document.getElementById('ammo');
        if (ammoDisplay) {
            ammoDisplay.textContent = `AMMO: ${this.ammo}/${this.maxAmmo}`;
        }
    }

    // Add turret-related methods to the Game class

    // Create turrets
    createTurrets() {
        if (!this.scene) return;
        
        console.log("Creating turrets");
        
        // Reset turrets array
        this.turrets = [];
        
        // Debug - log scene children count
        console.log(`Scene has ${this.scene.children.length} objects before creating turrets`);
        
        // Create a balanced number of turrets around the much larger arena
        const arenaSize = 1600; // Matches the new arena size
        const innerRadius = 300; // Distance from center for inner turrets
        const midRadius = 600;   // Distance from center for mid turrets
        const outerRadius = 750; // Distance from center for outer perimeter turrets
        
        // Turret positioning for better coverage in the large arena
        // Strategic placement to create defended zones and safe zones
        const turretPositions = [
            // Inner defense ring - covers the center area
            { x: innerRadius, z: 0 },
            { x: -innerRadius, z: 0 },
            { x: 0, z: innerRadius },
            { x: 0, z: -innerRadius },
            
            // Mid-distance turrets at 45 degree angles
            { x: midRadius * 0.7, z: midRadius * 0.7 },
            { x: midRadius * 0.7, z: -midRadius * 0.7 },
            { x: -midRadius * 0.7, z: midRadius * 0.7 },
            { x: -midRadius * 0.7, z: -midRadius * 0.7 },
            
            // Outer defense perimeter
            { x: outerRadius, z: outerRadius },
            { x: -outerRadius, z: outerRadius },
            { x: outerRadius, z: -outerRadius },
            { x: -outerRadius, z: -outerRadius }
        ];
        
        turretPositions.forEach(pos => {
            this.createTurret(pos.x, pos.z);
        });
        
        // Debug - log total turrets created
        console.log(`Created ${this.turrets.length} turrets`);
    }

    // Create a single turret
    createTurret(x, z) {
        // Create base
        const baseGeometry = new THREE.CylinderGeometry(2, 2.5, 1, 16);
        const baseMaterial = new THREE.MeshPhongMaterial({
            color: 0x333333,
            shininess: 30
        });
        
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(x, 0.5, z);
        base.name = "turret_base"; // Explicitly name it to avoid confusion with walls
        this.scene.add(base);
        
        // Create turret body
        const bodyGeometry = new THREE.BoxGeometry(2, 1.5, 2);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0x666666,
            shininess: 30
        });
        
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.set(0, 1.25, 0);
        base.add(body);
        
        // Create gun barrel - positioned higher to better target vehicle bodies
        const barrelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
        barrelGeometry.rotateX(Math.PI / 2); // Rotate to point forward
        
        const barrelMaterial = new THREE.MeshPhongMaterial({
            color: 0x444444,
            shininess: 50
        });
        
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.position.set(0, 0.4, 1.5); // Raised position to better hit all vehicle types
        body.add(barrel);
        
        // Add a second barrel for wider coverage (targeting taller vehicles)
        const upperBarrel = new THREE.Mesh(barrelGeometry, barrelMaterial.clone());
        upperBarrel.position.set(0, 0.8, 1.3); // Higher position for taller vehicles
        body.add(upperBarrel);
        
        // Add turret to list
        this.turrets.push({
            mesh: base,
            body: body,
            barrel: barrel,
            upperBarrel: body.children[1], // Reference to upper barrel
            health: 100,
            maxHealth: 100,
            shootCooldown: Math.floor(Math.random() * 60), // Random initial cooldown
            destroyed: false,
            lastShotTime: 0
        });
    }

    // Update turrets
    updateTurrets() {
        if (!this.turrets || !this.truck) {
            console.log("No turrets or truck found in updateTurrets");
            return;
        }
        
        // Debug - log how many turrets we're updating
        console.log(`Updating ${this.turrets.length} turrets`);
        
        for (const turret of this.turrets) {
            // Skip destroyed turrets
            if (turret.destroyed) continue;
            
            // Calculate direction to player
            const directionToPlayer = new THREE.Vector3(
                this.truck.position.x - turret.mesh.position.x,
                0,
                this.truck.position.z - turret.mesh.position.z
            );
            
            // Calculate distance to player
            const distanceToPlayer = directionToPlayer.length();
            
            // Only track and shoot if player is within range
            // Increased range to match larger arena, but still limited for gameplay balance
            if (distanceToPlayer < 300) {
                // Normalize direction
                directionToPlayer.normalize();
                
                // Calculate target rotation
                const targetRotation = Math.atan2(directionToPlayer.x, directionToPlayer.z);
                
                // Smoothly rotate body towards player
                const currentRotation = turret.body.rotation.y;
                const rotationDiff = targetRotation - currentRotation;
                
                // Handle angle wrapping
                let shortestRotation = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
                
                // Apply rotation with less aggressive smoothing
                // Reduced rotation speed to give player more time to react
                turret.body.rotation.y += shortestRotation * 0.02; // Reduced from 0.05
                
                // Shoot at player if cooldown is ready and more precisely facing player
                // Stricter angle check to compensate for slower turning
                if (
                    turret.shootCooldown <= 0 && 
                    Math.abs(shortestRotation) < 0.2 && // More precise angle requirement (reduced from 0.3)
                    this.canTurretSeePlayer(turret)
                ) {
                    this.turretShoot(turret);
                    
                    // More balanced cooldown for reasonable shooting frequency
                    // Random component to prevent all turrets firing at once
                    turret.shootCooldown = 90 + Math.floor(Math.random() * 60); // ~1.5-2.5 seconds between shots
                    turret.lastShotTime = Date.now();
                }
            }
            
            // Decrease cooldown
            if (turret.shootCooldown > 0) {
                turret.shootCooldown--;
            }
            
            // Pulse effect for active turrets
            const timeSinceShot = Date.now() - turret.lastShotTime;
            if (timeSinceShot < 1000) {
                const pulse = 1 + Math.sin(timeSinceShot / 100) * 0.1;
                turret.body.scale.set(pulse, pulse, pulse);
            } else {
                turret.body.scale.set(1, 1, 1);
            }
        }
    }

    // Check if turret has line of sight to player
    canTurretSeePlayer(turret) {
        if (!this.truck) return false;
        
        // Create ray from turret to player
        const start = new THREE.Vector3(
            turret.mesh.position.x,
            turret.mesh.position.y + 1.5,
            turret.mesh.position.z
        );
        
        const end = new THREE.Vector3(
            this.truck.position.x,
            this.truck.position.y + 0.5,
            this.truck.position.z
        );
        
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        
        // Simple line of sight check - could be enhanced with raycasting
        return true; // For now, always return true
    }

    // Turret shoot method
    turretShoot(turret) {
        if (!this.scene || turret.destroyed) return;
        
        // Determine which barrel to use based on vehicle height
        // This ensures we target the right part of different vehicles
        const useUpperBarrel = this.shouldUseUpperBarrel();
        
        // Get barrel position and direction
        const barrelWorldPos = new THREE.Vector3();
        
        // Get position of the appropriate barrel
        if (useUpperBarrel && turret.upperBarrel) {
            // Use upper barrel for taller vehicles
            turret.upperBarrel.getWorldPosition(barrelWorldPos);
        } else {
            // Use main barrel for normal/low vehicles
            turret.barrel.getWorldPosition(barrelWorldPos);
        }
        
        // Get vehicle height based on type for proper targeting
        let vehicleHeight = 1.0; // Default height
        let targetOffset = 0.0; // Vertical offset for targeting
        
        if (this.monsterTruck) {
            const machineType = this.monsterTruck.config.machineType;
            
            // Different heights for different vehicle types
            if (machineType === 'cyber-beast') {
                vehicleHeight = 1.2; // Taller for Cyber Beast (has spoiler)
                targetOffset = 0.6; // Target higher
            } else if (machineType === 'grid-ripper') {
                vehicleHeight = 0.8; // Lower for Grid Ripper (streamlined)
                targetOffset = 0.4; // Target lower
            } else {
                vehicleHeight = 1.0; // Medium height for Neon Crusher
                targetOffset = 0.5; // Target middle
            }
        }
        
        // Calculate 3D direction including height component
        const directionToPlayer = new THREE.Vector3(
            this.truck.position.x - turret.mesh.position.x,
            (this.truck.position.y + targetOffset) - barrelWorldPos.y, // Target specific part of vehicle
            this.truck.position.z - turret.mesh.position.z
        ).normalize();
        
        // Create moderately sized projectile for better visibility but balanced damage
        const projectileGeometry = new THREE.SphereGeometry(0.5, 8, 8); // Still visible but not huge
        const projectileMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.6, // Not too bright
            transparent: true,
            opacity: 0.8
        });
        
        const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
        projectile.position.copy(barrelWorldPos);
        
        // Add to scene
        this.scene.add(projectile);
        
        // Add subtler light to the projectile for better visibility
        const projectileLight = new THREE.PointLight(0xff0000, 0.7, 3);
        projectile.add(projectileLight);
        
        // Calculate damage for approximately 7 shots to drain full health (assuming 100 health)
        // For most vehicles with 100 health, 7 shots means about 14-15 damage per shot
        // We'll use a range of 13-17 damage for variety
        const baseDamage = 14 + Math.floor(Math.random() * 3) - 1; // Damage range 13-16
        
        // Store projectile data with 3D direction
        this.projectiles.push({
            mesh: projectile,
            direction: directionToPlayer, // Full 3D direction
            speed: 1.8, // Moderate speed for balanced gameplay
            damage: baseDamage, // More balanced damage
            lifetime: 90, // Slightly longer lifetime due to slower speed
            source: 'turret'
        });
        
        // Add muzzle flash effect
        this.createMuzzleFlash(barrelWorldPos, directionToPlayer);
        
        // Log targeting info for debugging
        if (this.debugMode) {
            console.log(`Turret targeting vehicle at y=${this.truck.position.y + targetOffset} from y=${barrelWorldPos.y}, using ${useUpperBarrel ? 'upper' : 'lower'} barrel`);
        }
    }
    
    // Helper method to determine which barrel to use based on vehicle type
    shouldUseUpperBarrel() {
        if (!this.monsterTruck) return false;
        
        const machineType = this.monsterTruck.config.machineType;
        
        // Use upper barrel for taller vehicles
        return machineType === 'cyber-beast';
    }

    // Damage turret method
    damageTurret(turret, amount) {
        // Reduce health
        turret.health -= amount;
        
        // Check if destroyed
        if (turret.health <= 0 && !turret.destroyed) {
            this.destroyTurret(turret);
        } else {
            // Visual feedback for damage
            turret.mesh.material = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 1
            });
            
            // Fade back to normal
            setTimeout(() => {
                if (!turret.destroyed) {
                    turret.mesh.material = new THREE.MeshPhongMaterial({
                        color: 0x333333,
                        shininess: 30
                    });
                }
            }, 200);
        }
    }

    // Destroy turret method
    destroyTurret(turret) {
        turret.destroyed = true;
        
        // Change appearance
        turret.mesh.material = new THREE.MeshPhongMaterial({
            color: 0x000000,
            emissive: 0xff0000,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.8
        });
        
        // Tilt to show destruction
        turret.mesh.rotation.x = Math.random() * 0.5 - 0.25;
        turret.mesh.rotation.z = Math.random() * 0.5 - 0.25;
        
        // Create explosion effect
        this.createExplosion(turret.mesh.position);
        
        // Increase score
        this.score += 100;
        
        // Update score display
        const scoreDisplay = document.getElementById('score');
        if (scoreDisplay) {
            scoreDisplay.textContent = `SCORE: ${this.score}`;
        }
    }

    // Create explosion effect
    createExplosion(position) {
        // Create flash
        const explosionLight = new THREE.PointLight(0xff5500, 3, 20);
        explosionLight.position.copy(position);
        explosionLight.position.y += 2;
        this.scene.add(explosionLight);
        
        // Create explosion particles
        const particleCount = 30;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const size = Math.random() * 0.5 + 0.2;
            const particleGeometry = new THREE.SphereGeometry(size, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xff5500 : 0xffff00,
                transparent: true,
                opacity: 1
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            particle.position.y += 2;
            
            // Random velocity
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.3 + 0.1;
            particle.velocity = {
                x: Math.cos(angle) * speed,
                y: Math.random() * 0.3 + 0.2,
                z: Math.sin(angle) * speed
            };
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate explosion
        let explosionLife = 60;
        const animateExplosion = () => {
            explosionLife--;
            
            if (explosionLife > 0) {
                // Update light
                explosionLight.intensity = explosionLife / 20;
                
                // Update particles
                for (const particle of particles) {
                    particle.position.x += particle.velocity.x;
                    particle.position.y += particle.velocity.y;
                    particle.position.z += particle.velocity.z;
                    
                    // Apply gravity
                    particle.velocity.y -= 0.01;
                    
                    // Fade out
                    particle.material.opacity = explosionLife / 60;
                }
                
                requestAnimationFrame(animateExplosion);
            } else {
                // Remove light and particles
                this.scene.remove(explosionLight);
                for (const particle of particles) {
                    this.scene.remove(particle);
                }
            }
        };
        
        animateExplosion();
    }

    // Initialize with ammo display
    initHUD() {
        const playerName = document.getElementById('playerName');
        const health = document.getElementById('health');
        const score = document.getElementById('score');
        const ammo = document.getElementById('ammo');
        
        if (playerName) playerName.textContent = localStorage.getItem('monsterTruckNickname') || 'PLAYER';
        if (health) health.innerHTML = `HEALTH: <span style="color:#00ff00">${this.health}%</span>`;
        if (score) score.textContent = `SCORE: ${this.score}`;
        if (ammo) ammo.textContent = `AMMO: ${this.ammo}/${this.maxAmmo}`;
    }

    // Debug method to help diagnose movement issues
    debugMovement() {
        if (!this.truck) return;
        
        console.log({
            position: {
                x: this.truck.position.x.toFixed(2),
                y: this.truck.position.y.toFixed(2),
                z: this.truck.position.z.toFixed(2)
            },
            rotation: {
                y: (this.truck.rotation.y * 180 / Math.PI).toFixed(2) + "°"
            },
            velocity: this.truck.velocity.toFixed(3),
            acceleration: this.truck.acceleration.toFixed(3),
            turning: this.truck.turning.toFixed(3),
            controls: {
                up: this.keys.ArrowUp,
                down: this.keys.ArrowDown,
                left: this.keys.ArrowLeft,
                right: this.keys.ArrowRight
            }
        });
    }

    // Update speed display
    updateSpeedDisplay() {
        const speedDisplay = document.getElementById('speed');
        if (speedDisplay && this.truck) {
            const speedMPH = Math.abs(Math.round(this.truck.velocity * 100));
            speedDisplay.textContent = `SPEED: ${speedMPH} MPH`;
        }
    }

    // Add the missing updateSparks function
    updateSparks() {
        if (!this.sparks || !this.scene || this.sparks.length === 0) return;
        
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const spark = this.sparks[i];
            
            // Update position
            spark.mesh.position.x += spark.velocity.x;
            spark.mesh.position.y += spark.velocity.y;
            spark.mesh.position.z += spark.velocity.z;
            
            // Apply gravity
            spark.velocity.y -= 0.01;
            
            // Reduce life
            spark.life -= 0.02;
            
            // Scale down as life decreases
            spark.mesh.scale.set(spark.life, spark.life, spark.life);
            
            // Remove if dead
            if (spark.life <= 0) {
                this.scene.remove(spark.mesh);
                this.sparks.splice(i, 1);
            }
        }
    }
    
    // Animate stadium spectators
    updateSpectators() {
        if (!this.spectators || this.spectators.length === 0) return;
        
        const time = performance.now() * 0.001;
        
        this.spectators.forEach(spectator => {
            if (!spectator.userData) return;
            
            const offset = spectator.userData.animationOffset || 0;
            const initialY = spectator.userData.initialY || spectator.position.y;
            
            // Animate spectators bobbing up and down
            spectator.position.y = initialY + Math.sin(time * 2 + offset) * 0.3;
            spectator.rotation.x = Math.sin(time * 2 + offset) * 0.1;
            spectator.rotation.z = Math.cos(time * 3 + offset) * 0.1;
        });
    }

    createStadium() {
        // Remove existing obstacles and walls
        this.scene.children = this.scene.children.filter(child => 
            !child.isWall && !child.isObstacle
        );

        const bleacherGeometry = new THREE.CylinderGeometry(100, 120, 30, 96, 5, true);
        const bleacherMaterial = new THREE.MeshPhongMaterial({
            color: 0x444444,
            side: THREE.DoubleSide,
            flatShading: true
        });
        
        const stadium = new THREE.Mesh(bleacherGeometry, bleacherMaterial);
        stadium.position.y = 15;
        this.scene.add(stadium);

        // Create animated crowd
        const crowdCount = 1000;
        const spectatorGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const spectatorMaterials = [
            new THREE.MeshPhongMaterial({ color: 0xff0000 }), // Red
            new THREE.MeshPhongMaterial({ color: 0x00ff00 }), // Green
            new THREE.MeshPhongMaterial({ color: 0x0000ff }), // Blue
            new THREE.MeshPhongMaterial({ color: 0xffff00 }), // Yellow
            new THREE.MeshPhongMaterial({ color: 0xff00ff }), // Purple
        ];

        this.spectators = [];
        
        for (let i = 0; i < crowdCount; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const radius = 105 + Math.random() * 10;
            const height = 20 + Math.random() * 8;
            
            const spectator = new THREE.Mesh(
                spectatorGeometry,
                spectatorMaterials[Math.floor(Math.random() * spectatorMaterials.length)]
            );
            
            spectator.position.x = Math.cos(angle) * radius;
            spectator.position.z = Math.sin(angle) * radius;
            spectator.position.y = height;
            
            spectator.userData.animationOffset = Math.random() * Math.PI * 2;
            spectator.userData.initialY = height;
            
            this.spectators.push(spectator);
            this.scene.add(spectator);
        }

        // Add stadium lights
        const lightPositions = [
            { x: 80, z: 80 },
            { x: -80, z: 80 },
            { x: 80, z: -80 },
            { x: -80, z: -80 }
        ];

        lightPositions.forEach(pos => {
            const light = new THREE.SpotLight(0xffffff, 100);
            light.position.set(pos.x, 60, pos.z);
            light.angle = Math.PI / 6;
            light.penumbra = 0.3;
            light.decay = 1;
            light.distance = 200;
            light.target.position.set(0, 0, 0);
            this.scene.add(light);
            this.scene.add(light.target);
        });
    }

    updateSpectators(deltaTime) {
        const time = performance.now() * 0.001;
        
        this.spectators.forEach(spectator => {
            const offset = spectator.userData.animationOffset;
            const initialY = spectator.userData.initialY;
            
            // Animate spectators bobbing up and down
            spectator.position.y = initialY + Math.sin(time * 2 + offset) * 0.3;
            spectator.rotation.x = Math.sin(time * 2 + offset) * 0.1;
            spectator.rotation.z = Math.cos(time * 3 + offset) * 0.1;
        });
    }

    // NOTE: This was duplicate code, removed as it's implemented elsewhere

    // Note: This is just a method, not a second constructor
    initStadium() {
        // Replace standard walls with stadium
        this.createStadium();
    }
    
    // Initialize multiplayer functionality
    initMultiplayer() {
        // Import and initialize the multiplayer manager
        import('./Multiplayer.js').then(module => {
            this.multiplayer = new module.MultiplayerManager(this);
            
            // Connect to multiplayer server
            this.multiplayer.connect().then(success => {
                if (success) {
                    console.log("Connected to multiplayer server");
                } else {
                    console.warn("Failed to connect to multiplayer server");
                }
            });
        }).catch(error => {
            console.error("Error loading multiplayer module:", error);
        });
    }
}

// Initialize game when window is fully loaded
window.addEventListener('load', () => {
    console.log("Window loaded, creating game");
    new Game();
});

export default Game;
