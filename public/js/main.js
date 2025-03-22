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
    constructor(position, scene, type = {
        name: "Standard",
        color: 0x666666,
        activeColor: 0xff0000,
        warningColor: 0xffff00,
        health: 5,
        damage: 10,
        fireRate: 60,
        projectileSpeed: 0.3
    }) {
        // Save type
        this.type = type;
        
        // Create turret base - adjust size based on type
        const baseScale = type.name === "Heavy" ? 1.3 : (type.name === "Rapid" ? 0.8 : 1);
        const baseGeometry = new THREE.CylinderGeometry(1 * baseScale, 1 * baseScale, 1, 8);
        const baseMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(type.color),
            shininess: 30
        })
        this.base = new THREE.Mesh(baseGeometry, baseMaterial);
        this.base.position.copy(position);
        
        // Set the height correctly
        this.base.position.y = 0.5;

        // Create turret gun - adjust shape based on type
        let gunGeometry;
        
        if (type.name === "Heavy") {
            // Larger, shorter gun for heavy turret
            gunGeometry = new THREE.BoxGeometry(0.4, 0.4, 1.5);
        } else if (type.name === "Rapid") {
            // Thinner, longer gun for rapid turret
            gunGeometry = new THREE.BoxGeometry(0.2, 0.2, 2.2);
        } else {
            // Standard gun
            gunGeometry = new THREE.BoxGeometry(0.3, 0.3, 2);
        }
        
        const gunMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(type.color),
            shininess: 30
        })
        this.gun = new THREE.Mesh(gunGeometry, gunMaterial);
        this.gun.position.y = 0.5;
        this.gun.position.z = 0.5;
        this.base.add(this.gun);

        this.health = type.health;
        this.shootCooldown = 0;
        this.maxShootCooldown = type.fireRate; // Cooldown between shots (60 frames = ~1 second)
        this.alive = true;
        this.scene = scene;
        this.activated = false;
        this.activationDelay = 180; // Default delay (3 seconds)
        
        // Add turret to scene
        scene.add(this.base);
        
        // Keep track of fired projectiles
        this.projectiles = [];
    }

    update(playerPosition) {
        if (!this.alive) return;
        
        // Handle activation delay
        if (!this.activated) {
            if (this.activationDelay > 0) {
                this.activationDelay--;
                
                // Change color to yellow when about to activate (last second)
                if (this.activationDelay < 60) {
                    this.base.material.color.setHex(this.type.warningColor);
                    
                    // Create pulsing effect
                    if (this.activationDelay % 10 === 0) {
                        // Flash between yellow and orange
                        const color = this.activationDelay % 20 === 0 ? this.type.warningColor : 0xff8800;
                        this.base.material.color.setHex(color);
                    }
                }
                
                return; // Don't do anything until activated
            } else {
                // Activate the turret
                this.activated = true;
                this.base.material.color.setHex(this.type.activeColor); // Change to active color
                
                // Randomize initial cooldown to prevent all turrets from firing at once
                this.shootCooldown = Math.floor(Math.random() * this.maxShootCooldown);
            }
        }

        // Rotate to face player
        const direction = new THREE.Vector3()
            .subVectors(playerPosition, this.base.position)
            .normalize();
        this.base.rotation.y = Math.atan2(direction.x, direction.z);

        // Update shooting cooldown
        if (this.shootCooldown > 0) this.shootCooldown--;
        
        // Shoot if possible
        if (this.canShoot()) {
            this.shoot(direction);
        }
        
        // Update projectiles
        this.updateProjectiles();
    }
    
    shoot(direction) {
        // Add slight randomness to aiming (imperfect aim)
        const randomSpread = 0.1; // Max 0.1 radians spread (about 5.7 degrees)
        const randomX = (Math.random() * 2 - 1) * randomSpread;
        const randomY = (Math.random() * 2 - 1) * randomSpread * 0.5; // Less vertical spread
        const randomZ = (Math.random() * 2 - 1) * randomSpread;
        
        // Apply randomness to direction
        const shootDir = direction.clone();
        shootDir.x += randomX;
        shootDir.y += randomY; 
        shootDir.z += randomZ;
        shootDir.normalize();
        
        // Calculate position at the end of the gun
        const gunTip = new THREE.Vector3(0, 0, 1.5);
        // Transform to world coordinates
        gunTip.applyMatrix4(this.gun.matrixWorld);
        
        // Create projectile
        const projectile = new Projectile(
            gunTip, 
            shootDir, 
            this.type.projectileSpeed, // speed
            this.type.damage,  // damage
            'turret' // source
        );
        
        // Add projectile meshes to scene
        this.scene.add(projectile.mesh);
        this.scene.add(projectile.light);
        
        // Add to our tracked projectiles
        this.projectiles.push(projectile);
        
        // Reset cooldown
        this.shootCooldown = this.maxShootCooldown;
    }
    
    updateProjectiles() {
        for (let i = 0; i < this.projectiles.length; i++) {
            const projectile = this.projectiles[i];
            
            // Update projectile
            projectile.update();
            
            // Remove dead projectiles
            if (!projectile.alive) {
                this.scene.remove(projectile.mesh);
                this.scene.remove(projectile.light);
                this.projectiles.splice(i, 1);
                i--;
            }
        }
    }

    damage() {
        this.health--;
        if (this.health <= 0) {
            this.alive = false;
            this.base.material.color.setHex(0x333333); // Darkened color when destroyed
        }
    }

    canShoot() {
        return this.alive && this.activated && this.shootCooldown <= 0;
    }
    
    getProjectiles() {
        return this.projectiles;
    }
    
    removeFromScene() {
        // Remove all projectiles
        for (const projectile of this.projectiles) {
            this.scene.remove(projectile.mesh);
            this.scene.remove(projectile.light);
        }
        
        // Remove turret
        this.scene.remove(this.base);
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
            'M': false,
            'r': false,
            'R': false
        }
        
        // Core game state
        this.score = 0;
        this.health = 100;
        this.maxHealth = 100;
        
        // Add turrets array
        this.turrets = [];
        
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
            
            // Create turrets
            this.createTurrets();
            
            // Create player's weapon
            this.createWeapon();
            
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
        console.log("Creating larger arena with walls");
        
        // Create a simple grid floor - 200x200 for 4x larger area
        const gridSize = 200;
        const gridHelper = new THREE.GridHelper(gridSize, 40, 0xff00ff, 0x00ffff);
        this.scene.add(gridHelper);
        
        // Create a ground plane
        const groundGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
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
        
        // Add bounding walls
        this.createWalls(gridSize);
        
        // Create obstacles
        this.createObstacles(gridSize);
    }

    createSimpleTruck() {
        console.log("Creating simplified truck");
        
        // Create a basic box for the truck
        const truckGeometry = new THREE.BoxGeometry(2, 1, 3);
        const truckMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xff00ff,
            shininess: 30,
            wireframe: false
        });
        this.truck = new THREE.Mesh(truckGeometry, truckMaterial);
        this.truck.position.set(0, 1, 0);
        this.scene.add(this.truck);
        
        // Add basic properties
        this.truck.velocity = 0;
        this.truck.acceleration = 0;
        
        // Add wheels for better visual feedback
        this.addWheelsToTruck();
    }

    addWheelsToTruck() {
        // Create wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32);
        wheelGeometry.rotateX(Math.PI / 2); // Rotate to align with truck
        
        const wheelMaterial = new THREE.MeshPhongMaterial({
            color: 0x333333,
            shininess: 80
        });
        
        // Create and position 4 wheels
        this.wheels = [];
        
        // Front left
        const wheelFL = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelFL.position.set(-1.1, -0.3, -1);
        this.truck.add(wheelFL);
        this.wheels.push(wheelFL);
        
        // Front right
        const wheelFR = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelFR.position.set(1.1, -0.3, -1);
        this.truck.add(wheelFR);
        this.wheels.push(wheelFR);
        
        // Rear left
        const wheelRL = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelRL.position.set(-1.1, -0.3, 1);
        this.truck.add(wheelRL);
        this.wheels.push(wheelRL);
        
        // Rear right
        const wheelRR = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelRR.position.set(1.1, -0.3, 1);
        this.truck.add(wheelRR);
        this.wheels.push(wheelRR);
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
        
        // Add score display
        const scoreDiv = document.createElement('div');
        scoreDiv.id = 'score';
        scoreDiv.textContent = `Score: ${this.score}`;
        hudContainer.appendChild(scoreDiv);
        this.scoreDisplay = scoreDiv;
        
        // Add ammo display
        const ammoDiv = document.createElement('div');
        ammoDiv.id = 'ammo';
        ammoDiv.textContent = `Ammo: 0/0`;
        hudContainer.appendChild(ammoDiv);
        this.ammoDisplay = ammoDiv;
        
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
        
        // Process keyboard input for more realistic driving
        const acceleration = 0.01;
        const deceleration = 0.98; // Friction
        const maxSpeed = 0.5;
        const turnSpeed = 0.03;
        
        // Calculate the truck's forward direction based on its rotation
        const direction = new THREE.Vector3();
        direction.z = Math.cos(this.truck.rotation.y);
        direction.x = Math.sin(this.truck.rotation.y);
        
        // Acceleration/braking
        if (this.keys['ArrowUp']) {
            this.truck.velocity += acceleration;
            if (this.truck.velocity > maxSpeed) {
                this.truck.velocity = maxSpeed;
            }
        } else if (this.keys['ArrowDown']) {
            this.truck.velocity -= acceleration;
            if (this.truck.velocity < -maxSpeed/2) {  // Slower in reverse
                this.truck.velocity = -maxSpeed/2;
            }
        } else {
            // Natural deceleration
            this.truck.velocity *= deceleration;
            if (Math.abs(this.truck.velocity) < 0.001) {
                this.truck.velocity = 0;
            }
        }
        
        // Turning - more effective at lower speeds
        const turnFactor = 1 - (Math.abs(this.truck.velocity) / maxSpeed) * 0.5;
        if (this.keys['ArrowLeft']) {
            // Only turn when moving
            if (Math.abs(this.truck.velocity) > 0.01) {
                this.truck.rotation.y += turnSpeed * turnFactor * Math.sign(this.truck.velocity);
                this.animateWheelTurn(this.truck.velocity > 0 ? -1 : 1);
            }
        } else if (this.keys['ArrowRight']) {
            // Only turn when moving
            if (Math.abs(this.truck.velocity) > 0.01) {
                this.truck.rotation.y -= turnSpeed * turnFactor * Math.sign(this.truck.velocity);
                this.animateWheelTurn(this.truck.velocity > 0 ? 1 : -1);
            }
        } else {
            this.resetWheels();
        }
        
        // Calculate new position
        const newPosition = new THREE.Vector3(
            this.truck.position.x + direction.x * this.truck.velocity,
            this.truck.position.y,
            this.truck.position.z + direction.z * this.truck.velocity
        );
        
        // Check for wall collisions before moving
        if (this.walls) {
            const truckSize = 2.5; // Half width/length of truck for collision
            const wallHalfSize = this.walls.halfSize;
            const wallThickness = this.walls.thickness;
            let wallCollision = false;
            
            // Check X boundaries (East and West walls)
            if (newPosition.x > wallHalfSize - truckSize) {
                // Save previous position to calculate bounce
                const prevX = newPosition.x;
                newPosition.x = wallHalfSize - truckSize;
                
                // Reverse velocity with bounce factor (don't just reduce it)
                this.truck.velocity *= -0.7; // Bounce with 70% of original speed in opposite direction
                
                // Mark collision for damage calculation
                wallCollision = true;
            } else if (newPosition.x < -wallHalfSize + truckSize) {
                // Save previous position to calculate bounce
                const prevX = newPosition.x;
                newPosition.x = -wallHalfSize + truckSize;
                
                // Reverse velocity with bounce factor
                this.truck.velocity *= -0.7; // Bounce with 70% of original speed in opposite direction
                
                // Mark collision for damage calculation
                wallCollision = true;
            }
            
            // Check Z boundaries (North and South walls)
            if (newPosition.z > wallHalfSize - truckSize) {
                // Save previous position to calculate bounce
                const prevZ = newPosition.z;
                newPosition.z = wallHalfSize - truckSize;
                
                // Reverse velocity with bounce factor
                this.truck.velocity *= -0.7; // Bounce with 70% of original speed in opposite direction
                
                // Mark collision for damage calculation
                wallCollision = true;
            } else if (newPosition.z < -wallHalfSize + truckSize) {
                // Save previous position to calculate bounce
                const prevZ = newPosition.z;
                newPosition.z = -wallHalfSize + truckSize;
                
                // Reverse velocity with bounce factor
                this.truck.velocity *= -0.7; // Bounce with 70% of original speed in opposite direction
                
                // Mark collision for damage calculation
                wallCollision = true;
            }
            
            // Apply damage on collision
            if (wallCollision) {
                this.applyCollisionDamage();
                this.showCollisionEffect(newPosition);
            }
        }
        
        // Check collisions with pillars/obstacles
        let obstacleCollision = false;
        if (this.obstacles && this.obstacles.length > 0) {
            const truckRadius = 2.5; // Approx radius of truck for collision
            
            for (const obstacle of this.obstacles) {
                // Calculate distance between truck and obstacle center on the XZ plane
                const truckPos2D = new THREE.Vector2(newPosition.x, newPosition.z);
                const distance = truckPos2D.distanceTo(obstacle.position);
                
                // Check if collision occurs (sum of radii)
                if (distance < (truckRadius + obstacle.radius)) {
                    // Collision detected, calculate push vector
                    const pushVector = new THREE.Vector2(
                        truckPos2D.x - obstacle.position.x,
                        truckPos2D.y - obstacle.position.y
                    );
                    
                    // Normalize and scale to minimum separation distance
                    pushVector.normalize();
                    const separation = truckRadius + obstacle.radius;
                    
                    // Bounce direction calculation
                    const dotProduct = 
                        (direction.x * pushVector.x) + 
                        (direction.z * pushVector.y);
                    
                    // Update position to avoid overlap
                    newPosition.x = obstacle.position.x + pushVector.x * separation;
                    newPosition.z = obstacle.position.y + pushVector.y * separation;
                    
                    // Apply bounce effect (reverse velocity component in the collision normal)
                    this.truck.velocity *= -0.7; // Bounce with 70% of velocity in opposite direction
                    
                    // Set collision flag for damage
                    obstacleCollision = true;
                    
                    // Create collision effect at the impact point
                    this.showCollisionEffect(newPosition);
                    
                    // Break after first collision for simplicity
                    break;
                }
            }
            
            // Apply damage on obstacle collision
            if (obstacleCollision) {
                this.applyCollisionDamage();
            }
        }
        
        // Apply final position
        this.truck.position.copy(newPosition);
        
        // Animate wheels rolling based on speed
        this.animateWheelRoll(this.truck.velocity);
        
        // Update camera to follow truck with smooth transition
        if (this.camera) {
            // Position camera behind truck based on truck's direction
            const cameraDistance = 15;
            const cameraHeight = 8;
            const targetCameraPos = new THREE.Vector3(
                this.truck.position.x - direction.x * cameraDistance,
                this.truck.position.y + cameraHeight,
                this.truck.position.z - direction.z * cameraDistance
            );
            
            // Smoothly interpolate camera position
            this.camera.position.lerp(targetCameraPos, 0.05);
            this.camera.lookAt(this.truck.position);
        }
        
        // Handle shooting
        if (this.keys[' '] && this.weapon) {
            const truckDirection = new THREE.Vector3(
                Math.sin(this.truck.rotation.y),
                0,
                Math.cos(this.truck.rotation.y)
            );
            
            // Get position at the front of the truck
            const weaponPosition = this.weaponMesh.getWorldPosition(new THREE.Vector3());
            
            // Fire the weapon
            this.weapon.shoot(weaponPosition, truckDirection, 'player');
        }
        
        // Handle reload
        if ((this.keys['r'] || this.keys['R']) && this.weapon && !this.weapon.isReloading && this.weapon.ammo < this.weapon.maxAmmo) {
            // Start reload
            this.weapon.reload();
            
            // Show reloading notification
            this.showNotification("Reloading...");
        }
        
        // Update weapon
        if (this.weapon) {
            this.weapon.update();
            
            // Update ammo display
            if (this.ammoDisplay) {
                this.ammoDisplay.textContent = `Ammo: ${this.weapon.ammo}/${this.weapon.maxAmmo}`;
            }
        }
        
        // Update turrets
        this.updateTurrets();
        
        // Check for projectile hits
        this.checkProjectileHits();
        
        // Check for player projectile hits on turrets
        this.checkPlayerProjectileHits();
    }

    animateWheelRoll(speed) {
        if (!this.wheels || this.wheels.length === 0) return;
        
        // Rotate wheels based on speed
        const rotationSpeed = speed * 0.5;
        
        // Rotate all wheels (they're oriented with rotation.x being the roll axis)
        this.wheels.forEach(wheel => {
            wheel.rotation.x += rotationSpeed;
        });
    }

    animateWheelTurn(direction) {
        if (!this.wheels || this.wheels.length < 2) return;
        
        // Front wheels turn for steering
        const maxTurnAngle = 0.3; // in radians (about 17 degrees)
        
        // Front left and right wheels (first two in the array)
        this.wheels[0].rotation.y = maxTurnAngle * direction;
        this.wheels[1].rotation.y = maxTurnAngle * direction;
    }

    resetWheels() {
        if (!this.wheels || this.wheels.length < 2) return;
        
        // Reset front wheel steering angle
        this.wheels[0].rotation.y = 0;
        this.wheels[1].rotation.y = 0;
    }

    createWalls(gridSize) {
        const wallHeight = 10;
        const wallThickness = 2;
        const halfSize = gridSize / 2;
        
        // Common material for all walls
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0xff00ff,
            emissive: 0x550055,
            shininess: 30
        });
        
        // North wall (positive Z)
        const northWallGeometry = new THREE.BoxGeometry(gridSize + wallThickness * 2, wallHeight, wallThickness);
        const northWall = new THREE.Mesh(northWallGeometry, wallMaterial);
        northWall.position.set(0, wallHeight / 2, halfSize + wallThickness / 2);
        this.scene.add(northWall);
        
        // South wall (negative Z)
        const southWallGeometry = new THREE.BoxGeometry(gridSize + wallThickness * 2, wallHeight, wallThickness);
        const southWall = new THREE.Mesh(southWallGeometry, wallMaterial);
        southWall.position.set(0, wallHeight / 2, -halfSize - wallThickness / 2);
        this.scene.add(southWall);
        
        // East wall (positive X)
        const eastWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, gridSize);
        const eastWall = new THREE.Mesh(eastWallGeometry, wallMaterial);
        eastWall.position.set(halfSize + wallThickness / 2, wallHeight / 2, 0);
        this.scene.add(eastWall);
        
        // West wall (negative X)
        const westWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, gridSize);
        const westWall = new THREE.Mesh(westWallGeometry, wallMaterial);
        westWall.position.set(-halfSize - wallThickness / 2, wallHeight / 2, 0);
        this.scene.add(westWall);
        
        // Store wall references for collision detection
        this.walls = {
            north: northWall,
            south: southWall,
            east: eastWall,
            west: westWall,
            size: gridSize,
            halfSize: halfSize,
            thickness: wallThickness
        };
    }

    createObstacles(gridSize) {
        const halfSize = gridSize / 2;
        
        // Create pillars as obstacles around the arena
        const pillarGeometry = new THREE.CylinderGeometry(3, 3, 15, 16);
        const pillarMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            emissive: 0x005555,
            shininess: 50
        });
        
        // Create array for obstacles
        this.obstacles = [];
        
        // Add several pillars in various locations
        const pillarPositions = [
            // Outer ring
            { x: halfSize * 0.8, z: 0 },
            { x: -halfSize * 0.8, z: 0 },
            { x: 0, z: halfSize * 0.8 },
            { x: 0, z: -halfSize * 0.8 },
            
            // Inner obstacles
            { x: halfSize * 0.4, z: halfSize * 0.4 },
            { x: -halfSize * 0.4, z: halfSize * 0.4 },
            { x: halfSize * 0.4, z: -halfSize * 0.4 },
            { x: -halfSize * 0.4, z: -halfSize * 0.4 },
            
            // Random additional pillars
            { x: halfSize * 0.2, z: halfSize * 0.6 },
            { x: -halfSize * 0.2, z: -halfSize * 0.6 },
            { x: halfSize * 0.6, z: -halfSize * 0.2 },
            { x: -halfSize * 0.6, z: halfSize * 0.2 }
        ];
        
        // Create all the pillars
        pillarPositions.forEach(pos => {
            const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
            pillar.position.set(pos.x, 7.5, pos.z); // Half height is 7.5
            this.scene.add(pillar);
            
            // Store for collision detection
            this.obstacles.push({
                mesh: pillar,
                position: new THREE.Vector2(pos.x, pos.z),
                radius: 3 // Radius of the pillar
            });
        });
    }

    applyCollisionDamage() {
        // Apply 25% damage to health
        const damageAmount = Math.ceil(this.maxHealth * 0.25);
        this.health = Math.max(0, this.health - damageAmount);
        
        console.log(`Collision damage applied: -${damageAmount}. Health now: ${this.health}`);
        
        // Update health display
        const healthDiv = document.getElementById('health');
        if (healthDiv) {
            healthDiv.textContent = `Health: ${this.health}`;
            
            // Add visual feedback with red flash
            healthDiv.style.color = 'red';
            setTimeout(() => {
                healthDiv.style.color = 'white';
            }, 300);
        }
        
        // Flash the screen red
        this.flashScreen('rgba(255, 0, 0, 0.3)');
        
        // Check if health is depleted
        if (this.health <= 0) {
            this.gameOver();
        }
    }

    showCollisionEffect(position) {
        // Create particles for collision
        const particleCount = 15;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            // Create a particle
            const size = Math.random() * 0.5 + 0.2;
            const geometry = new THREE.SphereGeometry(size, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(geometry, material);
            
            // Position at collision point
            particle.position.set(
                position.x + (Math.random() - 0.5) * 2,
                position.y + Math.random() * 3,
                position.z + (Math.random() - 0.5) * 2
            );
            
            // Add velocity
            particle.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    Math.random() * 0.5,
                    (Math.random() - 0.5) * 0.3
                ),
                life: 1.0
            };
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate particles
        const animateParticles = () => {
            let allDead = true;
            
            for (let i = 0; i < particles.length; i++) {
                const particle = particles[i];
                
                // Update position
                particle.position.x += particle.userData.velocity.x;
                particle.position.y += particle.userData.velocity.y;
                particle.position.z += particle.userData.velocity.z;
                
                // Apply gravity
                particle.userData.velocity.y -= 0.02;
                
                // Update life and opacity
                particle.userData.life -= 0.02;
                if (particle.material) {
                    particle.material.opacity = particle.userData.life;
                }
                
                // Check if still alive
                if (particle.userData.life > 0) {
                    allDead = false;
                } else {
                    // Remove dead particles
                    this.scene.remove(particle);
                }
            }
            
            // Continue animation if particles are still alive
            if (!allDead) {
                requestAnimationFrame(animateParticles);
            }
        };
        
        // Start animation
        animateParticles();
        
        // Shake camera for effect
        this.shakeCamera(0.5);
    }

    flashScreen(color) {
        // Create a fullscreen overlay for the flash effect
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.backgroundColor = color;
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '1000';
        flash.style.opacity = '1';
        flash.style.transition = 'opacity 0.3s ease-out';
        
        document.body.appendChild(flash);
        
        // Fade out and remove
        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(flash);
            }, 300);
        }, 100);
    }

    shakeCamera(intensity) {
        // Store original camera position
        if (!this.cameraOriginalPosition) {
            this.cameraOriginalPosition = this.camera.position.clone();
        }
        
        // Apply random offset to camera
        const shake = () => {
            this.camera.position.x += (Math.random() - 0.5) * intensity;
            this.camera.position.y += (Math.random() - 0.5) * intensity;
            this.camera.position.z += (Math.random() - 0.5) * intensity;
        };
        
        // Shake for a short time
        let shakeCount = 0;
        const maxShakes = 5;
        
        const shakeInterval = setInterval(() => {
            shake();
            shakeCount++;
            
            if (shakeCount >= maxShakes) {
                clearInterval(shakeInterval);
            }
        }, 50);
    }

    gameOver() {
        console.log("Game Over! Health depleted.");
        
        // Create game over screen
        const gameOverDiv = document.createElement('div');
        gameOverDiv.style.position = 'fixed';
        gameOverDiv.style.top = '0';
        gameOverDiv.style.left = '0';
        gameOverDiv.style.width = '100%';
        gameOverDiv.style.height = '100%';
        gameOverDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameOverDiv.style.display = 'flex';
        gameOverDiv.style.flexDirection = 'column';
        gameOverDiv.style.justifyContent = 'center';
        gameOverDiv.style.alignItems = 'center';
        gameOverDiv.style.zIndex = '2000';
        
        // Add message
        const gameOverText = document.createElement('h1');
        gameOverText.textContent = 'GAME OVER';
        gameOverText.style.color = '#ff00ff';
        gameOverText.style.fontFamily = 'Arial, sans-serif';
        gameOverText.style.fontSize = '48px';
        gameOverText.style.textShadow = '0 0 10px #ff00ff';
        gameOverDiv.appendChild(gameOverText);
        
        // Add restart button
        const restartButton = document.createElement('button');
        restartButton.textContent = 'RESTART';
        restartButton.style.marginTop = '30px';
        restartButton.style.padding = '10px 20px';
        restartButton.style.fontSize = '24px';
        restartButton.style.backgroundColor = '#ff00ff';
        restartButton.style.color = 'white';
        restartButton.style.border = 'none';
        restartButton.style.borderRadius = '5px';
        restartButton.style.cursor = 'pointer';
        
        restartButton.onclick = () => {
            window.location.reload();
        };
        
        gameOverDiv.appendChild(restartButton);
        
        // Add to document
        document.body.appendChild(gameOverDiv);
        
        // Stop the game
        this.isGameOver = true;
    }

    createTurrets() {
        // Create turrets at random positions in the arena
        const arenaSize = 100; // Assuming arena is 100x100
        const minDistanceFromCenter = 30; // Minimum distance from center
        const numTurrets = 8; // Number of turrets to create
        
        // Define turret types
        const turretTypes = [
            {
                name: "Standard",
                color: 0x666666,
                activeColor: 0xff0000,
                warningColor: 0xffff00,
                health: 5,
                damage: 10,
                fireRate: 60, // 1 shot per second
                projectileSpeed: 0.3
            },
            {
                name: "Heavy",
                color: 0x444444,
                activeColor: 0xbb0000,
                warningColor: 0xbbbb00,
                health: 8,
                damage: 20,
                fireRate: 120, // 1 shot per 2 seconds
                projectileSpeed: 0.25
            },
            {
                name: "Rapid",
                color: 0x888888,
                activeColor: 0xff3333,
                warningColor: 0xffff33,
                health: 3,
                damage: 5,
                fireRate: 30, // 2 shots per second
                projectileSpeed: 0.35
            }
        ];
        
        for (let i = 0; i < numTurrets; i++) {
            // Generate random position, ensuring it's not too close to center
            let x, z;
            do {
                x = (Math.random() * 2 - 1) * arenaSize/2;
                z = (Math.random() * 2 - 1) * arenaSize/2;
            } while (Math.sqrt(x*x + z*z) < minDistanceFromCenter);
            
            const position = new THREE.Vector3(x, 0, z);
            
            // Select random turret type
            const typeIndex = Math.floor(Math.random() * turretTypes.length);
            const turretType = turretTypes[typeIndex];
            
            // Create turret with type
            const turret = new Turret(position, this.scene, turretType);
            
            // Add random activation delay (2-7 seconds)
            turret.activationDelay = Math.floor(Math.random() * 300) + 120; // 120-420 frames (2-7 seconds)
            
            this.turrets.push(turret);
        }
    }

    updateTurrets() {
        // Track if any turrets activated this frame
        let newActivations = 0;
        
        // Update each turret
        for (let i = 0; i < this.turrets.length; i++) {
            const turret = this.turrets[i];
            
            // Check if turret is about to activate
            const wasActive = turret.activated;
            
            // Pass player position
            if (this.truck) {
                turret.update(this.truck.position);
            }
            
            // Check if turret just activated
            if (!wasActive && turret.activated) {
                newActivations++;
            }
        }
        
        // Show notification if turrets activated
        if (newActivations === 1) {
            this.showNotification("Warning: Turret activated!", 2000);
        } else if (newActivations > 1) {
            this.showNotification(`Warning: ${newActivations} turrets activated!`, 2000);
        }
    }
    
    checkProjectileHits() {
        if (!this.truck) return;
        
        // Check each turret's projectiles
        for (const turret of this.turrets) {
            const projectiles = turret.getProjectiles();
            
            for (let i = 0; i < projectiles.length; i++) {
                const projectile = projectiles[i];
                
                // Calculate distance to player
                const distance = projectile.mesh.position.distanceTo(this.truck.position);
                
                // If projectile hits player
                if (distance < 2) { // 2 is roughly the truck size
                    // Mark projectile as dead
                    projectile.alive = false;
                    
                    // Apply damage to player
                    this.health -= projectile.damage;
                    
                    // Update health display
                    const healthDiv = document.getElementById('health');
                    if (healthDiv) {
                        healthDiv.textContent = `Health: ${this.health}`;
                    }
                    
                    // Check if health depleted
                    if (this.health <= 0) {
                        this.gameOver();
                    }
                    
                    // Show hit effect
                    this.showCollisionEffect(projectile.mesh.position);
                    
                    // Shake camera based on damage
                    this.shakeCamera(projectile.damage / 10);
                    
                    // Flash screen red
                    this.flashScreen(0xff0000);
                }
            }
        }
    }

    checkPlayerProjectileHits() {
        // Check if the player's weapon exists
        if (!this.weapon) return;
        
        // Get all active projectiles from the weapon
        const projectiles = this.weapon.projectiles;
        
        // Check each projectile
        for (let i = 0; i < projectiles.length; i++) {
            const projectile = projectiles[i];
            
            // Check each turret
            for (let j = 0; j < this.turrets.length; j++) {
                const turret = this.turrets[j];
                
                // Skip dead turrets
                if (!turret.alive) continue;
                
                // Get distance to turret
                const distance = projectile.mesh.position.distanceTo(turret.base.position);
                
                // If hit
                if (distance < 1.5) {
                    // Remove projectile
                    projectile.alive = false;
                    
                    // Damage turret
                    turret.damage();
                    
                    // Create hit effect
                    this.showCollisionEffect(projectile.mesh.position.clone());
                    
                    // If turret is destroyed, give player points
                    if (!turret.alive) {
                        // Add score based on turret type
                        let scoreValue = 100; // Default score
                        
                        // Bonus score for harder turrets
                        if (turret.type.name === "Heavy") {
                            scoreValue = 200;
                        } else if (turret.type.name === "Rapid") {
                            scoreValue = 150;
                        }
                        
                        // Add score
                        this.score += scoreValue;
                        if (this.scoreDisplay) {
                            this.scoreDisplay.textContent = `Score: ${this.score}`;
                        }
                        
                        // Show notification with appropriate message
                        this.showNotification(`${turret.type.name} Turret destroyed! +${scoreValue} points`);
                    }
                }
            }
        }
    }

    createWeapon() {
        // Create a basic weapon for the player
        this.weapon = new Weapon(this.scene, WeaponTypes.MACHINE_GUN);
        
        // Add a simple weapon model attached to the truck
        const weaponGeometry = new THREE.BoxGeometry(0.3, 0.3, 1);
        const weaponMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00ffff,
            emissive: 0x005555
        });
        
        this.weaponMesh = new THREE.Mesh(weaponGeometry, weaponMaterial);
        this.weaponMesh.position.set(0, 0.5, -1); // Mount on front of truck
        this.truck.add(this.weaponMesh);
    }

    showNotification(message, duration = 2000) {
        // Create or get the notification element
        let notification = document.getElementById('gameNotification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'gameNotification';
            notification.style.position = 'absolute';
            notification.style.top = '50px';
            notification.style.left = '50%';
            notification.style.transform = 'translateX(-50%)';
            notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            notification.style.color = '#fff';
            notification.style.padding = '10px 20px';
            notification.style.borderRadius = '5px';
            notification.style.fontFamily = 'Arial, sans-serif';
            notification.style.zIndex = '1000';
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s ease-in-out';
            document.body.appendChild(notification);
        }
        
        // Set message and show
        notification.textContent = message;
        notification.style.opacity = '1';
        
        // Hide after duration
        clearTimeout(this.notificationTimeout);
        this.notificationTimeout = setTimeout(() => {
            notification.style.opacity = '0';
        }, duration);
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
