// Print diagnostic info to help debug module loading
console.log("Main.js loading...");
console.log("Module meta information:", import.meta);

// Import THREE.js using ES modules (from importmap)
import * as THREE from 'three';
console.log("THREE.js imported:", THREE);

// Check if THREE was loaded properly
if (!THREE || !THREE.Scene) {
    console.error("THREE.js did not load properly! Scene class is missing.");
} else {
    console.log("THREE.js Scene class found:", THREE.Scene);
}

import { MonsterTruck } from './MonsterTruck.js'
import { World } from './World.js'
import Multiplayer from './Multiplayer.js'
import { Weapon, WeaponTypes, WeaponPickup } from './Weapons.js'
import { SoundManager } from './SoundManager.js'

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
}

class Projectile {
    constructor(position, direction, speed, damage, source) {
        const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8)
        geometry.rotateX(Math.PI / 2);
        
        const projectileColor = source === 'player' ? 0xff00ff : 0xff0000
        const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(projectileColor),
            emissive: new THREE.Color(projectileColor),
            emissiveIntensity: 1,
            transparent: true,
            opacity: 0.8,
            shininess: 30
        })
        
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
        })
        const trail = new THREE.Mesh(trailGeometry, trailMaterial)
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
        })
        this.base = new THREE.Mesh(baseGeometry, baseMaterial);
        this.base.position.copy(position);

        // Create turret gun
        const gunGeometry = new THREE.BoxGeometry(0.3, 0.3, 2);
        const gunMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(0x666666),
            shininess: 30
        })
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
        
        // Core initialization only
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = null;
        this.truck = null;
        this.isInitialized = false;
        
        // Essential controls only
        this.keys = {
            'ArrowUp': false,
            'ArrowDown': false,
            'ArrowLeft': false,
            'ArrowRight': false,
            ' ': false,
            'M': false
        }
        
        // Core game state
        this.score = 0;
        this.health = 100;
        this.maxHealth = 100;
        
        // Initialize the game
        this.init();
    }

    init() {
        try {
            console.log("Starting game initialization...");
            
            // Initialize renderer
            console.log("Creating WebGL renderer...");
            try {
                // Get the canvas element
                const canvas = document.getElementById('game');
                console.log("Canvas element found:", canvas);
                
                // If canvas not found, create one
                if (!canvas) {
                    console.warn("Canvas element not found! Creating a new one.");
                    const newCanvas = document.createElement('canvas');
                    newCanvas.id = 'game';
                    newCanvas.style.width = '100%';
                    newCanvas.style.height = '100%';
                    newCanvas.style.display = 'block';
                    document.body.appendChild(newCanvas);
                    
                    this.renderer = new THREE.WebGLRenderer({ 
                        antialias: true,
                        canvas: newCanvas
                    });
                } else {
                    this.renderer = new THREE.WebGLRenderer({ 
                        antialias: true,
                        canvas: canvas
                    });
                }
                
                console.log("Renderer created successfully:", this.renderer);
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            } catch (rendererError) {
                console.error("Failed to create renderer:", rendererError);
                throw rendererError;
            }
            
            // Set up camera
            console.log("Setting up camera...");
            try {
                this.camera.position.set(0, 10, 20);
                this.camera.lookAt(0, 0, 0);
                console.log("Camera configured successfully:", this.camera);
            } catch (cameraError) {
                console.error("Failed to configure camera:", cameraError);
                throw cameraError;
            }
            
            // Add basic lighting
            console.log("Adding lighting...");
            try {
                const ambientLight = new THREE.AmbientLight(0x404040);
                const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
                directionalLight.position.set(1, 1, 1);
                this.scene.add(ambientLight, directionalLight);
                console.log("Lighting added successfully");
            } catch (lightingError) {
                console.error("Failed to add lighting:", lightingError);
                throw lightingError;
            }
            
            // Create arena and truck
            console.log("Creating arena...");
            try {
                this.createArena();
                console.log("Arena created successfully");
            } catch (arenaError) {
                console.error("Failed to create arena:", arenaError);
                throw arenaError;
            }
            
            console.log("Creating truck...");
            try {
                this.createSimpleTruck();
                console.log("Truck created successfully");
            } catch (truckError) {
                console.error("Failed to create truck:", truckError);
                throw truckError;
            }
            
            // Set up controls
            console.log("Setting up controls...");
            try {
                this.setupControls();
                console.log("Controls set up successfully");
            } catch (controlsError) {
                console.error("Failed to set up controls:", controlsError);
                throw controlsError;
            }
            
            // Initialize HUD
            console.log("Initializing HUD...");
            try {
                this.initHUD();
                console.log("HUD initialized successfully");
            } catch (hudError) {
                console.error("Failed to initialize HUD:", hudError);
                throw hudError;
            }
            
            // Remove loading screen
            console.log("Removing loading screen...");
            try {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                    console.log("Loading screen removed");
                } else {
                    console.warn("Loading screen element not found");
                }
            } catch (loadingError) {
                console.error("Failed to remove loading screen:", loadingError);
                // Don't throw, this is not critical
            }
            
            // Start animation loop
            console.log("Starting animation loop...");
            this.isInitialized = true;
            console.log("Game initialized successfully");
            this.animate();
            
        } catch (error) {
            console.error("Critical error in game initialization:", error);
            // Show error message on screen
            try {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    const loadingText = loadingScreen.querySelector('.loading-text');
                    if (loadingText) {
                        loadingText.innerHTML = `ERROR: ${error.message}<br>Check console for details`;
                        loadingText.style.color = 'red';
                    }
                }
            } catch (e) {
                console.error("Couldn't display error message:", e);
            }
        }
    }

    createArena() {
        console.log("Creating simplified arena");
        
        // Create a simple grid floor
        const gridHelper = new THREE.GridHelper(100, 20, 0xff00ff, 0x00ffff);
        this.scene.add(gridHelper);
        
        // Create a ground plane
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x220033,
            wireframe: true,
            transparent: true,
            opacity: 0.7
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0.1;
        this.scene.add(ground);
    }

    createSimpleTruck() {
        console.log("Creating simplified truck");
        
        // Create a basic box for the truck
        const truckGeometry = new THREE.BoxGeometry(2, 1, 3);
        const truckMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff00ff,
            wireframe: true
        });
        this.truck = new THREE.Mesh(truckGeometry, truckMaterial);
        this.truck.position.set(0, 1, 0);
        this.scene.add(this.truck);
        
        // Add basic properties
        this.truck.velocity = 0;
        this.truck.acceleration = 0;
    }

    setupControls() {
        console.log("Setting up controls");
        
        // Set up keyboard controls
        window.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = true;
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
    }

    initHUD() {
        console.log("Initializing simplified HUD");
        
        // Create a simple HUD container
        const hudContainer = document.createElement('div');
        hudContainer.style.position = 'absolute';
        hudContainer.style.top = '10px';
        hudContainer.style.left = '10px';
        hudContainer.style.color = '#fff';
        hudContainer.style.fontFamily = 'Arial, sans-serif';
        hudContainer.style.fontSize = '16px';
        hudContainer.style.textShadow = '1px 1px 2px black';
        
        // Add health display
        const healthDiv = document.createElement('div');
        healthDiv.id = 'health';
        healthDiv.textContent = `Health: ${this.health}`;
        hudContainer.appendChild(healthDiv);
        
        document.body.appendChild(hudContainer);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (!this.isInitialized) return;
        
        // Update game state
        this.update();
        
        // Render the scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    update() {
        // Basic update for truck movement
        if (!this.truck) return;
        
        // Process keyboard input
        const moveSpeed = 0.1;
        const rotateSpeed = 0.05;
        
        if (this.keys['ArrowUp']) {
            this.truck.position.z -= moveSpeed;
        }
        if (this.keys['ArrowDown']) {
            this.truck.position.z += moveSpeed;
        }
        if (this.keys['ArrowLeft']) {
            this.truck.rotation.y += rotateSpeed;
        }
        if (this.keys['ArrowRight']) {
            this.truck.rotation.y -= rotateSpeed;
        }
        
        // Update camera to follow truck
        if (this.camera) {
            this.camera.position.x = this.truck.position.x;
            this.camera.position.z = this.truck.position.z + 10;
            this.camera.lookAt(this.truck.position);
        }
    }
}

// Initialize game when window is fully loaded
window.addEventListener('load', () => {
    console.log("Window loaded, creating game");
    try {
        // Create simple sound system
        window.SoundFX = {
            play: function() {} // Empty function - no sound handling
        };
        
        // Create game
        window.game = new Game();
        
        console.log("Game instance created and initialized");
    } catch (error) {
        console.error("Error creating game instance:", error);
    }
});

export { Game }
