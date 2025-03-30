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
import { AudioManager } from './AudioManager.js'

const TRUCK_SPECS = {
    'NEON CRUSHER': {
        acceleration: 0.019,   // Reduced by 5%
        maxSpeed: 0.95,        // Reduced by 5%
        handling: 0.0162,       // Kept the same
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
        const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 6) // Reduced segments from 8 to 6
        geometry.rotateX(Math.PI / 2);
        
        const projectileColor = source === 'player' ? 0xff00ff : 0xff0000
        // Changed to MeshBasicMaterial from MeshPhongMaterial
        const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(projectileColor),
            transparent: true,
            opacity: 0.8,
            emissive: projectileColor,
            shininess: 10
        })
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        
        // Remove point light for better performance
        // this.light = new THREE.PointLight(projectileColor, 0.5, 3);
        // this.light.position.copy(position);
        
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
        // No light to update
        // this.light.position.copy(this.mesh.position);
        
        this.lifespan--;
        if (this.lifespan <= 0) this.alive = false;
        
        // Only create trail on some frames to reduce overhead
        if (Math.random() < 0.3) { // 30% chance to create trail
            this.createTrail();
        }
    }

    createTrail() {
        // Create simpler particle trail
        const trailGeometry = new THREE.SphereGeometry(0.05, 4, 2); // Reduced segments
        const trailMaterial = new THREE.MeshPhongMaterial({
            color: this.source === 'player' ? 0xff00ff : 0xff0000,
            transparent: true,
            opacity: 0.5,
            emissive: this.source === 'player' ? 0xff00ff : 0xff0000,
            shininess: 10
        })
        const trail = new THREE.Mesh(trailGeometry, trailMaterial)
        trail.position.copy(this.mesh.position);
        
        // Fade out and remove trail particles - simplified
        setTimeout(() => {
            if (trail.parent) trail.parent.remove(trail);
        }, 100); // Reduced from 50 + fading to just 100ms then remove
        
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
        projectileSpeed: 0.3,
        scale: 15 // Added default scale
    }) {
        // Save type
        this.type = type;
        
        // Apply scale factor - use type.scale or default to 15 (1.5x the original 10)
        const turretScale = type.scale || 15;
        
        // Create turret base - adjust size based on type
        const baseScale = type.name === "Heavy" ? 1.3 : (type.name === "Rapid" ? 0.8 : 1);
        const baseGeometry = new THREE.CylinderGeometry(
            1 * baseScale * turretScale, 
            1 * baseScale * turretScale, 
            1 * turretScale, 
            8
        );
        // Use MeshBasicMaterial but with better color settings
        const baseMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(type.color),
            emissive: type.color,
            shininess: 10
        });
        this.base = new THREE.Mesh(baseGeometry, baseMaterial);
        this.base.position.copy(position);
        
        // Set the height correctly
        this.base.position.y = 0.5 * turretScale;

        // Create turret gun - adjust shape based on type
        let gunGeometry;
        
        if (type.name === "Heavy") {
            // Larger, shorter gun for heavy turret
            gunGeometry = new THREE.BoxGeometry(0.4 * turretScale, 0.4 * turretScale, 1.5 * turretScale);
        } else if (type.name === "Rapid") {
            // Thinner, longer gun for rapid turret
            gunGeometry = new THREE.BoxGeometry(0.2 * turretScale, 0.2 * turretScale, 2.2 * turretScale);
        } else {
            // Standard gun
            gunGeometry = new THREE.BoxGeometry(0.3 * turretScale, 0.3 * turretScale, 2 * turretScale);
        }
        
        // Keep using MeshBasicMaterial for turrets as they don't need lighting and it's faster
        const gunMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(type.color),
            emissive: type.color,
            shininess: 10
        });
        this.gun = new THREE.Mesh(gunGeometry, gunMaterial);
        this.gun.position.y = 0.5 * turretScale;
        this.gun.position.z = 0.5 * turretScale;
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
        // Handle respawn timer for destroyed turrets
        if (!this.alive && this.respawning) {
            this.respawnTimer--;
            
            // Respawn the turret after timer reaches zero
            if (this.respawnTimer <= 0) {
                this.respawn();
            }
            
            // Pulse the turret when it's about to respawn (last 3 seconds)
            if (this.respawnTimer <= 180 && this.respawnTimer % 20 === 0) {
                const pulseColor = this.respawnTimer % 40 === 0 ? 0x222222 : 0x444444;
                this.base.material.color.setHex(pulseColor);
            }
            
            return; // Skip normal update while respawning
        }
        
        if (!this.alive) return;
        
        // Handle activation delay
        if (!this.activated) {
            if (this.activationDelay > 0) {
                // Reduce activation delay faster (decrement by 2 instead of 1)
                this.activationDelay -= 2;
                
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

        // Calculate direction to player
        const direction = new THREE.Vector3()
            .subVectors(playerPosition, this.base.position)
            .normalize();
        
        // Calculate target rotation (angle in Y-axis)
        const targetRotation = Math.atan2(direction.x, direction.z);
        
        // Get current rotation as angle
        let currentRotation = this.base.rotation.y;
        
        // Normalize angles to -PI to PI range
        while (currentRotation > Math.PI) currentRotation -= Math.PI * 2;
        while (currentRotation < -Math.PI) currentRotation += Math.PI * 2;
        
        // Calculate shortest rotation direction
        let deltaRotation = targetRotation - currentRotation;
        
        // Ensure we rotate the shortest way
        if (deltaRotation > Math.PI) deltaRotation -= Math.PI * 2;
        if (deltaRotation < -Math.PI) deltaRotation += Math.PI * 2;
        
        // Apply rotation speed limit
        const rotationSpeed = this.type.rotationSpeed || 0.01; // Default if not defined
        
        // Clamp rotation amount to maximum rotation speed
        if (Math.abs(deltaRotation) > rotationSpeed) {
            deltaRotation = Math.sign(deltaRotation) * rotationSpeed;
        }
        
        // Apply rotation
        this.base.rotation.y += deltaRotation;

        // Update shooting cooldown
        if (this.shootCooldown > 0) this.shootCooldown--;
        
        // Only shoot if facing close enough to the player
        const facingPlayer = Math.abs(deltaRotation) < 0.1; // About 5.7 degrees
        
        // Shoot if possible and facing player
        if (this.canShoot() && facingPlayer) {
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
        // No light to add
        // this.scene.add(projectile.light);
        
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
                // No light to remove
                // this.scene.remove(projectile.light);
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
            
            // Store initial type and properties for respawn
            if (!this.respawning) {
                this.respawning = true;
                this.respawnTimer = 30 * 60; // 30 seconds at 60fps
                this.originalType = { ...this.type }; // Store original type for respawn
                this.originalHealth = this.type.health; // Store original health
                
                // Tilt to show destruction
                this.base.rotation.x = Math.random() * 0.5 - 0.25;
                this.base.rotation.z = Math.random() * 0.5 - 0.25;
            }
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
            // No light to remove
            // this.scene.remove(projectile.light);
        }
        
        // Remove turret
        this.scene.remove(this.base);
    }
    
    respawn() {
        // Reset turret state
        this.alive = true;
        this.respawning = false;
        this.health = this.originalHealth;
        this.type = { ...this.originalType };
        this.activated = false;
        this.activationDelay = Math.floor(Math.random() * 300) + 120; // 120-420 frames (2-7 seconds)
        
        // Reset appearance
        this.base.material.color.setHex(this.type.color);
        this.base.rotation.x = 0;
        this.base.rotation.z = 0;
        
        // Create respawn effect
        this.createRespawnEffect();
    }
    
    createRespawnEffect() {
        // Create a simple flash effect
        const flashColor = this.type.color;
        const flashLight = new THREE.PointLight(flashColor, 2, 20);
        flashLight.position.copy(this.base.position);
        flashLight.position.y += 5;
        this.scene.add(flashLight);
        
        // Auto-remove light after flash
        setTimeout(() => {
            this.scene.remove(flashLight);
        }, 1000);
        
        // Create particles using game's particle system if available
        if (this.scene.game && this.scene.game.createSimpleEffect) {
            // Create a burst of particles at the turret position
            this.scene.game.createSimpleEffect(
                new THREE.Vector3(
                    this.base.position.x,
                    this.base.position.y + 10,
                    this.base.position.z
                ),
                flashColor,
                15
            );
        }
    }
}

// Add PowerUp class for game powerups
class PowerUp {
    constructor(scene, position, type) {
        this.scene = scene;
        this.position = position.clone();
        this.type = type;
        this.mesh = null;
        this.light = null;
        this.created = false;
        this.createdTime = Date.now();
        
        // Create immediately
        this.create();
    }
    
    create() {
        if (this.created) return;
        
        // Create container
        this.mesh = new THREE.Object3D();
        this.mesh.position.copy(this.position);
        
        // Simple geometry for all powerup types to improve performance
        const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        let color;
        
        // Set color based on type - make colors more vibrant
        switch(this.type) {
            case 'SPEED_BOOST':
                color = 0x00ffaa;  // Brighter green
                break;
            case 'REPAIR':
                color = 0xff3366;  // Keep pink
                break;
            case 'SHIELD':
                color = 0xffdd00;  // Brighter yellow
                break;
            case 'AMMO':
                color = 0x00ccff;  // Brighter blue
                break;
            default:
                color = 0xff00ff;  // Magenta default
        }
        
        // Create material with emissive properties and make it more visible
        const material = new THREE.MeshPhongMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: 0.9,  // Increased from typical 0.8
            emissive: color,
            shininess: 10
        });
        
        const powerupMesh = new THREE.Mesh(geometry, material);
        this.mesh.add(powerupMesh);
        
        // Add a stronger light for better visibility
        this.light = new THREE.PointLight(color, 1.2, 8);  // Increased intensity from 0.8 to 1.2, range from 5 to 8
        this.light.position.set(0, 0, 0);
        this.mesh.add(this.light);
        
        // Set initial position slightly higher for better visibility
        this.mesh.position.y = 3; // Raised from 2 to 3
        
        // Add to scene
        this.scene.add(this.mesh);
        this.created = true;
    }
    
    update(isFullUpdate = true) {
        if (!this.mesh) return;
        
        const now = Date.now();
        
        // Simple floating animation
        const floatHeight = Math.sin(now * 0.002) * 0.5;
        this.mesh.position.y = 2 + floatHeight;
        
        // Simple rotation
        this.mesh.rotation.y += 0.02;
        this.mesh.rotation.x += 0.01;
        
        // Check if powerup should despawn (after 30 seconds)
        if (now - this.createdTime > 30000) {
            return true; // Signal to remove
        }
        
        return false; // Keep updating
    }
    
    createPickupEffect() {
        // Just create a basic effect using the simplified method
        if (this.scene.game && this.scene.game.createSimpleEffect) {
            this.scene.game.createSimpleEffect(this.mesh.position.clone(), this.light.color, 15);
        }
    }
    
    removeFromScene() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
    }
}

class Game {
    constructor() {
        console.log("Game constructor called");
        
        // Core initialization only
        this.scene = new THREE.Scene();
        this.scene.game = this; // Add reference to the game instance
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000); // Increased far plane for larger arena
        this.camera.position.set(0, 1600, 3200); // Doubled camera distance for 2x arena
        this.renderer = null;
        this.truck = null;
        this.isInitialized = false;
        
        // Disable debug by default
        this.debugMode = false;
        
        // Initialize audio manager with camera
        if (!window.audioManager) {
            console.log("Creating new AudioManager instance");
            window.audioManager = new AudioManager(this.camera);
        }
        this.audioManager = window.audioManager; // Always use the global instance
        
        // Create shared geometries for better performance
        this.sharedParticleGeometry = new THREE.SphereGeometry(1, 8, 6); // Higher quality than before
        
        // Initialize object pool manager for better performance
        this.objectPools = new ObjectPoolManager();
        
        // Set up object pools
        this.initObjectPools();
        
        // Detect mobile for performance optimizations
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Enable lower quality settings for mobile
        if (this.isMobile) {
            console.log("Mobile device detected - using performance settings");
            this.drawDistance = 600; // Doubled for larger arena
            this.maxParticles = 10;
            this.shadowsEnabled = false;
            this.effectsEnabled = false;
            this.gridEnabled = false;
            
            // Disable multiplayer on mobile for better performance
            window.multiplayerEnabled = false;
        } else {
            this.drawDistance = 2000; // Doubled for larger arena
            this.maxParticles = 30;
            this.shadowsEnabled = false; // Disabled shadows by default
            this.effectsEnabled = true;
            this.gridEnabled = true;
            
            // Enable multiplayer by default on desktop
            window.multiplayerEnabled = true;
        }
        
        // Performance mode flag - default to higher performance
        window.lowPerformanceMode = localStorage.getItem('lowPerformanceMode') === 'true' || false;
        if (window.lowPerformanceMode) {
            this.applyLowPerformanceMode();
        }
        
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
        
        // Add powerups array - reduced spawn rate by 50%
        this.powerups = [];
        this.powerupSpawnTimer = 0;
        this.powerupSpawnInterval = 600; // Doubled from 300 (10 seconds instead of 5)
        
  
        
        // FPS tracking
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateInterval = 500; // Update FPS display every 500ms
        this.lastFpsUpdate = 0;
        
        // FPS counter removed as requested
        // We'll keep the FPS tracking logic for performance monitoring
        
        // Multiplayer initialization - only if enabled
        if (window.multiplayerEnabled) {
            // Add a toggle button to disable multiplayer if performance is poor
            this.addMultiplayerToggle();
            
            // Initialize the multiplayer system
            this.multiplayer = new Multiplayer(this);
            console.log("Multiplayer system initialized:", this.multiplayer);
        }
        
        // Add performance toggle
        this.addPerformanceToggle();
        
        // Initialize the game
        this.init();
    }

    // Add a method to let users disable multiplayer if performance is poor
    addMultiplayerToggle() {
        // Check if the toggle already exists in HTML
        let toggle = document.getElementById('multiplayer-toggle');
        
        // If toggle exists in HTML, just update it
        if (toggle) {
            // Update the initial state
            toggle.textContent = window.multiplayerEnabled ? 
                '🌐 Multiplayer: ON - Click to toggle' : 
                '🌐 Multiplayer: OFF - Click to toggle';
            toggle.style.border = window.multiplayerEnabled ?
                '1px solid #00ffff' : '1px solid #ff0000';
                
            // Add event listener
            toggle.addEventListener('click', () => {
                window.multiplayerEnabled = !window.multiplayerEnabled;
                toggle.textContent = window.multiplayerEnabled ? 
                    '🌐 Multiplayer: ON - Click to toggle' : 
                    '🌐 Multiplayer: OFF - Click to toggle';
                toggle.style.border = window.multiplayerEnabled ?
                    '1px solid #00ffff' : '1px solid #ff0000';
                    
                // Save preference to localStorage
                localStorage.setItem('monsterTruckMultiplayer', window.multiplayerEnabled);
                    
                // Show notification
                this.showNotification(window.multiplayerEnabled ? 
                    'Multiplayer enabled - restart needed' : 
                    'Multiplayer disabled - performance will improve');
            });
            return;
        }
        
        // Only create a new toggle if it doesn't exist in HTML (fallback)
        toggle = document.createElement('div');
        toggle.id = 'multiplayer-toggle';
        toggle.style.position = 'fixed';
        toggle.style.bottom = '160px';
        toggle.style.left = '10px';
        toggle.style.backgroundColor = 'rgba(0,0,0,0.6)';
        toggle.style.padding = '5px 10px';
        toggle.style.color = '#fff';
        toggle.style.fontFamily = 'monospace';
        toggle.style.fontSize = '12px';
        toggle.style.zIndex = '1000';
        toggle.style.cursor = 'pointer';
        toggle.style.borderRadius = '5px';
        toggle.textContent = window.multiplayerEnabled ? 
            '🌐 Multiplayer: ON - Click to toggle' : 
            '🌐 Multiplayer: OFF - Click to toggle';
        toggle.style.border = window.multiplayerEnabled ?
            '1px solid #00ffff' : '1px solid #ff0000';
        
        toggle.addEventListener('click', () => {
            window.multiplayerEnabled = !window.multiplayerEnabled;
            toggle.textContent = window.multiplayerEnabled ? 
                '🌐 Multiplayer: ON - Click to toggle' : 
                '🌐 Multiplayer: OFF - Click to toggle';
            toggle.style.border = window.multiplayerEnabled ?
                '1px solid #00ffff' : '1px solid #ff0000';
                
            // Save preference to localStorage
            localStorage.setItem('monsterTruckMultiplayer', window.multiplayerEnabled);
                
            // Show notification
            this.showNotification(window.multiplayerEnabled ? 
                'Multiplayer enabled - restart needed' : 
                'Multiplayer disabled - performance will improve');
        });
        
        document.body.appendChild(toggle);
    }

    // Add performance toggle method
    addPerformanceToggle() {
        // Check if the toggle already exists in HTML
        let toggle = document.getElementById('performance-toggle');
        
        // If toggle exists in HTML, just update it
        if (toggle) {
            // Update the initial state
            toggle.textContent = window.lowPerformanceMode ? 
                '⚙️ Low Quality Mode' : '⚙️ High Quality Mode';
            toggle.style.border = window.lowPerformanceMode ?
                '1px solid #00ff00' : '1px solid #ff00ff';
                
            // Add event listener
            toggle.addEventListener('click', () => {
                window.lowPerformanceMode = !window.lowPerformanceMode;
                localStorage.setItem('lowPerformanceMode', window.lowPerformanceMode);
                
                toggle.textContent = window.lowPerformanceMode ? 
                    '⚙️ Low Quality Mode' : '⚙️ High Quality Mode';
                toggle.style.border = window.lowPerformanceMode ?
                    '1px solid #00ff00' : '1px solid #ff00ff';
                    
                // Apply changes immediately
                if (window.lowPerformanceMode) {
                    this.applyLowPerformanceMode();
                    this.showNotification('Low quality mode enabled - better performance');
                } else {
                    this.applyHighPerformanceMode();
                    this.showNotification('High quality mode enabled - better visuals');
                }
            });
            return;
        }
        
        // Only create a new toggle if it doesn't exist in HTML (fallback)
        toggle = document.createElement('div');
        toggle.id = 'performance-toggle';
        toggle.style.position = 'fixed';
        toggle.style.bottom = '120px';
        toggle.style.left = '10px';
        toggle.style.backgroundColor = 'rgba(0,0,0,0.6)';
        toggle.style.padding = '5px 10px';
        toggle.style.color = '#fff';
        toggle.style.fontFamily = 'monospace';
        toggle.style.fontSize = '12px';
        toggle.style.zIndex = '1000';
        toggle.style.cursor = 'pointer';
        toggle.style.borderRadius = '5px';
        toggle.textContent = window.lowPerformanceMode ? 
            '⚙️ Low Quality Mode' : '⚙️ High Quality Mode';
        toggle.style.border = window.lowPerformanceMode ?
            '1px solid #00ff00' : '1px solid #ff00ff';
        
        toggle.addEventListener('click', () => {
            window.lowPerformanceMode = !window.lowPerformanceMode;
            localStorage.setItem('lowPerformanceMode', window.lowPerformanceMode);
            
            toggle.textContent = window.lowPerformanceMode ? 
                '⚙️ Low Quality Mode' : '⚙️ High Quality Mode';
            toggle.style.border = window.lowPerformanceMode ?
                '1px solid #00ff00' : '1px solid #ff00ff';
                
            // Apply changes immediately
            if (window.lowPerformanceMode) {
                this.applyLowPerformanceMode();
                this.showNotification('Low quality mode enabled - better performance');
            } else {
                this.applyHighPerformanceMode();
                this.showNotification('High quality mode enabled - better visuals');
            }
        });
        
        document.body.appendChild(toggle);
    }

    // Method to apply low performance mode
    applyLowPerformanceMode() {
        // Disable shadows
        this.shadowsEnabled = false;
        
        // Remove grid helper if it exists
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper = null;
        }
        
        // Limit particles and effects
        this.maxParticles = 10;
        this.effectsEnabled = false;
        
        // Update renderer settings
        this.updateRendererSettings();
    }

    // Method to apply high performance mode
    applyHighPerformanceMode() {
        // Keep shadows disabled as requested
        this.shadowsEnabled = false;
        
        // Add grid helper back if it was removed
        if (!this.gridHelper && this.gridEnabled) {
            this.gridHelper = new THREE.GridHelper(1560, 20); // 2x size, reduced divisions
            this.scene.add(this.gridHelper);
        }
        
        // Increase particles limit
        this.maxParticles = 30;
        this.effectsEnabled = true;
        
        // Update renderer settings
        this.updateRendererSettings();
    }

    initObjectPools() {
        // Create particle pool
        this.objectPools.createPool('particles', () => {
            // Use shared geometry instead of creating new ones each time
            const material = new THREE.MeshPhongMaterial({
                color: 0xff00ff,
                emissive: 0xff00ff,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            const mesh = new THREE.Mesh(this.sharedParticleGeometry, material);
            mesh.visible = false;
            this.scene.add(mesh);
            return {
                mesh: mesh,
                reset: function(position, color) {
                    this.mesh.visible = true;
                    this.mesh.position.copy(position);
                    this.mesh.material.color.set(color || 0xff00ff);
                    this.mesh.material.emissive.set(color || 0xff00ff);
                    this.mesh.material.opacity = 0.8;
                    this.mesh.scale.set(0.2, 0.2, 0.2); // Scale the shared geometry
                    this.life = 1.0;
                    this.velocity = new THREE.Vector3(
                        (Math.random() - 0.5) * 0.5,
                        Math.random() * 0.5,
                        (Math.random() - 0.5) * 0.5
                    );
                    return this;
                },
                update: function(delta) {
                    this.life -= delta * 2;
                    this.mesh.position.add(this.velocity);
                    this.mesh.material.opacity = this.life;
                    return this.life > 0;
                },
                hide: function() {
                    this.mesh.visible = false;
                }
            };
        }, 50);
        
        // Create projectile pool
        this.objectPools.createPool('projectiles', () => {
            const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
            geometry.rotateX(Math.PI / 2);
            const material = new THREE.MeshPhongMaterial({
                color: 0xff00ff,
                emissive: 0xff00ff,
                emissiveIntensity: 1,
                transparent: true,
                opacity: 0.8
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.visible = false;
            this.scene.add(mesh);
            
            return {
                mesh: mesh,
                reset: function(position, direction, speed, damage, source) {
                    this.mesh.visible = true;
                    this.mesh.position.copy(position);
                    this.direction = direction.normalize();
                    this.speed = speed || 0.5;
                    this.damage = damage || 10;
                    this.source = source || 'player';
                    this.alive = true;
                    this.lifespan = 200;
                    
                    // Set color based on source
                    const projectileColor = source === 'player' ? 0xff00ff : 0xff0000;
                    this.mesh.material.color.setHex(projectileColor);
                    this.mesh.material.emissive.setHex(projectileColor);
                    
                    // Set rotation to match direction
                    this.mesh.quaternion.setFromUnitVectors(
                        new THREE.Vector3(0, 0, 1),
                        this.direction
                    );
                    
                    return this;
                },
                update: function(delta) {
                    if (!this.alive) return false;
                    
                    // Update position with speed
                    const movement = this.direction.clone().multiplyScalar(this.speed);
                    this.mesh.position.add(movement);
                    
                    // Reduce lifespan
                    this.lifespan--;
                    if (this.lifespan <= 0) this.alive = false;
                    
                    return this.alive;
                },
                hide: function() {
                    this.mesh.visible = false;
                    this.alive = false;
                }
            };
        }, 30);
    }

    init() {
        try {
            // Initialize renderer
            try {
                // Get the canvas element
                const canvas = document.getElementById('game');
                
                // If canvas not found, create one
                if (!canvas) {
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
                
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                // Disable shadow maps completely as requested
                this.renderer.shadowMap.enabled = false;
                
                // Adjust pixel ratio for performance
                const pixelRatio = window.devicePixelRatio;
                this.renderer.setPixelRatio(Math.min(pixelRatio, 2)); // Cap at 2x for performance
                
                // Improve color rendering with current THREE.js settings
                this.renderer.outputColorSpace = THREE.SRGBColorSpace;
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
                this.renderer.toneMappingExposure = 1.0;
            } catch (rendererError) {
                console.error("Failed to create renderer:", rendererError);
                throw rendererError;
            }
            
            // Add fog for distance culling
            this.scene.fog = new THREE.Fog(0x120023, 1000, 1800);
            
            // Set up camera
            try {
                this.camera.position.set(0, 1600, 3200); // Keep the 2x distance for 2x arena
                this.camera.lookAt(0, 0, 0);
            } catch (cameraError) {
                console.error("Failed to configure camera:", cameraError);
                throw cameraError;
            }
            
            // Add basic lighting
            try {
                // Modern lighting setup for better color rendering
                // Main ambient light provides base illumination
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Increased from 0.7 for better visibility
                this.scene.add(ambientLight);
                
                // Main directional light WITHOUT shadows
                const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Increased from 1.0
                directionalLight.position.set(50, 200, 100);
                directionalLight.castShadow = false; // Explicitly disable shadows
                this.scene.add(directionalLight);
                
                // Add some colored rim lighting for visual interest
                const pinkLight = new THREE.DirectionalLight(0xff00ff, 0.4); // Increased from 0.3
                pinkLight.position.set(-100, 50, -100);
                pinkLight.castShadow = false; // Explicitly disable shadows
                this.scene.add(pinkLight);
                
                // Blue backlight for cyberpunk feel
                const blueLight = new THREE.DirectionalLight(0x0088ff, 0.4); // Increased from 0.3
                blueLight.position.set(100, 20, -100);
                blueLight.castShadow = false; // Explicitly disable shadows
                this.scene.add(blueLight);
            } catch (lightingError) {
                console.error("Failed to add lighting:", lightingError);
                throw lightingError;
            }
            
            // Create arena and truck
            try {
                this.createArena();
            } catch (arenaError) {
                console.error("Failed to create arena:", arenaError);
                throw arenaError;
            }
            
            try {
                this.createSimpleTruck();
            } catch (truckError) {
                console.error("Failed to create truck:", truckError);
                throw truckError;
            }
            
            // Create turrets
            this.createTurrets();
            
            // Create player's weapon
            this.createWeapon();
            
            // Set up controls
            try {
                this.setupControls();
            } catch (controlsError) {
                console.error("Failed to set up controls:", controlsError);
                throw controlsError;
            }
            
            // Initialize HUD
            try {
                this.initHUD();
            } catch (hudError) {
                console.error("Failed to initialize HUD:", hudError);
                throw hudError;
            }
            
            // Remove loading screen
            try {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                }
            } catch (loadingError) {
                console.error("Failed to remove loading screen:", loadingError);
                // Don't throw, this is not critical
            }
            
            // Start animation loop
            this.isInitialized = true;
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
        
        try {
            this.initializeDebugHelpers();
        } catch (debugError) {
            console.error("Failed to initialize debug helpers:", debugError);
        }
    }

    createArena() {
        console.log("Creating arena...");
        
        // Arena is now 2x larger (doubled from 780 to 1560)
        const arenaSize = 1560;
        
        // Create ground with fewer segments for performance
        const groundGeometry = new THREE.PlaneGeometry(arenaSize, arenaSize, 1, 1);
        
        // Use MeshBasicMaterial for floor for better performance and colors
        const groundMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x222222 // Darker floor color, better contrast
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = false; // Disabled shadows
        this.scene.add(ground);
        
        // Create walls - now 50% shorter (height reduced from 100 to 50)
        // Use MeshBasicMaterial for walls with more vibrant color
        const wallMaterial = new THREE.MeshBasicMaterial({
            color: 0x444488 // More interesting blue-grey color
        });
        
        // Arena half size is now 780 (doubled from 390)
        const wallHalfSize = arenaSize / 2;
        const wallHeight = 50; // 50% shorter walls

        // North wall
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(arenaSize, wallHeight, 10, 1, 1, 1),
            wallMaterial
        );
        northWall.position.set(0, wallHeight/2, -wallHalfSize);
        northWall.castShadow = false;
        northWall.receiveShadow = false;
        this.scene.add(northWall);
        
        // South wall
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(arenaSize, wallHeight, 10, 1, 1, 1),
            wallMaterial
        );
        southWall.position.set(0, wallHeight/2, wallHalfSize);
        southWall.castShadow = false;
        southWall.receiveShadow = false;
        this.scene.add(southWall);
        
        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(10, wallHeight, arenaSize, 1, 1, 1),
            wallMaterial
        );
        eastWall.position.set(wallHalfSize, wallHeight/2, 0);
        eastWall.castShadow = false;
        eastWall.receiveShadow = false;
        this.scene.add(eastWall);
        
        // West wall
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(10, wallHeight, arenaSize, 1, 1, 1),
            wallMaterial
        );
        westWall.position.set(-wallHalfSize, wallHeight/2, 0);
        westWall.castShadow = false;
        westWall.receiveShadow = false;
        this.scene.add(westWall);
        
        // Add grid helper with reduced divisions only if in high performance mode and grid enabled
        if (!window.lowPerformanceMode && this.gridEnabled) {
            this.gridHelper = new THREE.GridHelper(arenaSize, 20); // Reduced from 39 to 20 divisions
            this.scene.add(this.gridHelper);
        }
        
        // Simple arena lighting - use hemisphere light instead of point lights
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        this.scene.add(hemisphereLight);
        
        // Store wall references for collision detection
        this.walls = {
            north: northWall,
            south: southWall,
            east: eastWall,
            west: westWall,
            halfSize: wallHalfSize,
            thickness: 10
        };
        console.log("Arena creation complete");
    }

    createSimpleTruck() {
        console.log("Creating simplified truck");
        
        // Double the truck dimensions (2x bigger)
        const truckGeometry = new THREE.BoxGeometry(5, 2.5, 7.5); // 2x the original dimensions
        const truckMaterial = new THREE.MeshPhongMaterial({ // Changed back to MeshPhongMaterial for better lighting
            color: 0xff00ff,
            emissive: 0x330033,
            shininess: 30,
            specular: 0xffffff
        });
        this.truck = new THREE.Mesh(truckGeometry, truckMaterial);
        this.truck.position.set(0, 2, 0); // Adjusted height for 2x size
        this.scene.add(this.truck);
        
        // Add basic properties
        this.truck.velocity = 0;
        this.truck.acceleration = 0;
        
        // Add wheels for better visual feedback
        this.addWheelsToTruck();
    }

    addWheelsToTruck() {
        // Create wheels - 2x bigger
        const wheelGeometry = new THREE.CylinderGeometry(1, 1, 0.8, 16); // Simplified from 32 to 16 segments
        wheelGeometry.rotateX(Math.PI / 2); // Rotate to align with truck
        
        const wheelMaterial = new THREE.MeshPhongMaterial({ // Changed back to MeshPhongMaterial
            color: 0x333333,
            shininess: 30
        });
        
        // Create and position 4 wheels - adjusted for 2x truck size
        this.wheels = [];
        
        // Front left
        const wheelFL = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelFL.position.set(-2.4, -0.6, -2.2);
        this.truck.add(wheelFL);
        this.wheels.push(wheelFL);
        
        // Front right
        const wheelFR = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelFR.position.set(2.2, -0.6, -2);
        this.truck.add(wheelFR);
        this.wheels.push(wheelFR);
        
        // Rear left
        const wheelRL = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelRL.position.set(-2.2, -0.6, 2);
        this.truck.add(wheelRL);
        this.wheels.push(wheelRL);
        
        // Rear right
        const wheelRR = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelRR.position.set(2.2, -0.6, 2);
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
            
            // Add shortcut for debug mode toggle (F9)
            if (e.key === 'F9') {
                this.toggleDebugMode();
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

        // Set up mobile touch controls
        this.createMobileControls();
        this.setupTouchListeners();
    }

    createMobileControls() {
        // Check if controls already exist
        if (document.getElementById('mobile-controls')) return;
        
        // Create mobile controls container
        const mobileControls = document.createElement('div');
        mobileControls.id = 'mobile-controls';
        
        // Create directional pad
        const dPad = document.createElement('div');
        dPad.id = 'direction-pad';
        dPad.innerHTML = `
            <div id="pad-up" class="control-button"><i class="fas fa-chevron-up"></i></div>
            <div id="pad-left" class="control-button"><i class="fas fa-chevron-left"></i></div>
            <div id="pad-right" class="control-button"><i class="fas fa-chevron-right"></i></div>
            <div id="pad-down" class="control-button"><i class="fas fa-chevron-down"></i></div>
        `;
        
        // Create action buttons (fire, weapon switch)
        const actionButtons = document.createElement('div');
        actionButtons.id = 'action-buttons';
        actionButtons.innerHTML = `
            <div id="fire-button" class="action-button"><i class="fas fa-crosshairs"></i></div>
            <div id="weapon-button" class="action-button"><i class="fas fa-sync-alt"></i></div>
        `;
        
        // Add controls to the page
        mobileControls.appendChild(dPad);
        mobileControls.appendChild(actionButtons);
        document.body.appendChild(mobileControls);
        
        // Hide desktop-only UI elements on mobile
        this.updateMobileUI();
    }
    
    updateMobileUI() {
        // Check if we're on a mobile device
        const isMobile = window.innerWidth <= 768;
        
        // Get elements to hide on mobile
        const mobileControls = document.getElementById('mobile-controls');
        const weaponLegend = document.getElementById('weapon-legend');
        const debugPanel = document.getElementById('debug-panel');
        
        // Show/hide mobile controls based on screen size
        if (mobileControls) {
            mobileControls.style.display = isMobile ? 'block' : 'none';
        }
        
        // Hide non-essential UI on mobile
        if (weaponLegend) {
            weaponLegend.style.display = isMobile ? 'none' : 'block';
        }
        
        if (debugPanel) {
            debugPanel.style.display = isMobile ? 'none' : null;
        }
    }
    
    setupTouchListeners() {
        // Track touch state
        let touchControls = {
            up: false,
            down: false,
            left: false,
            right: false,
            fire: false
        };
        
        // Touch throttling to improve performance
        this.lastTouchTime = 0;
        this.touchThrottleMs = 16; // ~60fps
        
        // Helper to update keys based on touch controls
        const updateKeysFromTouch = () => {
            // Throttle touch events for better performance
            const now = performance.now();
            if (now - this.lastTouchTime < this.touchThrottleMs) {
                return;
            }
            this.lastTouchTime = now;
            
            this.keys['w'] = touchControls.up;
            this.keys['s'] = touchControls.down;
            this.keys['a'] = touchControls.left;
            this.keys['d'] = touchControls.right;
            this.keys[' '] = touchControls.fire; // Space for firing
        };
        
        // Add touch event listeners for movement
        const padUp = document.getElementById('pad-up');
        const padDown = document.getElementById('pad-down');
        const padLeft = document.getElementById('pad-left');
        const padRight = document.getElementById('pad-right');
        
        // Add touch event listeners for actions
        const fireButton = document.getElementById('fire-button');
        const weaponButton = document.getElementById('weapon-button');
        
        // Use passive event listeners where possible for better performance
        const touchOptions = { passive: false };
        
        // Movement controls
        if (padUp) {
            padUp.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.up = true;
                padUp.classList.add('active');
                updateKeysFromTouch();
            }, touchOptions);
            
            padUp.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.up = false;
                padUp.classList.remove('active');
                updateKeysFromTouch();
            }, touchOptions);
        }
        
        if (padDown) {
            padDown.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.down = true;
                padDown.classList.add('active');
                updateKeysFromTouch();
            }, touchOptions);
            
            padDown.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.down = false;
                padDown.classList.remove('active');
                updateKeysFromTouch();
            }, touchOptions);
        }
        
        if (padLeft) {
            padLeft.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.left = true;
                padLeft.classList.add('active');
                updateKeysFromTouch();
            }, touchOptions);
            
            padLeft.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.left = false;
                padLeft.classList.remove('active');
                updateKeysFromTouch();
            }, touchOptions);
        }
        
        if (padRight) {
            padRight.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.right = true;
                padRight.classList.add('active');
                updateKeysFromTouch();
            }, touchOptions);
            
            padRight.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.right = false;
                padRight.classList.remove('active');
                updateKeysFromTouch();
            }, touchOptions);
        }
        
        // Fire button
        if (fireButton) {
            fireButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.fire = true;
                fireButton.classList.add('active');
                updateKeysFromTouch();
            }, touchOptions);
            
            fireButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.fire = false;
                fireButton.classList.remove('active');
                updateKeysFromTouch();
            }, touchOptions);
        }
        
        // Weapon switch button
        if (weaponButton) {
            weaponButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                weaponButton.classList.add('active');
                
                // Simulate pressing the 'q' key for weapon switching
                if (this.weaponManager) {
                    this.weaponManager.cycleWeapon();
                } else if (this.truck && this.truck.cycleWeapon) {
                    this.truck.cycleWeapon();
                }
            }, touchOptions);
            
            weaponButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                weaponButton.classList.remove('active');
            }, touchOptions);
        }
        
        // Update mobile UI when window resizes
        window.addEventListener('resize', () => {
            this.updateMobileUI();
        }, { passive: true });
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
        
        // Calculate delta time for stable physics updates
        const now = performance.now();
        let deltaTime = 0;
        if (this.lastUpdateTime) {
            deltaTime = (now - this.lastUpdateTime) / 1000; // Convert ms to seconds
            // Limit max delta to avoid large jumps on performance hiccups
            if (deltaTime > 0.1) deltaTime = 0.1;
        }
        this.lastUpdateTime = now;
        
        // FPS calculation
        this.frameCount++;
        
        // Calculate FPS but don't display (counter removed as requested)
        if (now - this.lastFpsUpdate > this.fpsUpdateInterval) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            this.lastFpsUpdate = now;
            this.frameCount = 0;
            
            // If FPS is low, reduce effects further
            if (this.fps < 30) {
                this.maxParticles = Math.max(10, this.maxParticles - 5);
                console.log("Reducing effects due to low FPS:", this.maxParticles);
                
                // Severe performance issues - disable additional features
                if (this.fps < 20) {
                    if (this.shadowsEnabled) {
                        console.log("Low FPS - disabling shadows");
                        this.shadowsEnabled = false;
                        this.updateRendererSettings();
                    }
                    if (window.multiplayerEnabled) {
                        console.log("Low FPS - disabling multiplayer");
                        window.multiplayerEnabled = false;
                        localStorage.setItem('monsterTruckMultiplayer', false);
                        this.showNotification("Multiplayer disabled due to low performance");
                        const toggleBtn = document.getElementById('multiplayer-toggle');
                        if (toggleBtn) {
                            toggleBtn.textContent = '🌐 Multiplayer: OFF (auto)';
                            toggleBtn.style.border = '1px solid #ff0000';
                        }
                    }
                }
            }
        }
        
        // Update game state with delta time
        this.update(deltaTime);
        
        // Update pooled objects (particles and projectiles)
        this.updatePooledObjects(deltaTime);
        
        // Update multiplayer player positions every frame for smoother movement
        if (this.multiplayer && window.multiplayerEnabled) {
            this.multiplayer.interpolateRemotePlayers();
        }
        
        // Render the scene
        if (this.renderer && this.scene && this.camera) {
            // Apply frustum culling for better performance
            // Only render objects in view
            const frustum = new THREE.Frustum();
            const projScreenMatrix = new THREE.Matrix4();
            projScreenMatrix.multiplyMatrices(
                this.camera.projectionMatrix, 
                this.camera.matrixWorldInverse
            );
            frustum.setFromProjectionMatrix(projScreenMatrix);
            
            // Render only if active
            this.renderer.render(this.scene, this.camera);
        }
        
        // Update debug info if enabled
        if (this.debugMode && this.debugPanel) {
            this.updateDebugInfo();
        }
    }

    updateRendererSettings() {
        if (!this.renderer) return;
        
        // Apply shadow settings
        this.renderer.shadowMap.enabled = this.shadowsEnabled;
        if (this.shadowsEnabled) {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
    }

    update(deltaTime = 1/60) {
        // Skip update if game over
        if (this.isGameOver) return;
        
        // Basic update for truck movement
        if (!this.truck) return;
        
        // Throttle updates for better performance
        const updateAll = this.frameCount % 2 === 0; // Update non-essential items at half rate
        
        // Process keyboard input for more realistic driving
        const acceleration = 0.008; // Balanced between original 0.01 and slower 0.006
        const deceleration = 0.98; // Friction
        const maxSpeed = 0.5;
        const turnSpeed = 0.027; // Changed from 0.03 to 0.027
        
        // Initialize steering angle if not present
        if (this.truck.steeringAngle === undefined) {
            this.truck.steeringAngle = 0;
        }
        
        // Maximum steering angle in radians (about 30 degrees)
        const maxSteeringAngle = 0.5;
        // How quickly steering centers when not turning
        const steeringReturnSpeed = 0.05;
        // How quickly steering responds to input
        const steeringResponseSpeed = 0.09;
        
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
        
        // Update steering angle based on input
        if (this.keys['ArrowLeft']) {
            // Gradually increase steering angle
            this.truck.steeringAngle = Math.max(
                -maxSteeringAngle,
                this.truck.steeringAngle - steeringResponseSpeed
            );
        } else if (this.keys['ArrowRight']) {
            // Gradually increase steering angle
            this.truck.steeringAngle = Math.min(
                maxSteeringAngle,
                this.truck.steeringAngle + steeringResponseSpeed
            );
        } else {
            // Gradually return steering to center
            if (Math.abs(this.truck.steeringAngle) < steeringReturnSpeed) {
                this.truck.steeringAngle = 0;
            } else if (this.truck.steeringAngle > 0) {
                this.truck.steeringAngle -= steeringReturnSpeed;
            } else {
                this.truck.steeringAngle += steeringReturnSpeed;
            }
        }
        
        // Apply steering - turning effect is proportional to velocity
        // Note: When in reverse, we need to invert the steering effect
        if (Math.abs(this.truck.velocity) > 0.01) {
            // Rotation amount is influenced by:
            // 1. Steering angle (with direction inverted when in reverse)
            // 2. Velocity (faster = more turning)
            // 3. TurnFactor (slower = more responsive steering)
            const turnFactor = 1 - (Math.abs(this.truck.velocity) / maxSpeed) * 0.5;
            
            // Get direction of travel (positive = forward, negative = reverse)
            const directionMultiplier = (this.truck.velocity > 0) ? 1 : -1;
            
            // Apply steering angle with proper direction adjustment
            this.truck.rotation.y -= this.truck.steeringAngle * Math.abs(this.truck.velocity) * 
                                    turnFactor * 0.5 * directionMultiplier;
        }
        
        // Visualize wheel steering
        if (this.truck.steeringAngle !== 0) {
            // The steering angle direction is already correct, so we pass it directly
            this.animateWheelTurn(-this.truck.steeringAngle / maxSteeringAngle);
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
            const truckSize = 5; // Doubled from 2.5 for 2x truck size
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
        
        // Check collisions with turrets
        for (const turret of this.turrets) {
            // Skip destroyed turrets
            if (!turret || !turret.alive || !turret.base) continue;
            
            // Calculate distance between truck and turret
            const distance = this.truck.position.distanceTo(turret.base.position);
            
            // Collision distance (sum of truck radius and turret radius)
            // Original was 2.75 + 10, now we have 2x truck (5.5) and 1.5x turret (15)
            const collisionDistance = 5.5 + 15; // 2x truck size + 1.5x turret base radius
            
            if (distance < collisionDistance) {
                // Similar to wall collision, calculate bounce direction
                const bounceDirection = new THREE.Vector3()
                    .subVectors(this.truck.position, turret.base.position)
                    .normalize();
                
                // Push truck away from turret (same bounce effect as walls)
                this.truck.position.x = turret.base.position.x + bounceDirection.x * collisionDistance;
                this.truck.position.z = turret.base.position.z + bounceDirection.z * collisionDistance;
                
                // Apply bounce to velocity (same as wall bounce)
                this.truck.velocity *= -0.7;
                
                // Apply damage (reuse the same method used for wall collisions)
                this.applyCollisionDamage();
                
                // Show collision effect (reuse the same effect used for wall collisions)
                this.showCollisionEffect(this.truck.position);
            }
        }
        
        // Update camera to follow truck with smooth transition
        if (this.camera) {
            // Position camera behind truck based on truck's direction
            const cameraDistance = 19.5; // Increased from 15 (30% larger)
            const cameraHeight = 10.4; // Increased from 8 (30% larger)
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
            const projectiles = this.weapon.shoot(weaponPosition, truckDirection, 'player');
            
            // Play weapon fire sound if projectiles were created (successful shot)
            if (projectiles && window.audioManager) {
                console.log("Game: Playing weapon_fire sound");
                window.audioManager.playSound('weapon_fire');
            }
            
            // Notify multiplayer system of new projectiles for network sync
            if (this.multiplayer && window.multiplayerEnabled && projectiles && projectiles.length > 0) {
                projectiles.forEach(projectile => {
                    this.multiplayer.sendProjectileCreated(projectile);
                });
            }
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
        
        // Only update turrets when needed (based on distance and visibility)
        if (updateAll) {
            // Update turrets
            this.updateTurrets();
        }
        
        // Only update powerups when needed
        if (updateAll) {
            // Update powerups with throttled frequency
            this.updatePowerups();
            
            // Check for powerup spawning
            this.powerupSpawnTimer++;
            if (this.powerupSpawnTimer >= this.powerupSpawnInterval) {
                this.spawnRandomPowerup();
                this.powerupSpawnTimer = 0;
            }
        }
        
        // Core updates that run every frame
        
        // Check for projectile hits - critical gameplay element
        this.checkProjectileHits();
        
        // Check for player projectile hits on turrets
        this.checkPlayerProjectileHits();
        
        // Check for powerup collection
        this.checkPowerupCollection();
        
        // Update multiplayer if enabled
        if (this.multiplayer && window.multiplayerEnabled) {
            this.multiplayer.update({
                position: {
                    x: this.truck.position.x,
                    y: this.truck.position.y,
                    z: this.truck.position.z
                },
                rotation: {
                    y: this.truck.rotation.y
                },
                velocity: this.truck.velocity,
                health: this.health,
                maxHealth: this.maxHealth
            });
        }
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
        // Create particles for collision - simplified
        this.createSimpleEffect(position, 0xffffff, 8);
        
        // Shake camera for effect - reduced intensity
        this.shakeCamera(0.3);
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
        const arenaSize = 1200; // 2x the original game area size
        const minDistanceFromCenter = 240; // Adjusted for larger arena
        const numTurrets = 4; // Keep the same number of turrets
        
        // Define turret types
        const turretTypes = [
            {
                name: "Standard",
                color: 0x666666,
                activeColor: 0xff0000,
                warningColor: 0xffff00,
                health: 5,
                damage: 10,
                fireRate: 180,
                projectileSpeed: 4.5, // Adjusted for larger arena
                rotationSpeed: 0.015,
                scale: 15 // 1.5x bigger (original was 10)
            },
            {
                name: "Heavy",
                color: 0x444444,
                activeColor: 0xbb0000,
                warningColor: 0xbbbb00,
                health: 8,
                damage: 20,
                fireRate: 240,
                projectileSpeed: 3.75, // Adjusted for larger arena
                rotationSpeed: 0.008,
                scale: 15 // 1.5x bigger (original was 10)
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
            
            // Create turret with type - modified Turret class gets created below
            const turret = new Turret(position, this.scene, turretType);
            
            // Use shorter activation delay (120-240 frames instead of 240-600)
            turret.activationDelay = Math.floor(Math.random() * 120) + 120;
            
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
                
                // If projectile hits player - 2x larger collision radius for 2x truck
                if (distance < 4.4) { // Doubled from 2.2 for 2x truck
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
                    this.flashScreen('rgba(255, 0, 0, 0.3)');
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
                
                // Skip dead turrets or turrets without a base
                if (!turret || !turret.alive || !turret.base) continue;
                
                // Get distance to turret
                const distance = projectile.mesh.position.distanceTo(turret.base.position);
                
                // If hit - 1.5x larger hit radius to match 1.5x larger turrets
                if (distance < 22.5) { // 15 * 1.5 = 22.5
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

    // Powerup methods
    spawnRandomPowerup() {
        // Limit maximum number of powerups for performance
        if (this.powerups.length >= 3) {
            return; // Skip spawning if we already have enough powerups
        }
        
        // Define arena boundaries
        const arenaSize = 600; // 300 units from center in each direction
        
        // Generate random position within arena bounds, avoiding center area
        let x, z;
        do {
            x = (Math.random() * 2 - 1) * (arenaSize / 2);
            z = (Math.random() * 2 - 1) * (arenaSize / 2);
        } while (Math.sqrt(x*x + z*z) < 50); // Avoid center 50 unit radius
        
        const position = new THREE.Vector3(x, 0, z);
        
        // Define powerup types
        const powerupTypes = ['SPEED_BOOST', 'REPAIR', 'SHIELD', 'AMMO'];
        
        // Select random type
        const type = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
        
        // Create the powerup
        const powerup = new PowerUp(this.scene, position, type);
        
        // Add to powerups array
        this.powerups.push(powerup);
        
        console.log(`Spawned ${type} powerup at position (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
    
    updatePowerups() {
        // Performance optimization: Only run full updates at 15fps (every 4th frame)
        this._powerupUpdateCounter = (this._powerupUpdateCounter || 0) + 1;
        const isFullUpdate = this._powerupUpdateCounter % 4 === 0;
        
        // Update only if needed
        if (!isFullUpdate && this.powerups.length === 0) {
            return; // Skip update if no powerups and not a full update frame
        }
        
        // Update and remove expired powerups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const powerup = this.powerups[i];
            
            // Update powerup and check if it should be removed
            if (powerup.update(isFullUpdate)) {
                // Time to remove this powerup
                powerup.removeFromScene();
                this.powerups.splice(i, 1);
            }
        }
    }
    
    checkPowerupCollection() {
        if (!this.truck) return;
        
        // Define collection radius - doubled for 2x truck size
        const collectionRadius = 6; // Doubled from 3
        
        // Check each powerup
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const powerup = this.powerups[i];
            
            // Calculate distance to truck
            const distance = powerup.mesh.position.distanceTo(this.truck.position);
            
            // If close enough, collect the powerup
            if (distance < collectionRadius) {
                // Apply powerup effect
                this.applyPowerupEffect(powerup.type);
                
                // Create pickup effect
                powerup.createPickupEffect();
                
                // Play pickup sound
                if (window.audioManager) {
                    console.log("Game: Playing powerup_pickup sound");
                    window.audioManager.playSound('powerup_pickup');
                }
                
                // Remove powerup
                powerup.removeFromScene();
                this.powerups.splice(i, 1);
                
                // Show notification
                this.showNotification(`${powerup.type} collected!`);
            }
        }
    }
    
    applyPowerupEffect(type) {
        switch(type) {
            case 'SPEED_BOOST':
                // Double truck speed for 5 seconds
                const originalMaxSpeed = this.truck.maxSpeed;
                this.truck.maxSpeed *= 2;
                
                // Add visual effect to truck
                const speedEffect = new THREE.PointLight(0x00ff99, 1.2, 8);
                this.truck.add(speedEffect);
                
                // Add trail effect
                const trailInterval = setInterval(() => {
                    if (Math.abs(this.truck.velocity) > 0.1) {
                        this.createSpeedTrail(this.truck.position.clone());
                    }
                }, 100);
                
                // Reset after 5 seconds
                setTimeout(() => {
                    this.truck.maxSpeed = originalMaxSpeed;
                    this.truck.remove(speedEffect);
                    clearInterval(trailInterval);
                }, 5000);
                
                break;
                
            case 'REPAIR':
                // Restore 50 health
                const healAmount = 50;
                this.health = Math.min(this.maxHealth, this.health + healAmount);
                
                // Create healing particles
                for (let i = 0; i < 20; i++) {
                    this.createHealingParticle(this.truck.position.clone());
                }
                
                // Update health display
                const healthDiv = document.getElementById('health');
                if (healthDiv) {
                    healthDiv.textContent = `Health: ${this.health}`;
                    
                    // Add visual feedback with green flash
                    healthDiv.style.color = 'green';
                    setTimeout(() => {
                        healthDiv.style.color = 'white';
                    }, 300);
                }
                
                // Add green flash to screen
                this.flashScreen('rgba(0, 255, 0, 0.3)');
                
                break;
                
            case 'SHIELD':
                // Add shield visual effect with more impressive geometry
                const shieldGeometry = new THREE.SphereGeometry(4, 32, 32);
                const shieldMaterial = new THREE.MeshPhongMaterial({
                    color: 0xffcc00,
                    emissive: 0xffcc00,
                    emissiveIntensity: 0.5,
                    transparent: true,
                    opacity: 0.4,
                    side: THREE.DoubleSide
                });
                const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
                this.truck.add(shield);
                
                // Add shield impact effect
                const impactGeometry = new THREE.RingGeometry(3.8, 4.2, 32);
                const impactMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffff00,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                const impact = new THREE.Mesh(impactGeometry, impactMaterial);
                impact.rotation.x = Math.PI / 2;
                this.truck.add(impact);
                
                // Animate shield
                const shieldLight = new THREE.PointLight(0xffcc00, 1, 8);
                this.truck.add(shieldLight);
                
                // Make truck invulnerable for 10 seconds (increased from 3)
                const originalTakeDamage = this.truck.takeDamage;
                this.truck.takeDamage = () => 0; // No damage function
                
                // Animate shield 
                let shieldPulse = 0;
                const shieldInterval = setInterval(() => {
                    shieldPulse += 0.1;
                    shield.scale.setScalar(1 + Math.sin(shieldPulse) * 0.1);
                    shield.material.opacity = 0.3 + Math.sin(shieldPulse) * 0.2;
                    
                    // Rotate impact ring
                    impact.rotation.z += 0.05;
                }, 50);
                
                // Reset after 10 seconds
                setTimeout(() => {
                    clearInterval(shieldInterval);
                    this.truck.remove(shield);
                    this.truck.remove(impact);
                    this.truck.remove(shieldLight);
                    this.truck.takeDamage = originalTakeDamage;
                }, 10000);
                
                break;
                
            case 'AMMO':
                // Refill ammo with visual effect
                if (this.weapon) {
                    this.weapon.ammo = this.weapon.maxAmmo;
                    
                    // Create ammo reload particles
                    for (let i = 0; i < 30; i++) {
                        this.createAmmoParticle(this.truck.position.clone());
                    }
                    
                    // Update ammo display
                    if (this.ammoDisplay) {
                        this.ammoDisplay.textContent = `Ammo: ${this.weapon.ammo}/${this.weapon.maxAmmo}`;
                        
                        // Add visual feedback
                        this.ammoDisplay.style.color = '#00ffff';
                        setTimeout(() => {
                            this.ammoDisplay.style.color = 'white';
                        }, 300);
                    }
                }
                break;
        }
        
        // Play powerup activation sound
        if (window.audioManager) {
            window.audioManager.playSound('powerup_activate');
        }
    }
    
    // Helper methods for powerup effects
    createSpeedTrail(position) {
        const trailGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff99,
            transparent: true,
            opacity: 0.7
        });
        
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.copy(position);
        trail.position.y += 0.5;
        this.scene.add(trail);
        
        // Add light for glow effect
        const light = new THREE.PointLight(0x00ff99, 0.5, 3);
        light.position.copy(trail.position);
        this.scene.add(light);
        
        // Animate and remove
        let life = 1.0;
        const fadeSpeed = 0.05;
        
        const animateTrail = () => {
            if (life <= 0) {
                this.scene.remove(trail);
                this.scene.remove(light);
                return;
            }
            
            life -= fadeSpeed;
            trail.material.opacity = life * 0.7;
            light.intensity = life * 0.5;
            
            requestAnimationFrame(animateTrail);
        };
        
        animateTrail();
    }
    
    createHealingParticle(position) {
        const size = 0.3 + Math.random() * 0.3;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff33,
            transparent: true,
            opacity: 0.8
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        // Position around truck
        particle.position.copy(position);
        particle.position.x += (Math.random() - 0.5) * 4;
        particle.position.y += Math.random() * 3;
        particle.position.z += (Math.random() - 0.5) * 4;
        
        this.scene.add(particle);
        
        // Add movement
        const speed = 0.05 + Math.random() * 0.05;
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * speed,
            Math.random() * speed * 2, // Mostly upward
            (Math.random() - 0.5) * speed
        );
        
        // Animate and remove
        let life = 1.0;
        const fadeSpeed = 0.02;
        
        const animateParticle = () => {
            if (life <= 0) {
                this.scene.remove(particle);
                return;
            }
            
            life -= fadeSpeed;
            particle.position.add(direction);
            particle.rotation.x += 0.02;
            particle.rotation.y += 0.02;
            particle.material.opacity = life * 0.8;
            
            requestAnimationFrame(animateParticle);
        };
        
        animateParticle();
    }
    
    createAmmoParticle(position) {
        // Create metallic "bullet" particles
        const size = 0.1 + Math.random() * 0.1;
        const geometry = new THREE.CylinderGeometry(size/3, size/3, size, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.8,
            roughness: 0.2,
            transparent: true,
            opacity: 0.9
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        // Position in a spiral around truck
        const angle = Math.random() * Math.PI * 2;
        const radius = 3 + Math.random() * 2;
        particle.position.set(
            position.x + Math.cos(angle) * radius,
            position.y + 1 + Math.random() * 2,
            position.z + Math.sin(angle) * radius
        );
        
        // Rotate to look like a bullet
        particle.rotation.x = Math.PI / 2;
        
        this.scene.add(particle);
        
        // Add movement - spiral inward to the truck
        const speed = 0.02 + Math.random() * 0.03;
        let currentRadius = radius;
        let currentAngle = angle;
        
        // Animate and remove
        let life = 1.0;
        const fadeSpeed = 0.02;
        
        const animateParticle = () => {
            if (life <= 0 || currentRadius < 0.2) {
                this.scene.remove(particle);
                return;
            }
            
            life -= fadeSpeed;
            
            // Spiral inward
            currentRadius -= speed;
            currentAngle += speed * 3;
            
            particle.position.x = position.x + Math.cos(currentAngle) * currentRadius;
            particle.position.z = position.z + Math.sin(currentAngle) * currentRadius;
            
            // Rotate for effect
            particle.rotation.z += 0.1;
            
            requestAnimationFrame(animateParticle);
        };
        
        animateParticle();
    }

    // Simplified particle creation - used by various effects
    createSimpleParticle(position, color, size = 0.2, lifetime = 1.0) {
        if (!this.effectsEnabled) return null; // Skip if effects disabled
        
        // Use object pool instead of creating new particles
        const particle = this.objectPools.get('particles');
        if (particle) {
            particle.reset(position, color || 0xff00ff);
            // Scale the shared geometry instead of creating new ones
            particle.mesh.scale.set(size, size, size);
            particle.life = lifetime;
            return particle;
        }
        return null;
    }

    // Replace complex effect methods with this simplified version
    createSimpleEffect(position, color, count = 10) {
        if (!this.effectsEnabled) return; // Skip if effects disabled
        
        // Limit particle count based on performance settings
        count = Math.min(count, this.maxParticles);
        
        // Create limited number of particles
        for (let i = 0; i < count; i++) {
            this.createSimpleParticle(position, color);
        }
    }

    // Add back the updatePooledObjects method
    updatePooledObjects(deltaTime) {
        // Update all active particles
        const particlePool = this.objectPools.pools.get('particles');
        if (particlePool) {
            for (let i = particlePool.active.length - 1; i >= 0; i--) {
                const particle = particlePool.active[i];
                
                // Apply physics once per frame in a centralized location
                if (particle.mesh && particle.velocity) {
                    particle.mesh.position.x += particle.velocity.x;
                    particle.mesh.position.y += particle.velocity.y;
                    particle.mesh.position.z += particle.velocity.z;
                    
                    // Apply gravity
                    particle.velocity.y -= 0.01;
                    
                    // Update opacity/lifetime
                    if (particle.life !== undefined) {
                        particle.life -= deltaTime * 0.5;
                        particle.mesh.material.opacity = Math.max(0, particle.life);
                    }
                }
                
                // Check if particle should be removed
                const active = particle.life > 0;
                if (!active) {
                    particle.hide();
                    this.objectPools.release('particles', particle);
                }
            }
        }
        
        // Update all active projectiles
        const projectilePool = this.objectPools.pools.get('projectiles');
        if (projectilePool) {
            for (let i = projectilePool.active.length - 1; i >= 0; i--) {
                const projectile = projectilePool.active[i];
                const active = projectile.update(deltaTime);
                
                if (!active) {
                    // Return to pool when done
                    projectile.hide();
                    this.objectPools.release('projectiles', projectile);
                } else {
                    // Check for projectile collisions
                    this.checkProjectileCollisions(projectile);
                }
            }
        }
    }

    // Method to apply damage to the player
    applyDamage(damage) {
        // Reduce health by damage amount
        this.health = Math.max(0, this.health - damage);
        
        // Update health display
        const healthDiv = document.getElementById('health');
        if (healthDiv) {
            healthDiv.textContent = `HEALTH: ${this.health}%`;
        }
        
        // Update health bar if using window.updateStatBars function
        if (window.updateStatBars) {
            window.updateStatBars(this.health, this.weapon?.ammo, this.weapon?.maxAmmo);
        }
        
        // Flash screen red for visual feedback
        this.flashScreen('rgba(255, 0, 0, 0.3)');
        
        // Shake camera for impact effect
        this.shakeCamera(damage * 0.05);
        
        // Check if player died
        if (this.health <= 0) {
            this.gameOver();
        }
    }

    checkProjectileCollisions(projectile) {
        // Skip if projectile is no longer active
        if (!projectile.alive) return;
        
        // Check collision with truck if projectile is from enemy
        if (projectile.source !== 'player' && this.truck) {
            const distance = projectile.mesh.position.distanceTo(this.truck.position);
            if (distance < 2.5) {  // Hit if within truck radius
                // Apply damage to player
                this.applyDamage(projectile.damage);
                
                // Disable projectile
                projectile.alive = false;
                projectile.hide();
                
                // Create impact effect at hit position
                this.createProjectileImpact(projectile.mesh.position.clone());
                
                return;
            }
        }
        
        // Check for hits on other players in multiplayer mode
        if (this.multiplayer && window.multiplayerEnabled && projectile.source === 'player') {
            // Pass the projectile to multiplayer component to check hits on remote players
            const hitDetected = this.multiplayer.checkProjectileHits(projectile);
            
            // If a hit was detected, disable the projectile
            if (hitDetected) {
                projectile.alive = false;
                projectile.hide();
                return;
            }
        }
        
        // Other collision checks (walls, obstacles, etc.)
        // These already exist in your code elsewhere
    }

    createProjectileImpact(position) {
        // Get particles from pool
        const particles = [];
        const particleCount = this.isMobile ? 5 : 15;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = this.objectPools.get('particles');
            if (particle) {
                particle.reset(position, 0xff5500);
                particles.push(particle);
            }
        }
    }

    initializeDebugHelpers() {
        // Only create debug visuals when debug mode is on
        if (this.debugMode) {
            // Add debug stats panel
            const statsPanel = document.createElement('div');
            statsPanel.id = 'debug-panel';
            statsPanel.style.position = 'fixed';
            statsPanel.style.top = '70px';
            statsPanel.style.right = '10px';
            statsPanel.style.backgroundColor = 'rgba(0,0,0,0.7)';
            statsPanel.style.color = '#00ff00';
            statsPanel.style.padding = '8px';
            statsPanel.style.fontFamily = 'monospace';
            statsPanel.style.fontSize = '11px';
            statsPanel.style.zIndex = '1000';
            statsPanel.innerHTML = `
                <div id="debug-memory">Memory: 0 MB</div>
                <div id="debug-particles">Particles: 0</div>
                <div id="debug-drawcalls">Draw calls: 0</div>
            `;
            document.body.appendChild(statsPanel);
            this.debugPanel = statsPanel;
            
            // Create grid helper with fine divisions if debug is on
            if (this.gridEnabled) {
                this.gridHelper = new THREE.GridHelper(1560, 20);
                this.scene.add(this.gridHelper);
            }
            
            // Enable verbose console output
            this.enableDebugLogs();
        } else {
            // Limit console.log if not in debug mode
            if (!this._originalConsoleLog) {
                this._originalConsoleLog = console.log;
                console.log = function() {
                    // Only log errors and warnings
                    if (arguments[0] && typeof arguments[0] === 'string' && 
                        (arguments[0].includes('ERROR') || 
                         arguments[0].includes('Warning') || 
                         arguments[0].includes('CRITICAL'))) {
                        this._originalConsoleLog.apply(console, arguments);
                    }
                }.bind(this);
            }
            
            // Only create minimal grid helper in non-debug mode
            if (this.gridEnabled && !window.lowPerformanceMode) {
                this.gridHelper = new THREE.GridHelper(1560, 10); // Fewer divisions in normal mode
                this.scene.add(this.gridHelper);
            }
        }
    }

    enableDebugLogs() {
        if (this._originalConsoleLog) {
            console.log = this._originalConsoleLog;
        }
    }

    updateDebugInfo() {
        if (!this.debugPanel) return;
        
        // Update memory usage
        const memoryElem = document.getElementById('debug-memory');
        if (memoryElem && window.performance && window.performance.memory) {
            const memoryUsed = Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024));
            const memoryTotal = Math.round(window.performance.memory.totalJSHeapSize / (1024 * 1024));
            memoryElem.textContent = `Memory: ${memoryUsed}/${memoryTotal} MB`;
        }
        
        // Update particle count
        const particleElem = document.getElementById('debug-particles');
        if (particleElem && this.objectPools && this.objectPools.pools) {
            const particlePool = this.objectPools.pools.get('particles');
            const particleCount = particlePool ? particlePool.active.length : 0;
            particleElem.textContent = `Particles: ${particleCount}/${this.maxParticles}`;
        }
        
        // Update draw calls info
        const drawCallsElem = document.getElementById('debug-drawcalls');
        if (drawCallsElem && this.renderer) {
            drawCallsElem.textContent = `Draw calls: ${this.renderer.info.render.calls}`;
        }
    }

    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        
        // Update UI based on debug state
        if (this.debugMode) {
            this.enableDebugLogs();
            
            // Create debug panel if not exists
            if (!this.debugPanel) {
                const statsPanel = document.createElement('div');
                statsPanel.id = 'debug-panel';
                statsPanel.style.position = 'fixed';
                statsPanel.style.top = '70px';
                statsPanel.style.right = '10px';
                statsPanel.style.backgroundColor = 'rgba(0,0,0,0.7)';
                statsPanel.style.color = '#00ff00';
                statsPanel.style.padding = '8px';
                statsPanel.style.fontFamily = 'monospace';
                statsPanel.style.fontSize = '11px';
                statsPanel.style.zIndex = '1000';
                statsPanel.innerHTML = `
                    <div id="debug-memory">Memory: 0 MB</div>
                    <div id="debug-particles">Particles: 0</div>
                    <div id="debug-drawcalls">Draw calls: 0</div>
                `;
                document.body.appendChild(statsPanel);
                this.debugPanel = statsPanel;
            } else {
                this.debugPanel.style.display = 'block';
            }
            
            // Create/show grid if not exists
            if (!this.gridHelper && this.gridEnabled) {
                this.gridHelper = new THREE.GridHelper(1560, 20);
                this.scene.add(this.gridHelper);
            } else if (this.gridHelper) {
                this.gridHelper.visible = true;
            }
            
            this.showNotification('Debug mode enabled');
        } else {
            // Hide debug UI
            if (this.debugPanel) {
                this.debugPanel.style.display = 'none';
            }
            
            // Hide grid
            if (this.gridHelper) {
                this.gridHelper.visible = false;
            }
            
            // Restore console behavior
            if (this._originalConsoleLog) {
                console.log = this._originalConsoleLog;
            }
            
            this.showNotification('Debug mode disabled');
        }
    }
}

// Implement a preloader
class AssetPreloader {
    constructor(onComplete) {
        this.assetsToLoad = 0;
        this.assetsLoaded = 0;
        this.onComplete = onComplete;
    }
    
    loadAudio(path) {
        this.assetsToLoad++;
        const audio = new Audio();
        audio.addEventListener('canplaythrough', () => this.assetLoaded());
        audio.addEventListener('error', () => this.assetLoaded());
        audio.src = path;
        return audio;
    }
    
    loadImage(path) {
        this.assetsToLoad++;
        const img = new Image();
        img.onload = () => this.assetLoaded();
        img.onerror = () => this.assetLoaded();
        img.src = path;
        return img;
    }
    
    assetLoaded() {
        this.assetsLoaded++;
        if (this.assetsLoaded >= this.assetsToLoad) {
            this.onComplete();
        }
    }
}

// Initialize game when window is fully loaded
window.addEventListener('load', () => {
    console.log("Window loaded, initializing preloader");
    const loadingElement = document.getElementById('loadingScreen');
    
    // Disable multiplayer by default - this is critical for performance
    window.multiplayerEnabled = localStorage.getItem('monsterTruckMultiplayer') === 'false' ? false : true;
    console.log("Multiplayer enabled by default for better gameplay experience");
    
    const preloader = new AssetPreloader(() => {
        if (loadingElement) loadingElement.style.display = 'none';
        console.log("Assets preloaded, creating game");
        window.game = new Game();
    });
    
    // Preload key assets
    // Audio files - only load essential sounds
    preloader.loadAudio('sounds/engine_rev.mp3');
    preloader.loadAudio('sounds/weapon_fire.mp3'); 
    
    // Other sounds will be loaded on demand to improve startup time
    
    // If there are no assets to load, call complete immediately
    if (preloader.assetsToLoad === 0) {
        preloader.onComplete();
    }
});

// Object Pool Manager - Significantly reduces garbage collection
class ObjectPoolManager {
    constructor() {
        this.pools = new Map();
    }
    
    // Create a new pool
    createPool(name, createFunc, initialSize = 20) {
        if (this.pools.has(name)) {
            console.warn(`Pool ${name} already exists`);
            return;
        }
        
        const pool = {
            available: [],
            active: [],
            createFunc: createFunc
        };
        
        // Pre-create objects
        for (let i = 0; i < initialSize; i++) {
            const obj = createFunc();
            obj.__poolIndex = i;
            pool.available.push(obj);
        }
        
        this.pools.set(name, pool);
        console.log(`Created object pool '${name}' with ${initialSize} objects`);
    }
    
    // Get an object from pool
    get(name) {
        const pool = this.pools.get(name);
        if (!pool) {
            console.error(`Pool ${name} doesn't exist`);
            return null;
        }
        
        let obj;
        if (pool.available.length > 0) {
            obj = pool.available.pop();
        } else {
            // Create new object if none available
            obj = pool.createFunc();
            obj.__poolIndex = pool.active.length + pool.available.length;
            console.log(`Growing pool ${name}`);
        }
        
        pool.active.push(obj);
        return obj;
    }
    
    // Return object to pool
    release(name, obj) {
        const pool = this.pools.get(name);
        if (!pool) {
            console.error(`Pool ${name} doesn't exist`);
            return;
        }
        
        const index = pool.active.indexOf(obj);
        if (index !== -1) {
            pool.active.splice(index, 1);
            pool.available.push(obj);
        }
    }
    
    // Clear all pools
    clear() {
        this.pools.forEach((pool, name) => {
            pool.active.length = 0;
            pool.available.length = 0;
        });
        this.pools.clear();
    }
}

export { Game }
