import * as THREE from 'three';
import { MonsterTruck } from './MonsterTruck.js';
import { World } from './World.js';
import Multiplayer from './Multiplayer.js';
import { Weapon, WeaponTypes, WeaponPickup } from './Weapons.js';

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
        this.frameCount = 0; // For timing various events
        
        // Controls
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            ' ': false,
            'd': false, // Debug key
            'm': false, // Debug movement
            'M': false, // Audio mute toggle
            'p': false  // Debug powerup spawn key
        };
        
        // Game state
        this.health = 100;
        this.score = 0;
        this.sparks = [];
        
        // Audio controls
        this.backgroundMusic = document.getElementById('backgroundMusic');
        this.audioToggle = document.getElementById('audioToggle');
        this.isMuted = localStorage.getItem('monsterTruckAudioMuted') === 'true';
        
        // Weapon and shooting mechanics
        this.projectiles = [];
        this.weapons = [];
        this.currentWeaponIndex = 0;
        this.weaponPickups = [];
        this.lastWeaponPickupSpawn = 0;
        this.weaponPickupSpawnInterval = 8000; // Spawn weapon pickup more frequently (8 seconds)
        
        // Initialize weapons
        this.initializeWeapons();
        
        // Add powerup properties
        this.powerups = [];
        this.activePowerups = new Map();
        this.lastPowerupSpawn = 0;
        this.powerupSpawnInterval = 5000; // Spawn more frequently (5 seconds)
        
        // Powerup definitions
        this.powerupTypes = {
            SPEED_BOOST: {
                name: 'Speed Boost',
                duration: 5000,
                effect: 'Doubles speed',
                color: 0x00ff00,
                emissive: 0x00ff00,
                model: 'lightning',
                apply: () => {
                    this.truck.maxSpeed *= 2;
                },
                remove: () => {
                    this.truck.maxSpeed /= 2;
                }
            },
            INVINCIBILITY: {
                name: 'Invincibility',
                duration: 3000,
                effect: 'No damage',
                color: 0xffff00,
                emissive: 0xffff00,
                model: 'star',
                apply: () => {
                    this.truck.isInvincible = true;
                },
                remove: () => {
                    this.truck.isInvincible = false;
                }
            },
            REPAIR: {
                name: 'Repair',
                duration: 0, // Instant effect
                effect: 'Restore 50 health',
                color: 0xff0000,
                emissive: 0xff0000,
                model: 'heart',
                apply: () => {
                    this.health = Math.min(100, this.health + 50);
                    if (this.monsterTruck) {
                        this.monsterTruck.health = Math.min(this.monsterTruck.maxHealth, this.monsterTruck.health + 50);
                    }
                },
                remove: () => {} // No removal needed for instant effects
            },
            AMMO_REFILL: {
                name: 'Ammo Refill',
                duration: 0, // Instant effect
                effect: 'Refill ammo',
                color: 0x0000ff,
                emissive: 0x0000ff,
                model: 'ammo',
                apply: () => {
                    this.ammo = this.maxAmmo;
                    this.updateAmmoDisplay();
                },
                remove: () => {} // No removal needed for instant effects
            },
            DAMAGE_BOOST: {
                name: 'Damage Boost',
                duration: 8000,
                effect: 'Double damage',
                color: 0xff00ff,
                emissive: 0xff00ff,
                model: 'lightning',
                apply: () => {
                    this.damageMultiplier = 2;
                },
                remove: () => {
                    this.damageMultiplier = 1;
                }
            },
            SHIELD: {
                name: 'Shield',
                duration: 10000,
                effect: 'Absorbs one hit',
                color: 0x00ffff,
                emissive: 0x00ffff,
                model: 'shield',
                apply: () => {
                    this.hasShield = true;
                    this.createShieldEffect();
                },
                remove: () => {
                    this.hasShield = false;
                    this.removeShieldEffect();
                }
            }
        };
        
        // Initialize damage multiplier
        this.damageMultiplier = 1;
        this.hasShield = false;
        this.shieldMesh = null;
        
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
        
        // Check multiplayer preference
        this.isMultiplayerEnabled = localStorage.getItem('monsterTruckMultiplayer') === 'true';
        
        // Initialize multiplayer only if enabled
        if (this.isMultiplayerEnabled) {
            this.initMultiplayer();
        }
        
        // Powerup sounds
        this.powerupSounds = {
            speed: new Audio('sounds/powerup_speed.mp3'),
            shield: new Audio('sounds/powerup_shield.mp3'),
            damage: new Audio('sounds/powerup_damage.mp3'),
            health: new Audio('sounds/powerup_health.mp3'),
            ammo: new Audio('sounds/powerup_ammo.mp3')
        };
        
        // Set fallback sounds in case the specific ones aren't available
        Object.keys(this.powerupSounds).forEach(key => {
            this.powerupSounds[key].addEventListener('error', () => {
                console.log(`Fallback for powerup sound: ${key}`);
                this.powerupSounds[key].src = 'sounds/powerup_generic.mp3';
            });
        });
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
                    
                    // Audio toggle with M key
                    if (e.key === 'M') {
                        this.toggleAudio();
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
    
    update(deltaTime) {
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
                
                // Check for game over condition after health sync
                if (this.health <= 0 && !this.isGameOver) {
                    console.log("Game over condition detected in update loop!");
                    this.gameOver();
                }
            }
            
            // Check for wall collisions
            if (typeof this.checkWallCollisions === 'function') {
                this.checkWallCollisions();
            }
            
            // Update weapons and their projectiles - with safety checks
            if (this.weapons && Array.isArray(this.weapons) && this.weapons.length > 0) {
                // Update all weapons
                this.weapons.forEach(weapon => {
                    if (weapon && typeof weapon.update === 'function') {
                        weapon.update();
                    }
                });
                
                // Only update display and check hits if we have valid weapons
                if (this.getCurrentWeapon()) {
                    // Update weapon display (will update cooldown indicator)
                    this.updateWeaponDisplay();
                    
                    // Check for projectile hits on enemies
                    if (typeof this.checkProjectileHits === 'function') {
                        this.checkProjectileHits();
                    }
                }
            }
            
            // Make sure we update projectiles from the original system too
            if (typeof this.updateProjectiles === 'function') {
                this.updateProjectiles();
            }
            
            // Update weapon pickups with safety check
            if (typeof this.updateWeaponPickups === 'function' && Array.isArray(this.weaponPickups)) {
                this.updateWeaponPickups();
            }
            
            // Update powerups
            if (typeof this.updatePowerups === 'function') {
                this.updatePowerups();
            }
            
            // Update turrets
            if (typeof this.updateTurrets === 'function') {
                this.updateTurrets();
            }
            
            // Update visual effects
            if (typeof this.updateSparks === 'function' && this.sparks && this.sparks.length > 0) {
                this.updateSparks();
            }
            
            // Update special effects if any
            if (this.specialEffects && this.specialEffects.length > 0) {
                this.updateSpecialEffects();
            }
            
            // Update stadium spectators
            if (typeof this.updateSpectators === 'function' && this.spectators) {
                this.updateSpectators();
            }
            
            // Update camera to follow truck
            if (typeof this.updateCamera === 'function' && this.camera && this.truck) {
                this.updateCamera();
            }
            
            // Update HUD - with safety check
            if (typeof this.updateHUD === 'function') {
                this.updateHUD();
            }
            
            // Update multiplayer
            if (this.multiplayer) {
                this.multiplayer.update();
            }
            
            // Debug info - update position display
            if (this.truck && window.updateDebugInfo) {
                window.updateDebugInfo(this.truck.position);
            }
        } catch (error) {
            console.error("Error in game update loop:", error);
            console.error(error.stack); // Print stack trace for better debugging
        }
    }
    
    // Check for projectile hits
    checkProjectileHits() {
        if (!this.weapons || !this.turrets) return;
        
        // Loop through all weapons
        this.weapons.forEach(weapon => {
            // Loop through all turrets
            this.turrets.forEach(turret => {
                // Skip destroyed turrets
                if (turret.destroyed) return;
                
                // Create a vector for turret position
                const turretPos = new THREE.Vector3(
                    turret.mesh.position.x,
                    turret.mesh.position.y + 1.5, // Target center of turret
                    turret.mesh.position.z
                );
                
                // Check for collision
                const hit = weapon.checkCollision(turretPos, 2);
                
                if (hit) {
                    // Apply damage
                    this.damageTurret(turret, hit.damage);
                    
                    // If hit was explosive, create bigger effect
                    if (hit.explosive) {
                        // Apply area damage to nearby turrets
                        this.applyAreaDamage(turretPos, 10, hit.damage / 2);
                    }
                    
                    // Add score based on damage
                    this.score += Math.floor(hit.damage);
                    
                    // Update score display
                    this.updateScoreDisplay();
                }
            });
        });
    }
    
    // Apply area damage to all turrets in radius
    applyAreaDamage(position, radius, damage) {
        if (!this.turrets) return;
        
        this.turrets.forEach(turret => {
            // Skip destroyed turrets
            if (turret.destroyed) return;
            
            // Calculate distance to turret
            const distance = position.distanceTo(turret.mesh.position);
            
            // Apply damage if within radius
            if (distance < radius) {
                // Damage falls off with distance
                const falloff = 1 - (distance / radius);
                const actualDamage = damage * falloff;
                
                // Apply damage
                this.damageTurret(turret, actualDamage);
            }
        });
    }
    
    // Update the score display
    updateScoreDisplay() {
        const scoreDisplay = document.getElementById('score');
        if (scoreDisplay) {
            scoreDisplay.textContent = `SCORE: ${this.score}`;
        }
    }
    
    // Add method to update special effects
    updateSpecialEffects() {
        if (!this.specialEffects) return;
        
        for (let i = this.specialEffects.length - 1; i >= 0; i--) {
            const effect = this.specialEffects[i];
            
            // Check if effect has an update method
            if (effect.update && typeof effect.update === 'function') {
                // Call update method, which returns true if the effect should be removed
                const shouldRemove = effect.update();
                
                if (shouldRemove) {
                    this.specialEffects.splice(i, 1);
                }
            } else if (effect.mesh && !effect.mesh.parent) {
                // If the mesh has been removed from the scene, remove the effect
                this.specialEffects.splice(i, 1);
            }
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
        if (this.keys[' ']) {
            // Use old shooting system as fallback
            if (typeof this.shoot === 'function') {
                console.log("Using original shoot method");
                this.shoot();
            }
            
            // Also try new weapon system if available
            if (this.weapons && this.weapons.length > 0) {
                const currentWeapon = this.getCurrentWeapon();
                
                if (currentWeapon) {
                    try {
                        console.log("Attempting to shoot with weapon:", currentWeapon.type.name);
                        
                        // Calculate shooting position and direction
                        const shootPos = new THREE.Vector3(
                            this.truck.position.x,
                            this.truck.position.y + 0.5,
                            this.truck.position.z
                        );
                        
                        // Calculate forward direction from truck rotation
                        const direction = new THREE.Vector3(
                            Math.sin(this.truck.rotation.y),
                            0,
                            Math.cos(this.truck.rotation.y)
                        );
                        
                        // Handle mines differently - they're dropped behind the truck
                        if (currentWeapon.type.name === "Mines") {
                            // Drop behind the truck
                            const shootPosBehind = new THREE.Vector3(
                                this.truck.position.x - direction.x * 2,
                                this.truck.position.y,
                                this.truck.position.z - direction.z * 2
                            );
                            
                            // Direction is down
                            const downDirection = new THREE.Vector3(0, -1, 0);
                            
                            // Shoot the mine
                            const result = currentWeapon.shoot(shootPosBehind, downDirection);
                            console.log("Mine shot result:", result);
                        } else {
                            // Shoot regular weapon
                            const result = currentWeapon.shoot(shootPos, direction);
                            console.log("Weapon shot result:", result);
                        }
                        
                        // Update weapon display
                        this.updateWeaponDisplay();
                    } catch (error) {
                        console.error("Error while shooting:", error);
                    }
                } else {
                    console.warn("No current weapon available");
                }
            }
        }
        
        // Audio toggle with 'M' key
        if (this.keys['M']) {
            this.keys['M'] = false; // Reset key to prevent multiple toggles
            this.toggleAudio();
        }
        
        // Debug key to spawn powerups with 'P' key
        if (this.keys['p']) {
            this.keys['p'] = false; // Reset key to prevent multiple spawns
            if (this.debugMode) {
                console.log("Debug: Forcing powerup spawn");
                this.createPowerup();
                this.showMessage("Debug: Powerup spawned");
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
        
        try {
            // Zoomed out follow camera for better visibility
            const cameraDistance = 8; // Increased from 5 for wider view
            const cameraHeight = 5;   // Increased from 3 for higher perspective
            
            // Store original position to handle errors
            const originalX = this.camera.position.x;
            const originalZ = this.camera.position.z;
            const originalY = this.camera.position.y;
            
            // Calculate new camera position
            const newX = this.truck.position.x - Math.sin(this.truck.rotation.y) * cameraDistance;
            const newZ = this.truck.position.z - Math.cos(this.truck.rotation.y) * cameraDistance;
            
            // Check if values are valid numbers
            if (isNaN(newX) || isNaN(newZ)) {
                console.error("Invalid camera position calculated. Using previous position.");
                return;
            }
            
            // Apply new position
            this.camera.position.x = newX;
            this.camera.position.z = newZ;
            this.camera.position.y = cameraHeight;
            
            // Calculate look at point
            const lookAtPoint = new THREE.Vector3(
                this.truck.position.x + Math.sin(this.truck.rotation.y) * 2,
                this.truck.position.y,
                this.truck.position.z + Math.cos(this.truck.rotation.y) * 2
            );
            
            // Check if values are valid
            if (lookAtPoint.x === undefined || isNaN(lookAtPoint.x) || 
                lookAtPoint.y === undefined || isNaN(lookAtPoint.y) || 
                lookAtPoint.z === undefined || isNaN(lookAtPoint.z)) {
                console.error("Invalid look at point. Skipping camera update.");
                
                // Restore original position
                this.camera.position.x = originalX;
                this.camera.position.z = originalZ;
                this.camera.position.y = originalY;
                return;
            }
            
            // Apply look at
            this.camera.lookAt(lookAtPoint);
            
        } catch (error) {
            console.error("Error updating camera:", error);
        }
    }
    
    animate() {
        if (!this.isInitialized) return;
        
        requestAnimationFrame(() => this.animate());
        
        try {
            // Increment frame counter
            this.frameCount++;
            
            // Force first powerup spawns when game starts
            if (this.frameCount === 60) { // After 1 second
                // Create initial powerups to ensure they appear
                this.createPowerup();
                this.createPowerup();
                this.createPowerup();
                
                // Create initial weapon pickups
                this.createWeaponPickup();
                
                console.log("Initial powerups and weapon pickups spawned");
            }
            
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
        // Check if invincible
        if (this.truck && this.truck.isInvincible) {
            console.log("Damage blocked by invincibility");
            return 0;
        }
        
        // Check if shield is active
        if (this.hasShield) {
            console.log("Damage blocked by shield");
            this.showShieldHitEffect();
            
            // Remove shield
            this.hasShield = false;
            this.removeShieldEffect();
            
            // Remove from active powerups
            if (this.activePowerups.has('SHIELD')) {
                clearTimeout(this.activePowerups.get('SHIELD').timeoutId);
                this.activePowerups.delete('SHIELD');
                this.updatePowerupIndicators();
            }
            
            return 0;
        }
        
        // Use the provided damage amount directly for better balance
        // Minor minimum to ensure feedback but not too harsh
        const minDamage = 5;
        const appliedAmount = Math.max(amount, minDamage);
        let actualDamage = 0;
        
        // If we have a MonsterTruck instance, use its damage method
        if (this.monsterTruck) {
            // Respect the damage cooldown for more balanced gameplay
            if (this.monsterTruck.damageTimeout <= 0) {
                // Apply damage through MonsterTruck
                actualDamage = this.monsterTruck.takeDamage(appliedAmount);
                
                // Sync health with monster truck
                this.health = this.monsterTruck.health;
                
                // Add screen flash effect for significant damage
                if (actualDamage > 8) {
                    this.addDamageScreenEffect(actualDamage);
                }
                
                console.log(`Damage: ${actualDamage} points. Health: ${this.health}`);
                
                // Add subtle camera shake based on impact
                this.shakeCamera(actualDamage / 6);
            } else {
                // Still showing hit but not applying damage during cooldown
                console.log("Hit during damage cooldown - reduced effect");
            }
        } else {
            // Legacy fallback behavior
            this.health = Math.max(0, this.health - appliedAmount);
            actualDamage = appliedAmount;
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
            healthDisplay.textContent = `HEALTH: ${this.health}`;
        }
        
        // Check for game over
        if (this.health <= 0) {
            console.log("GAME OVER! Health reached zero.");
            this.gameOver();
        }
        
        return actualDamage;
    }
    
    // Show shield hit effect
    showShieldHitEffect() {
        if (!this.shieldMesh) return;
        
        // Flash the shield
        const originalOpacity = this.shieldMesh.material.opacity;
        this.shieldMesh.material.opacity = 0.8;
        
        // Create particles at impact point
        const particleCount = 15;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            // Create particle
            const particleGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const particleMaterial = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position at random point on shield surface
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            const radius = 4;
            
            particle.position.set(
                this.truck.position.x + radius * Math.sin(theta) * Math.cos(phi),
                this.truck.position.y + radius * Math.sin(theta) * Math.sin(phi),
                this.truck.position.z + radius * Math.cos(theta)
            );
            
            // Set velocity - outward from shield
            const direction = new THREE.Vector3()
                .subVectors(particle.position, this.truck.position)
                .normalize();
            
            const speed = Math.random() * 0.3 + 0.2;
            particle.userData = {
                velocity: {
                    x: direction.x * speed,
                    y: direction.y * speed,
                    z: direction.z * speed
                },
                life: 1.0
            };
            
            this.scene.add(particle);
            this.sparks.push(particle);
        }
        
        // Reset opacity after a short delay
        setTimeout(() => {
            if (this.shieldMesh) {
                this.shieldMesh.material.opacity = originalOpacity;
            }
        }, 200);
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
        // Prevent multiple game over screens
        if (this.isGameOver) {
            console.log("Game already over, not showing another game over screen");
            return;
        }
        
        this.isGameOver = true;
        console.log("GAME OVER! Creating game over screen");
        
        try {
            // Make sure we have a score
            if (this.score === undefined) {
                this.score = 0;
            }
            
            // Stop all movement and gameplay
            if (this.truck) {
                this.truck.velocity = 0;
                this.truck.acceleration = 0;
                this.truck.turning = 0;
            }
            
            // Create game over overlay
            const overlay = document.createElement('div');
            overlay.id = "game-over-overlay"; // Add ID for easier targeting
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
                z-index: 9999;
                font-family: 'Orbitron', sans-serif;
                color: #ff00ff;
            `;
    
            overlay.innerHTML = `
                <h1 style="text-shadow: 0 0 10px #ff00ff; font-size: 48px; margin-bottom: 20px;">GAME OVER!</h1>
                <h2 style="text-shadow: 0 0 10px #ff00ff; font-size: 32px; margin-bottom: 30px;">SCORE: ${this.score}</h2>
                <button id="try-again-button" style="
                    background: linear-gradient(45deg, #ff00ff, #aa00ff);
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    margin-top: 20px;
                    font-size: 24px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-family: 'Orbitron', sans-serif;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    box-shadow: 0 0 20px rgba(255, 0, 255, 0.5);
                ">TRY AGAIN</button>
            `;
    
            document.body.appendChild(overlay);
            
            // Add event listener to the try again button
            const tryAgainButton = document.getElementById("try-again-button");
            if (tryAgainButton) {
                tryAgainButton.addEventListener("click", () => {
                    console.log("Reloading game...");
                    window.location.reload();
                });
            }
            
            // Play a game over sound if available
            try {
                const gameOverSound = new Audio();
                gameOverSound.src = 'sounds/gameover.mp3';
                gameOverSound.volume = 0.5;
                gameOverSound.play().catch(e => console.log('Could not play game over sound:', e));
            } catch (error) {
                console.log("Could not play game over sound:", error);
            }
        } catch (error) {
            console.error("Error showing game over screen:", error);
            
            // Fallback game over alert if there's an error
            alert("GAME OVER! Score: " + this.score);
        }
    }

    // Update HUD method
    updateHUD() {
        try {
            // Update health display
            const healthDisplay = document.getElementById('health');
            if (healthDisplay && this.health !== undefined) {
                // Color coding based on health percentage
                const healthPercent = Math.floor((this.health / 100) * 100);
                let healthColor = '#00ff00'; // Green
                
                if (healthPercent < 30) {
                    healthColor = '#ff0000'; // Red
                } else if (healthPercent < 70) {
                    healthColor = '#ffff00'; // Yellow
                }
                
                healthDisplay.innerHTML = `HEALTH: <span style="color:${healthColor}">${healthPercent}%</span>`;
            }
            
            // Update speed display
            if (typeof this.updateSpeedDisplay === 'function') {
                this.updateSpeedDisplay();
            }
            
            // Update weapon and ammo display only if weapons are initialized
            if (this.weapons && Array.isArray(this.weapons) && this.weapons.length > 0 && this.getCurrentWeapon()) {
                if (typeof this.updateWeaponDisplay === 'function') {
                    this.updateWeaponDisplay();
                }
            }
            
            // Update powerup indicators
            if (typeof this.updatePowerupIndicators === 'function') {
                this.updatePowerupIndicators();
            }
            
            // Update score display
            if (typeof this.updateScoreDisplay === 'function') {
                this.updateScoreDisplay();
            }
        } catch (error) {
            console.error("Error in updateHUD:", error);
        }
    }

    // Add shooting mechanics to the Game class

    // Shoot method
    shoot() {
        if (!this.scene || !this.truck) return;
        
        console.log("Shooting original projectile");
        
        try {
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
            
            // Calculate direction based on truck's rotation
            const truckDirection = new THREE.Vector3(
                Math.sin(this.truck.rotation.y), // X component
                0,                               // Y component (level)
                Math.cos(this.truck.rotation.y)  // Z component
            );
            
            // Position at front of truck
            projectile.position.set(
                this.truck.position.x + truckDirection.x * 2,
                this.truck.position.y + 0.5,
                this.truck.position.z + truckDirection.z * 2
            );
            
            // Set rotation to match truck direction
            projectile.rotation.y = this.truck.rotation.y;
            
            // Add to scene
            this.scene.add(projectile);
            
            // Add light to projectile for better visibility
            const projectileLight = new THREE.PointLight(0x00ffff, 0.5, 3);
            projectile.add(projectileLight);
            
            // Apply damage multiplier if active
            const baseDamage = 20;
            const damage = baseDamage * (this.damageMultiplier || 1);
            
            // Store projectile data - make sure this.projectiles exists
            if (!this.projectiles) {
                this.projectiles = [];
            }
            
            this.projectiles.push({
                mesh: projectile,
                direction: truckDirection,
                speed: 2.0, // Fast projectile
                damage: damage,
                lifetime: 100, // Frames before despawning
                source: 'player'
            });
            
            // Notify multiplayer system about the projectile
            if (this.multiplayer && this.multiplayer.isConnected) {
                this.multiplayer.sendProjectileCreated(this.projectiles[this.projectiles.length - 1]);
            }
            
            // Create muzzle flash effect
            this.createMuzzleFlash(projectile.position, truckDirection);
            
            console.log("Projectile created successfully, total projectiles:", this.projectiles.length);
            return true;
        } catch (error) {
            console.error("Error shooting projectile:", error);
            return false;
        }
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
        if (!this.scene) return;
        
        // Initialize projectiles array if needed
        if (!this.projectiles) {
            this.projectiles = [];
        }
        
        // Debug logging
        if (this.frameCount % 60 === 0) { // Log once per second
            console.log(`Updating ${this.projectiles.length} projectiles`);
        }
        
        try {
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const projectile = this.projectiles[i];
                
                // Skip invalid projectiles
                if (!projectile || !projectile.mesh || !projectile.direction) {
                    console.warn("Invalid projectile found, removing:", projectile);
                    if (projectile && projectile.mesh) {
                        this.scene.remove(projectile.mesh);
                    }
                    this.projectiles.splice(i, 1);
                    continue;
                }
                
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
                
                // Check for collisions with walls
                const wallHit = this.checkProjectileWallCollisions(projectile);
                
                // Check for turret collisions
                const hitResult = (typeof this.checkProjectileCollisions === 'function') ? 
                    this.checkProjectileCollisions(projectile) : null;
                
                // Remove if lifetime ended or collision occurred
                if (projectile.lifetime <= 0 || wallHit || hitResult) {
                    this.scene.remove(projectile.mesh);
                    this.projectiles.splice(i, 1);
                    
                    // Create impact effect if collision occurred
                    if (hitResult) {
                        this.createImpactEffect(projectile.mesh.position, hitResult);
                    } else if (wallHit) {
                        // Create simple wall impact effect
                        this.createWallImpactEffect(projectile.mesh.position);
                    }
                }
            }
        } catch (error) {
            console.error("Error updating projectiles:", error);
        }
    }
    
    // Check if projectile hit a wall
    checkProjectileWallCollisions(projectile) {
        if (!projectile || !projectile.mesh) return false;
        
        const arenaSize = 1600;
        const halfSize = arenaSize / 2;
        const wallThickness = 10;
        const pos = projectile.mesh.position;
        
        // Wall collision - check if projectile is near any wall
        if (
            pos.x > halfSize - wallThickness || 
            pos.x < -halfSize + wallThickness ||
            pos.z > halfSize - wallThickness || 
            pos.z < -halfSize + wallThickness
        ) {
            return true;
        }
        
        return false;
    }
    
    // Create a simple wall impact effect
    createWallImpactEffect(position) {
        // Create flash
        const impactLight = new THREE.PointLight(0x00ffff, 1, 5);
        impactLight.position.copy(position);
        this.scene.add(impactLight);
        
        // Create particles
        const particleCount = 10;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 1
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            
            // Random velocity
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.2 + 0.1;
            particle.velocity = {
                x: Math.cos(angle) * speed,
                y: Math.random() * 0.2,
                z: Math.sin(angle) * speed
            };
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // Fade out and remove
        let impactLife = 20;
        const fadeImpact = () => {
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
                
                requestAnimationFrame(fadeImpact);
            } else {
                // Remove light and particles
                this.scene.remove(impactLight);
                for (const particle of particles) {
                    this.scene.remove(particle);
                }
            }
        };
        
        fadeImpact();
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

    // Initialize with weapon and ammo display
    initHUD() {
        const playerName = document.getElementById('playerName');
        const health = document.getElementById('health');
        const score = document.getElementById('score');
        const ammo = document.getElementById('ammo');
        
        // Create weapon display if it doesn't exist
        let weaponDisplay = document.getElementById('weapon');
        if (!weaponDisplay) {
            weaponDisplay = document.createElement('div');
            weaponDisplay.id = 'weapon';
            weaponDisplay.style.position = 'absolute';
            weaponDisplay.style.top = '10px';
            weaponDisplay.style.left = '10px';
            weaponDisplay.style.color = '#ffffff';
            weaponDisplay.style.fontFamily = '"Orbitron", sans-serif';
            weaponDisplay.style.fontSize = '18px';
            weaponDisplay.style.fontWeight = 'bold';
            weaponDisplay.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
            document.body.appendChild(weaponDisplay);
        }
        
        // Set initial values
        if (playerName) playerName.textContent = localStorage.getItem('monsterTruckNickname') || 'PLAYER';
        if (health) health.innerHTML = `HEALTH: <span style="color:#00ff00">${this.health}%</span>`;
        if (score) score.textContent = `SCORE: ${this.score}`;
        
        // Set weapon and ammo display if weapons are initialized
        if (this.weapons && this.weapons.length > 0) {
            const currentWeapon = this.getCurrentWeapon();
            
            if (weaponDisplay) {
                weaponDisplay.textContent = `${currentWeapon.type.icon} ${currentWeapon.type.name}`;
            }
            
            if (ammo) {
                ammo.textContent = `AMMO: ${currentWeapon.ammo}/${currentWeapon.maxAmmo}`;
            }
            
            // Initialize cooldown indicator
            this.updateCooldownIndicator();
        }
        
        // Create weapon key bindings legend
        this.createWeaponLegend();
    }
    
    // Create weapon key bindings legend
    createWeaponLegend() {
        let legend = document.getElementById('weapon-legend');
        if (!legend) {
            legend = document.createElement('div');
            legend.id = 'weapon-legend';
            legend.style.position = 'absolute';
            legend.style.top = '100px';  // Moved down to avoid overlap
            legend.style.left = '10px';
            legend.style.color = '#ffffff';
            legend.style.fontFamily = '"Orbitron", sans-serif';
            legend.style.fontSize = '12px';
            legend.style.fontWeight = 'bold';
            legend.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.5)';
            legend.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            legend.style.padding = '5px';
            legend.style.borderRadius = '5px';
            legend.style.maxWidth = '200px';
            legend.style.zIndex = '100';  // Ensure it's above other elements
            
            legend.innerHTML = `
                <div>1-4: Switch Weapons</div>
                <div>Q/E: Prev/Next Weapon</div>
                <div>R: Reload</div>
                <div>SPACE: Fire</div>
            `;
            
            document.body.appendChild(legend);
        }
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
            
            // Skip if spark is undefined
            if (!spark) {
                this.sparks.splice(i, 1);
                continue;
            }
            
            // Handle different spark object structures
            if (spark.mesh) {
                // Original spark structure with mesh property
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
            } else if (spark.userData) {
                // New spark structure (direct mesh with userData)
                // Update position
                spark.position.x += spark.userData.velocity.x;
                spark.position.y += spark.userData.velocity.y;
                spark.position.z += spark.userData.velocity.z;
                
                // Apply gravity
                spark.userData.velocity.y -= 0.01;
                
                // Reduce life
                spark.userData.life -= 0.02;
                
                // Scale down as life decreases
                const scale = Math.max(0.01, spark.userData.life);
                spark.scale.set(scale, scale, scale);
                
                // Remove if dead
                if (spark.userData.life <= 0) {
                    this.scene.remove(spark);
                    this.sparks.splice(i, 1);
                }
            } else {
                // Unknown spark structure, remove it
                console.warn('Unknown spark structure:', spark);
                if (spark.isObject3D) {
                    this.scene.remove(spark);
                }
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
        if (!this.isMultiplayerEnabled) {
            console.log('Multiplayer disabled - running in single player mode');
            return;
        }

        try {
            // Direct initialization
            this.multiplayer = new Multiplayer(this);
            console.log('Multiplayer initialized');
        } catch (error) {
            console.error('Failed to initialize multiplayer:', error);
            this.showMessage('Multiplayer initialization failed - playing in single player mode');
        }
    }

    createPowerup() {
        if (!this.scene) {
            console.error("Cannot create powerup: Scene is not available");
            return null;
        }
        
        try {
            // Get all powerup types
            const types = Object.keys(this.powerupTypes);
            const randomType = types[Math.floor(Math.random() * types.length)];
            const powerupConfig = this.powerupTypes[randomType];
            
            console.log(`Creating powerup of type: ${randomType}`);
            
            // Create container for the powerup
            const container = new THREE.Object3D();
            
            // Use standard cube geometry for all powerups with different colors
            let material;
            
            // Make powerups larger and more visible
            const sizeMultiplier = 2.0; // Double size for better visibility
            
            // Create a standard cube for all powerup types
            const geometry = new THREE.BoxGeometry(1.5 * sizeMultiplier, 1.5 * sizeMultiplier, 1.5 * sizeMultiplier);
            
            // Add text or icon to each face of the cube to identify the powerup type
            let iconText;
            
            switch(powerupConfig.model) {
                case 'lightning':
                    iconText = "⚡"; // Lightning bolt for speed
                    break;
                case 'star':
                    iconText = "★"; // Star for invincibility
                    break;
                case 'heart':
                    iconText = "❤"; // Heart for health
                    break;
                case 'ammo':
                    iconText = "🔫"; // Gun for ammo
                    break;
                case 'shield':
                    iconText = "🛡️"; // Shield for shield
                    break;
                default:
                    iconText = "?"; // Question mark for unknown
            }
            
            // Create material with stronger glow effect - use PhongMaterial which supports emissive
            material = new THREE.MeshPhongMaterial({
                color: powerupConfig.color,
                emissive: powerupConfig.emissive,
                emissiveIntensity: 1.0, // Stronger glow
                shininess: 100,
                transparent: true,
                opacity: 0.9
            });
            
            const powerupMesh = new THREE.Mesh(geometry, material);
            container.add(powerupMesh);
            
            // Add a stronger point light to make it more visible
            const light = new THREE.PointLight(powerupConfig.color, 2, 20); // Brighter, wider light
            light.position.set(0, 0, 0);
            container.add(light);
            
            // Position the powerup close to the player or truck if available
            let spawnX, spawnZ;
            
            if (this.truck) {
                // Position relative to the truck for better visibility
                const angle = Math.random() * Math.PI * 2;
                const radius = 30 + Math.random() * 20; // Between 30-50 units from truck
                spawnX = this.truck.position.x + Math.cos(angle) * radius;
                spawnZ = this.truck.position.z + Math.sin(angle) * radius;
            } else {
                // Fall back to arena-based positioning if no truck
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 50 + 20; // Between 20 and 70 units from center
                spawnX = Math.cos(angle) * radius;
                spawnZ = Math.sin(angle) * radius;
            }
            
            container.position.x = spawnX;
            container.position.z = spawnZ;
            container.position.y = 3; // Higher above ground for better visibility
            
            // Store powerup type and other data
            container.userData = {
                type: randomType,
                rotationSpeed: 0.05, // Faster rotation to be more noticeable
                floatSpeed: 0.02,
                floatHeight: 1.0, // Larger float height
                floatOffset: Math.random() * Math.PI * 2, // Random starting phase
                creationTime: Date.now()
            };
            
            // Add to powerups array
            if (!this.powerups) {
                this.powerups = [];
            }
            this.powerups.push(container);
            
            // Add to scene
            this.scene.add(container);
            
            console.log(`Created powerup: ${randomType} at position (${container.position.x.toFixed(2)}, ${container.position.y.toFixed(2)}, ${container.position.z.toFixed(2)})`);
            
            // Initialize lastPowerupSpawn if needed
            if (!this.lastPowerupSpawn) {
                this.lastPowerupSpawn = Date.now();
            }
            
            // Show message to indicate a powerup has spawned
            this.showMessage(`${powerupConfig.name} powerup spawned!`);
            
            return container;
        } catch (error) {
            console.error("Error creating powerup:", error);
            return null;
        }
    }

    applyPowerup(type) {
        if (!this.powerupTypes[type]) return;
        
        const powerupConfig = this.powerupTypes[type];
        
        // Determine which sound to play
        let soundType = type.toLowerCase();
        // Map powerup types to sound types
        if (type === 'SPEED_BOOST') soundType = 'speed';
        else if (type === 'INVINCIBILITY' || type === 'SHIELD') soundType = 'shield';
        else if (type === 'DAMAGE_BOOST') soundType = 'damage';
        else if (type === 'REPAIR') soundType = 'health';
        else if (type === 'AMMO_REFILL') soundType = 'ammo';
        
        // Play sound effect
        if (this.powerupSounds[soundType]) {
            // Clone the audio to allow overlapping sounds
            const sound = this.powerupSounds[soundType].cloneNode();
            sound.volume = 0.4;
            sound.play().catch(e => console.log('Error playing powerup sound:', e));
        } else {
            console.log(`No sound found for powerup type: ${soundType}`);
        }
        
        // Create visual effect
        this.createPowerupEffect(type);
        
        // Apply powerup effect based on the powerup's duration
        if (powerupConfig.duration > 0) {
            // Calculate expiration time
            const expirationTime = Date.now() + powerupConfig.duration;
            
            // Set up timeout to remove the powerup effect when it expires
            const timeoutId = setTimeout(() => {
                // Call the remove function to revert the powerup effect
                powerupConfig.remove();
                // Remove from active powerups
                this.activePowerups.delete(type);
                // Update the indicators
                this.updatePowerupIndicators();
                // Create fade-out effect
                this.createPowerupFadeEffect(type);
            }, powerupConfig.duration);
            
            // Add to active powerups (replace existing if any)
            if (this.activePowerups.has(type)) {
                // Clear existing timeout to prevent multiple removals
                clearTimeout(this.activePowerups.get(type).timeoutId);
            }
            
            // Store in map with timeout ID and expiration time
            this.activePowerups.set(type, {
                timeoutId: timeoutId,
                expirationTime: expirationTime
            });
            
            // Apply the effect immediately
            powerupConfig.apply();
        } else {
            // For instant powerups, just apply the effect without adding to active powerups
            powerupConfig.apply();
        }
        
        // Update powerup indicators display
        this.updatePowerupIndicators();
        
        console.log(`Powerup applied: ${powerupConfig.name}`);
    }

    // Update any multiplayer-related methods to check if enabled
    updateMultiplayer() {
        if (!this.isMultiplayerEnabled) return;
        // ... existing multiplayer update code ...
    }

    // Do the same for other multiplayer methods
    handleMultiplayerEvents() {
        if (!this.isMultiplayerEnabled) return;
        // ... existing multiplayer event code ...
    }

    showMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '20px';
        messageDiv.style.left = '50%';
        messageDiv.style.transform = 'translateX(-50%)';
        messageDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        messageDiv.style.color = '#ff00ff';
        messageDiv.style.padding = '10px 20px';
        messageDiv.style.borderRadius = '5px';
        messageDiv.style.fontFamily = "'Orbitron', sans-serif";
        messageDiv.style.zIndex = '1000';
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    // Add this method to toggle audio
    toggleAudio() {
        if (!this.backgroundMusic || !this.audioToggle) return;
        
        const audioIcon = this.audioToggle.querySelector('i');
        
        if (this.backgroundMusic.muted) {
            // Unmute
            this.backgroundMusic.muted = false;
            this.audioToggle.classList.remove('muted');
            if (audioIcon) audioIcon.className = 'fas fa-volume-up';
            localStorage.setItem('monsterTruckAudioMuted', 'false');
            this.isMuted = false;
            this.showMessage('Audio On');
        } else {
            // Mute
            this.backgroundMusic.muted = true;
            this.audioToggle.classList.add('muted');
            if (audioIcon) audioIcon.className = 'fas fa-volume-mute';
            localStorage.setItem('monsterTruckAudioMuted', 'true');
            this.isMuted = true;
            this.showMessage('Audio Off');
        }
    }

    // Update powerups - animations and collision detection
    updatePowerups() {
        if (!this.scene || !this.truck) {
            return;
        }
        
        // Make sure powerups array exists
        if (!this.powerups) {
            this.powerups = [];
        }
        
        const now = Date.now();
        
        // Log powerup count for debugging
        if (this.frameCount % 60 === 0) { // Once per second (assuming 60fps)
            console.log(`Current powerups in game: ${this.powerups.length}`);
        }
        
        // Initialize lastPowerupSpawn if needed
        if (!this.lastPowerupSpawn) {
            this.lastPowerupSpawn = now - this.powerupSpawnInterval; // Force immediate spawn
            console.log("Initializing powerup spawn timer");
        }
        
        // Check if we should spawn a new powerup - ensure we always have at least one
        if (now - this.lastPowerupSpawn > this.powerupSpawnInterval || this.powerups.length === 0) {
            console.log("Spawning new powerup - time elapsed:", (now - this.lastPowerupSpawn));
            this.createPowerup();
            this.lastPowerupSpawn = now;
        }
        
        // Update existing powerups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const powerup = this.powerups[i];
            
            // Skip invalid powerups
            if (!powerup || !powerup.userData) {
                console.warn("Invalid powerup found, removing:", powerup);
                if (powerup && this.scene) {
                    this.scene.remove(powerup);
                }
                this.powerups.splice(i, 1);
                continue;
            }
            
            try {
                // Rotate powerup
                powerup.rotation.y += powerup.userData.rotationSpeed;
                
                // Make powerup float up and down
                const floatOffset = Math.sin(now * 0.001 + powerup.userData.floatOffset) * powerup.userData.floatHeight;
                powerup.position.y = 2 + floatOffset;
                
                // Make powerups stand out more - pulse the light
                if (powerup.children && powerup.children.length > 1) {
                    const light = powerup.children[1];
                    if (light && light.isLight) {
                        light.intensity = 1 + Math.sin(now * 0.003) * 0.5;
                    }
                }
                
                // Check for collision with truck - use a larger collision radius for better gameplay
                const distance = powerup.position.distanceTo(this.truck.position);
                const collisionRadius = 8; // Larger collision radius for easier pickup
                
                if (distance < collisionRadius) {
                    console.log(`Powerup collected! Type: ${powerup.userData.type}, distance: ${distance.toFixed(2)}`);
                    
                    // Apply powerup effect
                    this.applyPowerup(powerup.userData.type);
                    
                    // Create visual effect
                    this.createPowerupEffect(powerup.userData.type);
                    
                    // Remove powerup from scene and array
                    this.scene.remove(powerup);
                    this.powerups.splice(i, 1);
                    
                    // Show message
                    this.showMessage(`Collected ${this.powerupTypes[powerup.userData.type].name}`);
                    continue;
                }
                
                // Make powerups disappear after 30 seconds
                if (now - powerup.userData.creationTime > 30000) {
                    // Create fade-out effect
                    this.createPowerupFadeEffect(powerup);
                    
                    // Remove powerup from scene and array
                    this.scene.remove(powerup);
                    this.powerups.splice(i, 1);
                }
            } catch (error) {
                console.error("Error updating powerup:", error);
                // Remove problematic powerup
                if (powerup && this.scene) {
                    this.scene.remove(powerup);
                }
                this.powerups.splice(i, 1);
            }
        }
        
        // Update shield effect if active
        if (this.hasShield && this.truck) {
            this.updateShieldEffect();
        }
    }
    
    // Add this method for updating the shield effect
    updateShieldEffect() {
        if (!this.truck) return;
        
        // Create shield mesh if it doesn't exist
        if (!this.shieldMesh) {
            const shieldGeometry = new THREE.SphereGeometry(4, 16, 12);
            const shieldMaterial = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            });
            
            this.shieldMesh = new THREE.Mesh(shieldGeometry, shieldMaterial);
            this.scene.add(this.shieldMesh);
            
            // Add subtle pulsing animation
            this.shieldPulseTime = 0;
        }
        
        // Update shield position to match truck
        this.shieldMesh.position.copy(this.truck.position);
        this.shieldMesh.position.y += 1.5; // Adjust height to center on truck
        
        // Animate shield with subtle pulse effect
        this.shieldPulseTime += 0.05;
        const pulseScale = 1 + Math.sin(this.shieldPulseTime) * 0.05;
        this.shieldMesh.scale.set(pulseScale, pulseScale, pulseScale);
    }
    
    // Add this method for removing the shield effect
    removeShieldEffect() {
        if (this.shieldMesh && this.scene) {
            this.scene.remove(this.shieldMesh);
            this.shieldMesh = null;
        }
    }
    
    // Create fade-out effect when powerup disappears
    createPowerupFadeEffect(powerup) {
        // Create particles at powerup position
        const particleCount = 10;
        
        for (let i = 0; i < particleCount; i++) {
            // Create particle
            const particleGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const particleMaterial = new THREE.MeshPhongMaterial({
                color: powerup.children[0].material.color,
                emissive: powerup.children[0].material.emissive,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position at powerup position
            particle.position.copy(powerup.position);
            
            // Set velocity - outward in all directions
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.2 + 0.1;
            particle.userData = {
                velocity: {
                    x: Math.cos(angle) * speed,
                    y: Math.random() * 0.2 + 0.1,
                    z: Math.sin(angle) * speed
                },
                life: 1.0
            };
            
            this.scene.add(particle);
            this.sparks.push(particle);
        }
    }

    // Helper function to convert hex color to rgba
    hexToRgba(hex, alpha) {
        const r = (hex >> 16) & 255;
        const g = (hex >> 8) & 255;
        const b = hex & 255;
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Create visual effect for powerup collection
    createPowerupEffect(type) {
        if (!this.truck || !this.scene) return;
        
        const powerupConfig = this.powerupTypes[type];
        if (!powerupConfig) {
            console.log(`No config found for powerup type: ${type}`);
            return;
        }
        
        // Create particles around the truck
        const particleCount = 20;
        
        for (let i = 0; i < particleCount; i++) {
            // Create particle
            const particleGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const particleMaterial = new THREE.MeshPhongMaterial({
                color: powerupConfig.color,
                emissive: powerupConfig.emissive,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position around truck
            const angle = Math.random() * Math.PI * 2;
            const radius = 3;
            particle.position.set(
                this.truck.position.x + Math.cos(angle) * radius,
                this.truck.position.y + Math.random() * 3,
                this.truck.position.z + Math.sin(angle) * radius
            );
            
            // Set velocity - outward from truck
            const speed = Math.random() * 0.2 + 0.1;
            const velocity = {
                x: Math.cos(angle) * speed,
                y: Math.random() * 0.2 + 0.1,
                z: Math.sin(angle) * speed
            };
            
            // Create spark with the expected structure
            const spark = {
                mesh: particle,
                velocity: velocity,
                life: 1.0
            };
            
            this.scene.add(particle);
            this.sparks.push(spark);
        }
        
        // Add a flash of light
        const light = new THREE.PointLight(powerupConfig.color, 2, 10);
        light.position.copy(this.truck.position);
        light.position.y += 2;
        this.scene.add(light);
        
        // Fade out and remove light
        let lightLife = 10;
        const fadeLight = () => {
            lightLife--;
            if (lightLife > 0) {
                light.intensity = lightLife / 10 * 2;
                requestAnimationFrame(fadeLight);
            } else {
                this.scene.remove(light);
            }
        };
        
        fadeLight();
        
        // Create custom effect based on powerup type
        switch(type) {
            case 'SHIELD':
                // Shield effect is handled in updateShieldEffect method
                this.hasShield = true;
                break;
            case 'SPEED_BOOST':
                // Add speed trail effect
                this.createSpeedBoostEffect();
                break;
            case 'DAMAGE_BOOST':
                // Add damage boost effect
                this.createDamageBoostEffect();
                break;
        }
    }
    
    // Add speed boost visual effect
    createSpeedBoostEffect() {
        if (!this.truck) return;
        
        // Create speed lines behind truck
        const count = 10;
        
        for (let i = 0; i < count; i++) {
            const lineGeometry = new THREE.BoxGeometry(0.1, 0.1, 1 + Math.random() * 2);
            const lineMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.7
            });
            
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            
            // Position behind truck
            const angle = Math.random() * Math.PI;
            const radius = 1.5 + Math.random() * 1.5;
            const truckDirection = new THREE.Vector3(
                -Math.sin(this.truck.rotation.y), 
                0, 
                -Math.cos(this.truck.rotation.y)
            );
            
            line.position.set(
                this.truck.position.x + truckDirection.x * (3 + Math.random() * 2) + Math.cos(angle) * radius,
                this.truck.position.y + Math.random() * 2,
                this.truck.position.z + truckDirection.z * (3 + Math.random() * 2) + Math.sin(angle) * radius
            );
            
            line.lookAt(this.truck.position);
            
            // Set velocity - away from truck
            const velocity = {
                x: truckDirection.x * (0.2 + Math.random() * 0.1),
                y: 0,
                z: truckDirection.z * (0.2 + Math.random() * 0.1)
            };
            
            // Add to scene
            this.scene.add(line);
            
            // Add to sparks for animation
            this.sparks.push({
                mesh: line,
                velocity: velocity,
                life: 1.0
            });
        }
    }
    
    // Add damage boost visual effect
    createDamageBoostEffect() {
        if (!this.truck) return;
        
        // Create energy particles around the truck
        const count = 15;
        
        for (let i = 0; i < count; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.15, 6, 6);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: 0xff00ff,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position around truck
            const angle = Math.random() * Math.PI * 2;
            const height = Math.random() * 2;
            const radius = 2;
            
            particle.position.set(
                this.truck.position.x + Math.cos(angle) * radius,
                this.truck.position.y + height,
                this.truck.position.z + Math.sin(angle) * radius
            );
            
            // Set orbital motion
            particle.userData = {
                centerX: this.truck.position.x,
                centerZ: this.truck.position.z,
                radius: radius,
                speed: 0.05 + Math.random() * 0.05,
                angle: angle,
                verticalSpeed: 0.02 * (Math.random() > 0.5 ? 1 : -1),
                life: 1.0
            };
            
            // Add to scene and array with special handling for orbital particles
            this.scene.add(particle);
            
            // Add a special effect with custom update logic
            const specialEffect = {
                mesh: particle,
                update: () => {
                    // Update angle
                    particle.userData.angle += particle.userData.speed;
                    
                    // Update position based on truck position
                    particle.position.x = this.truck.position.x + Math.cos(particle.userData.angle) * particle.userData.radius;
                    particle.position.z = this.truck.position.z + Math.sin(particle.userData.angle) * particle.userData.radius;
                    
                    // Update height with vertical oscillation
                    particle.position.y += particle.userData.verticalSpeed;
                    if (particle.position.y > this.truck.position.y + 3 || particle.position.y < this.truck.position.y) {
                        particle.userData.verticalSpeed *= -1;
                    }
                    
                    // Decrease life gradually
                    particle.userData.life -= 0.005;
                    particle.material.opacity = particle.userData.life;
                    
                    // Remove if life is depleted
                    if (particle.userData.life <= 0) {
                        this.scene.remove(particle);
                        return true; // Signal removal
                    }
                    return false; // Keep updating
                }
            };
            
            // Create array for special effects if it doesn't exist
            if (!this.specialEffects) {
                this.specialEffects = [];
            }
            
            this.specialEffects.push(specialEffect);
        }
    }

    // Create fade effect for expiring powerups
    createPowerupFadeEffect(type) {
        if (!this.truck || !this.scene) return;
        
        // Handle either powerup object or type string
        let powerupConfig;
        
        if (typeof type === 'string') {
            // Type is a string - get config from powerupTypes
            powerupConfig = this.powerupTypes[type];
            if (!powerupConfig) {
                console.log(`No config found for powerup type: ${type}`);
                return;
            }
        } else if (type && type.userData && type.userData.type) {
            // Type is a powerup object - get config from its userData
            powerupConfig = this.powerupTypes[type.userData.type];
            if (!powerupConfig) {
                console.log(`No config found for powerup object type: ${type.userData.type}`);
                return;
            }
        } else {
            console.log('Invalid argument passed to createPowerupFadeEffect');
            return;
        }
        
        // Determine position based on parameter type
        let position;
        if (typeof type === 'string') {
            // If type is a string, use truck position
            position = this.truck.position.clone();
        } else {
            // If type is a powerup object, use its position
            position = type.position.clone();
        }
        
        // Create particles
        const particleCount = 10;
        
        for (let i = 0; i < particleCount; i++) {
            // Create particle
            const particleGeometry = new THREE.SphereGeometry(0.15, 6, 6);
            const particleMaterial = new THREE.MeshPhongMaterial({
                color: powerupConfig.color,
                emissive: powerupConfig.emissive,
                emissiveIntensity: 0.3,
                transparent: true,
                opacity: 0.5
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position at the appropriate location
            const angle = Math.random() * Math.PI * 2;
            const radius = 2;
            particle.position.set(
                position.x + Math.cos(angle) * radius,
                position.y + Math.random() * 2,
                position.z + Math.sin(angle) * radius
            );
            
            // Set velocity - downward and outward
            const speed = Math.random() * 0.1 + 0.05;
            const velocity = {
                x: Math.cos(angle) * speed,
                y: -Math.random() * 0.1,
                z: Math.sin(angle) * speed
            };
            
            // Create spark with the expected structure
            const spark = {
                mesh: particle,
                velocity: velocity,
                life: 0.7
            };
            
            this.scene.add(particle);
            this.sparks.push(spark);
        }
    }
    
    // Update HUD to show active powerups
    updatePowerupIndicators() {
        const container = document.getElementById('powerup-indicators');
        if (!container) {
            // Create container if it doesn't exist
            const newContainer = document.createElement('div');
            newContainer.id = 'powerup-indicators';
            newContainer.style.position = 'absolute';
            newContainer.style.bottom = '10px';
            newContainer.style.right = '10px';
            newContainer.style.display = 'flex';
            newContainer.style.flexDirection = 'column';
            newContainer.style.alignItems = 'flex-end';
            document.body.appendChild(newContainer);
        }
        
        const powerupContainer = document.getElementById('powerup-indicators');
        powerupContainer.innerHTML = ''; // Clear existing indicators
        
        // Add indicators for active powerups
        for (const [type, data] of this.activePowerups.entries()) {
            const powerupConfig = this.powerupTypes[type];
            if (!powerupConfig) continue; // Skip if config not found
            
            const indicator = document.createElement('div');
            indicator.style.backgroundColor = this.hexToRgba(powerupConfig.color, 0.7);
            indicator.style.color = '#fff';
            indicator.style.padding = '5px 10px';
            indicator.style.margin = '5px';
            indicator.style.borderRadius = '5px';
            indicator.style.fontWeight = 'bold';
            indicator.style.textShadow = '1px 1px 2px rgba(0,0,0,0.7)';
            indicator.style.display = 'flex';
            indicator.style.alignItems = 'center';
            indicator.style.justifyContent = 'space-between';
            indicator.style.width = '150px';
            
            // Create label
            const label = document.createElement('span');
            label.textContent = powerupConfig.name;
            
            // Create timer
            const timer = document.createElement('span');
            const timeRemaining = Math.ceil((data.expirationTime - Date.now()) / 1000); // Convert ms to seconds
            timer.textContent = timeRemaining + 's';
            timer.style.marginLeft = '10px';
            
            indicator.appendChild(label);
            indicator.appendChild(timer);
            
            powerupContainer.appendChild(indicator);
            
            // Pulse effect for indicators about to expire
            if (timeRemaining < 3) { // Less than 3 seconds
                indicator.style.animation = 'pulse 0.5s infinite alternate';
                if (!document.getElementById('powerup-pulse-style')) {
                    const style = document.createElement('style');
                    style.id = 'powerup-pulse-style';
                    style.textContent = `
                        @keyframes pulse {
                            from { opacity: 1; }
                            to { opacity: 0.6; }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }
        }
    }
    
    // Initialize weapons for the player
    initializeWeapons() {
        if (!this.scene) {
            console.error("Cannot initialize weapons: Scene is not available");
            return;
        }
        
        console.log("Initializing weapons system...");
        
        try {
            // Create all weapon types
            this.weapons = [
                new Weapon(this.scene, WeaponTypes.MACHINE_GUN),
                new Weapon(this.scene, WeaponTypes.ROCKETS),
                new Weapon(this.scene, WeaponTypes.SHOTGUN),
                new Weapon(this.scene, WeaponTypes.MINES)
            ];
            
            // Start with machine gun
            this.currentWeaponIndex = 0;
            this.weaponPickups = []; // Ensure array exists
            this.lastWeaponPickupSpawn = Date.now(); // Initialize spawn timer
            
            console.log("Weapons initialized successfully");
            
            // Set keyboard bindings for weapon switching
            window.addEventListener('keydown', (e) => {
                if (!this.weapons || !Array.isArray(this.weapons) || this.weapons.length === 0) {
                    return; // Skip if weapons not initialized
                }
                
                // Number keys 1-4 for weapon selection
                if (e.key >= '1' && e.key <= '4') {
                    const index = parseInt(e.key) - 1;
                    if (index >= 0 && index < this.weapons.length) {
                        this.switchWeapon(index);
                    }
                }
                
                // Q key for previous weapon
                if (e.key === 'q' || e.key === 'Q') {
                    this.prevWeapon();
                }
                
                // E key for next weapon
                if (e.key === 'e' || e.key === 'E') {
                    this.nextWeapon();
                }
                
                // R key for manual reload
                if (e.key === 'r' || e.key === 'R') {
                    const weapon = this.getCurrentWeapon();
                    if (weapon && typeof weapon.startReload === 'function') {
                        weapon.startReload();
                    }
                }
            });
        } catch (error) {
            console.error("Error initializing weapons:", error);
        }
    }
    
    // Get current weapon
    getCurrentWeapon() {
        if (!this.weapons || this.weapons.length === 0) {
            return null;
        }
        return this.weapons[this.currentWeaponIndex];
    }
    
    // Switch to a specific weapon
    switchWeapon(index) {
        if (index >= 0 && index < this.weapons.length) {
            this.currentWeaponIndex = index;
            
            // Update weapon display
            this.updateWeaponDisplay();
            
            console.log(`Switched to ${this.getCurrentWeapon().type.name}`);
        }
    }
    
    // Switch to next weapon
    nextWeapon() {
        this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
        this.updateWeaponDisplay();
    }
    
    // Switch to previous weapon
    prevWeapon() {
        this.currentWeaponIndex = (this.currentWeaponIndex - 1 + this.weapons.length) % this.weapons.length;
        this.updateWeaponDisplay();
    }
    
    // Update weapon HUD display
    updateWeaponDisplay() {
        if (!this.weapons || this.weapons.length === 0) return;
        
        const weaponDisplay = document.getElementById('weapon');
        const ammoDisplay = document.getElementById('ammo');
        
        // Get current weapon safely
        const currentWeapon = this.getCurrentWeapon();
        if (!currentWeapon) return;
        
        if (weaponDisplay) {
            weaponDisplay.textContent = `${currentWeapon.type.icon || '🔫'} ${currentWeapon.type.name || 'Weapon'}`;
            
            // Reposition to avoid overlap
            weaponDisplay.style.top = '70px';  // Move down below score/callsign
        }
        
        if (ammoDisplay) {
            ammoDisplay.textContent = `AMMO: ${currentWeapon.ammo}/${currentWeapon.maxAmmo}`;
            
            // Add reload indicator if reloading
            if (currentWeapon.isReloading) {
                ammoDisplay.innerHTML = `<span style="color: #ff0000;">RELOADING...</span>`;
            }
        }
        
        // Update cooldown indicator
        this.updateCooldownIndicator();
    }
    
    // Update weapon cooldown indicator
    updateCooldownIndicator() {
        // Safety check for weapons
        if (!this.weapons || this.weapons.length === 0) return;
        
        const currentWeapon = this.getCurrentWeapon();
        if (!currentWeapon) return;
        
        // Get or create cooldown bar
        let cooldownBar = document.getElementById('cooldown-bar');
        if (!cooldownBar) {
            // Create cooldown indicator container
            const container = document.createElement('div');
            container.id = 'cooldown-container';
            container.style.position = 'absolute';
            container.style.bottom = '70px';
            container.style.left = '10px';
            container.style.width = '200px';
            container.style.height = '10px';
            container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            container.style.borderRadius = '5px';
            container.style.overflow = 'hidden';
            
            // Create cooldown bar
            cooldownBar = document.createElement('div');
            cooldownBar.id = 'cooldown-bar';
            cooldownBar.style.height = '100%';
            cooldownBar.style.width = '100%';
            cooldownBar.style.backgroundColor = '#00ffff';
            cooldownBar.style.transition = 'width 0.1s linear';
            
            container.appendChild(cooldownBar);
            document.body.appendChild(container);
        }
        
        try {
            // Update cooldown progress
            const weaponStatus = currentWeapon.update();
            const progress = weaponStatus ? weaponStatus.cooldownProgress : 1;
            cooldownBar.style.width = `${progress * 100}%`;
            
            // Update cooldown bar color based on weapon type
            if (currentWeapon.type && currentWeapon.type.color) {
                const colorHex = currentWeapon.type.color.toString(16).padStart(6, '0');
                cooldownBar.style.backgroundColor = '#' + colorHex;
            } else {
                cooldownBar.style.backgroundColor = '#00ffff';
            }
        } catch (error) {
            console.log("Error updating cooldown indicator:", error);
            cooldownBar.style.width = '100%';
            cooldownBar.style.backgroundColor = '#00ffff';
        }
    }
    
    // Create weapon pickup
    createWeaponPickup() {
        if (!this.scene) return;
        
        // Choose a random weapon type (excluding the machine gun which is the default)
        const availableTypes = [
            WeaponTypes.ROCKETS,
            WeaponTypes.SHOTGUN,
            WeaponTypes.MINES
        ];
        
        const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        // Choose a random position in the arena
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 100 + 50; // Between 50 and 150 units from center
        const position = new THREE.Vector3(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
        );
        
        // Create pickup
        const pickup = new WeaponPickup(this.scene, position, randomType);
        this.weaponPickups.push(pickup);
        
        console.log(`Created weapon pickup: ${randomType.name} at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
    }
    
    // Update weapon pickups
    updateWeaponPickups() {
        if (!this.weaponPickups || !this.truck) return;
        
        const now = Date.now();
        
        // Check if we should spawn a new weapon pickup
        if (now - this.lastWeaponPickupSpawn > this.weaponPickupSpawnInterval) {
            this.createWeaponPickup();
            this.lastWeaponPickupSpawn = now;
        }
        
        // Update existing pickups
        for (let i = this.weaponPickups.length - 1; i >= 0; i--) {
            const pickup = this.weaponPickups[i];
            
            // Update pickup animation
            const shouldRemove = pickup.update();
            
            // Remove if lifetime ended
            if (shouldRemove) {
                pickup.remove();
                this.weaponPickups.splice(i, 1);
                continue;
            }
            
            // Check for collision with truck
            if (pickup.mesh) {
                const distance = pickup.mesh.position.distanceTo(this.truck.position);
                if (distance < 4) { // Collision radius
                    // Find the weapon of this type
                    const weaponIndex = this.weapons.findIndex(
                        weapon => weapon.type === pickup.weaponType
                    );
                    
                    if (weaponIndex !== -1) {
                        // Switch to this weapon
                        this.switchWeapon(weaponIndex);
                        
                        // Refill ammo
                        this.weapons[weaponIndex].ammo = this.weapons[weaponIndex].maxAmmo;
                        
                        // Create pickup effect
                        pickup.createPickupEffect();
                        
                        // Update HUD
                        this.updateWeaponDisplay();
                        
                        // Show message
                        this.showMessage(`Picked up ${pickup.weaponType.name}`);
                    }
                    
                    // Remove pickup
                    pickup.remove();
                    this.weaponPickups.splice(i, 1);
                }
            }
        }
    }
}

// Initialize game when window is fully loaded
window.addEventListener('load', () => {
    console.log("Window loaded, creating game");
    new Game();
});

export default Game;
