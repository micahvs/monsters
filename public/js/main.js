// Import THREE.js using global window object
const THREE = window.THREE;
console.log("THREE.js accessed:", THREE);

// Check if THREE was loaded properly
if (!THREE || !THREE.Scene) {
    console.error("THREE.js did not load properly! Scene class is missing.");
} else {
    console.log("THREE.js Scene class found:", THREE.Scene);
}

// Define a simple buffer geometry utility for computing normals if not available
if (THREE && !THREE.BufferGeometryUtils) {
    THREE.BufferGeometryUtils = {
        computeVertexNormals: function(geometry) {
            // Skip if no position attribute
            if (!geometry.attributes.position) return;
            
            try {
                // Get position attribute
                const positions = geometry.attributes.position;
                const itemSize = positions.itemSize;
                
                // Create normal attribute if it doesn't exist
                if (!geometry.attributes.normal) {
                    const normals = new Float32Array(positions.count * 3);
                    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                }
                
                // Get normal attribute
                const normals = geometry.attributes.normal;
                
                // Create temporary arrays
                const tempVec1 = new THREE.Vector3();
                const tempVec2 = new THREE.Vector3();
                const tempNormal = new THREE.Vector3();
                
                // For each face, compute normal
                for (let i = 0; i < positions.count; i += 3) {
                    // Get vertices of face
                    const vA = new THREE.Vector3();
                    const vB = new THREE.Vector3();
                    const vC = new THREE.Vector3();
                    
                    vA.fromBufferAttribute(positions, i);
                    vB.fromBufferAttribute(positions, i + 1);
                    vC.fromBufferAttribute(positions, i + 2);
                    
                    // Compute normal
                    tempVec1.subVectors(vB, vA);
                    tempVec2.subVectors(vC, vA);
                    tempNormal.crossVectors(tempVec1, tempVec2).normalize();
                    
                    // Set normal for each vertex of the face
                    normals.setXYZ(i, tempNormal.x, tempNormal.y, tempNormal.z);
                    normals.setXYZ(i + 1, tempNormal.x, tempNormal.y, tempNormal.z);
                    normals.setXYZ(i + 2, tempNormal.x, tempNormal.y, tempNormal.z);
                }
                
                // Mark normals as needing update
                normals.needsUpdate = true;
                
                console.log("Computed vertex normals");
            } catch (e) {
                console.warn("Error computing vertex normals:", e);
            }
        }
    };
    
    console.log("Created fallback BufferGeometryUtils for computing normals");
}

// Global variables
let gameInstance = null;
let audioInitialized = false;

// Check if we're on a mobile device
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Handle the tap-to-start for audio initialization
function setupMobileAudioHandling() {
    const overlay = document.getElementById('tap-to-start-overlay');
    
    // Only show the overlay on mobile devices
    if (isMobileDevice) {
        console.log("Mobile device detected, showing tap-to-start overlay");
        
        // Create overlay if it doesn't exist
        if (!overlay) {
            const newOverlay = document.createElement('div');
            newOverlay.id = 'tap-to-start-overlay';
            newOverlay.className = 'overlay';
            newOverlay.innerHTML = '<div class="overlay-content"><div class="tap-icon"></div><div class="tap-text">TAP TO START</div></div>';
            newOverlay.style.position = 'fixed';
            newOverlay.style.top = '0';
            newOverlay.style.left = '0';
            newOverlay.style.width = '100%';
            newOverlay.style.height = '100%';
            newOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            newOverlay.style.zIndex = '10000';
            newOverlay.style.display = 'flex';
            newOverlay.style.justifyContent = 'center';
            newOverlay.style.alignItems = 'center';
            newOverlay.style.color = '#ff00ff';
            newOverlay.style.fontFamily = 'Arial, sans-serif';
            newOverlay.style.fontSize = '24px';
            document.body.appendChild(newOverlay);
        }
        
        // Handle the tap event
        (overlay || document.getElementById('tap-to-start-overlay'))?.addEventListener('click', () => {
            console.log("Tap-to-start overlay clicked, initializing audio");
            audioInitialized = true;
            
            // Hide the overlay
            (overlay || document.getElementById('tap-to-start-overlay'))?.classList.add('hidden');
            
            // Initialize audio manager
            if (!window.audioManager) {
                console.log("Creating AudioManager on user interaction");
                try {
                    window.audioManager = new AudioManager(null);
                    
                    // Immediately trigger the audio initialization
                    if (window.audioManager) {
                        window.audioManager.handleUserInteraction();
                    }
                } catch (e) {
                    console.error("Error creating AudioManager:", e);
                    // Create dummy audio manager to prevent null errors
                    window.audioManager = {
                        playSound: () => {},
                        stopSound: () => {},
                        handleUserInteraction: () => {},
                        playMusic: () => {},
                        stopMusic: () => {}
                    };
                }
            }
            
            // Start/resume the game if it exists
            if (gameInstance) {
                gameInstance.audioManager = window.audioManager;
                if (gameInstance.audioManager && gameInstance.camera) {
                    gameInstance.audioManager.camera = gameInstance.camera;
                }
                // Force game to update audio manager reference
                if (gameInstance.monsterTruck) {
                    gameInstance.monsterTruck.audioManager = window.audioManager;
                }
                if (gameInstance.truck) {
                    // Force truck to get an audio reference too
                    gameInstance.truck.audioManager = window.audioManager;
                }
            } else {
                console.log("Game not yet started, will initialize when ready");
            }
        });
    } else {
        console.log("Desktop device detected, no tap-to-start needed");
        audioInitialized = true;
    }
}

// Call this on page load
document.addEventListener('DOMContentLoaded', () => {
    // Setup mobile audio handling 
    setupMobileAudioHandling();
    
    // Create global audio manager early
    if (!window.audioManager && typeof AudioManager === 'function') {
        try {
            console.log("Creating early AudioManager instance");
            window.audioManager = new AudioManager(null);
            
            // Force an early audio initialization attempt for desktop browsers
            if (!isMobileDevice) {
                window.audioManager.handleUserInteraction();
            }
        } catch (e) {
            console.error("Error creating early AudioManager:", e);
        }
    }
});

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

// Define global Projectile class so it's accessible to object pools
class Projectile {
    // Constructor now only creates the mesh and sets default state
    constructor(scene) { 
        this.scene = scene || null; // Store scene reference
        this.alive = false; // Start inactive
        
        try {
            if (!scene) {
                console.warn("Scene not provided to Projectile constructor");
                this.mesh = { position: new THREE.Vector3(), visible: false };
                return;
            }
            
            // Use a larger, more visible geometry
            const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6); // Increased size and segments
            geometry.rotateX(Math.PI / 2);
            
            // Use brighter material with higher opacity - MeshBasicMaterial doesn't support emissive
            const material = new THREE.MeshBasicMaterial({
                color: 0xff00ff,
                transparent: true,
                opacity: 1.0 // Full opacity
            });
            
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.visible = false; // Start invisible
            
            // Ensure it's added to the scene
            if (this.scene && this.scene.add) {
                this.scene.add(this.mesh);
                console.log("✅ Projectile mesh added to scene successfully");
            } else {
                console.error("⚠️ Could not add projectile mesh to scene - scene is invalid");
            }
        } catch (e) {
            console.error("Error creating projectile mesh:", e);
            this.mesh = { position: new THREE.Vector3(), visible: false };
        }
    }

    // Setup method to configure/reset the projectile
    setup(position, direction, speed, damage, lifetime, source, weaponType, playerId) {
        try {
            if (!position || !direction || !this.mesh) {
                console.warn("Invalid parameters for projectile setup");
                return this;
            }
            
            this.mesh.position.copy(position);
            this.direction = direction.normalize();
            this.speed = speed || 0.5;
            this.damage = damage || 10;
            this.source = source || 'player';
            this.playerId = playerId || null; // Store the shooter's ID
            this.weaponType = weaponType; // Store weapon type
            this.lifetime = lifetime || 200;
            this.alive = true;
            this.mesh.visible = true;

            // Reset scale in case it was changed (e.g., trails)
            this.mesh.scale.set(1, 1, 1);

            // Update appearance based on source/type/color
            this.updateAppearance(this.weaponType, source === 'remote' ? null : undefined);

            // Set rotation to match direction
            this.mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                this.direction
            );
        } catch (e) {
            console.error("Error setting up projectile:", e);
            this.alive = false;
        }
        
        return this;
    }

    updateAppearance(weaponType, colorOverride = undefined) {
        try {
            if (!this.mesh || !this.mesh.material) {
                console.warn("Cannot update appearance - mesh or material missing");
                return;
            }
            
            // Ensure mesh is visible
            this.mesh.visible = true;
            
            // Get projectile color with fallbacks
            let projectileColor;
            
            if (colorOverride) {
                projectileColor = new THREE.Color(colorOverride);
            } else if (weaponType && weaponType.color) {
                projectileColor = new THREE.Color(weaponType.color);
            } else {
                // Default colors based on source if no weapon type
                projectileColor = this.source === 'player' ? new THREE.Color(0xff00ff) : new THREE.Color(0x00ffff);
            }

            // Update color/emissive - with safeguards
            if (projectileColor && this.mesh.material) {
                // Safely set color if it exists
                if (this.mesh.material.color) {
                    this.mesh.material.color.copy(projectileColor);
                } else {
                    this.mesh.material.color = projectileColor.clone();
                }
                
                // Set high opacity to ensure visibility
                this.mesh.material.opacity = 1.0;
                
                // Increase size based on weapon type
                const sizeMultiplier = weaponType && weaponType.projectileSize ? weaponType.projectileSize * 10 : 1.0;
                this.mesh.scale.set(sizeMultiplier, sizeMultiplier, sizeMultiplier);
                
                // Force material update
                this.mesh.material.needsUpdate = true;
            }
            
            // Log confirmation of projectile visibility
            console.log(`Projectile appearance updated - visible: ${this.mesh.visible}, color: ${projectileColor.getHexString()}`);
        } catch (e) {
            console.error("Error updating projectile appearance:", e);
        }
    }

    update(delta) { // Pass delta for potential frame-rate independent movement
        if (!this.alive || !this.mesh) return false;
        
        try {
            // Use delta in movement calculation if available
            const effectiveSpeed = this.speed * (delta ? delta * 60 : 1); // Assume 60 FPS if delta is missing
            const movement = this.direction.clone().multiplyScalar(effectiveSpeed);
            this.mesh.position.add(movement);
            
            // Reduce lifetime
            this.lifetime--;
            if (this.lifetime <= 0) this.alive = false;
        } catch (e) {
            console.error("Error updating projectile:", e);
            this.alive = false;
        }
        
        return this.alive;
    }

    hide() {
        try {
            if (this.mesh) this.mesh.visible = false;
            this.alive = false;
        } catch (e) {
            console.error("Error hiding projectile:", e);
        }
    }
}

// Define the Turret class
class Turret {
    constructor(position, scene, type = null) {
        this.position = position;
        this.scene = scene;
        this.type = type || {
            name: "Standard",
            color: 0x00ffff,
            activeColor: 0xff00ff,
            warningColor: 0xff8800,
            health: 5,
            damage: 10,
            fireRate: 180,
            projectileSpeed: 4.5,
            rotationSpeed: 0.015,
            scale: 15
        };
        
        this.health = this.type.health;
        this.alive = true;
        this.activated = false;
        this.activationDelay = Math.floor(Math.random() * 360) + 240; // Random delay before activation
        this.activationTimer = 0;
        
        this.base = null;
        this.gun = null;
        this.projectiles = [];
        this.cooldown = 0;
        
        this.fireRate = this.type.fireRate || 180; // Time between shots (frames)
        this.projectileSpeed = this.type.projectileSpeed || 4.5;
        this.rotationSpeed = this.type.rotationSpeed || 0.015;
        
        // Create 3D model
        this.createModel();
    }
    
    createModel() {
        // Create base
        const baseGeometry = new THREE.CylinderGeometry(
            this.type.scale * 0.8, // Top radius
            this.type.scale, // Bottom radius
            this.type.scale * 0.4, // Height
            16 // Segments
        );
        const baseMaterial = new THREE.MeshPhongMaterial({
            color: this.type.color,
            emissive: this.type.color,
            emissiveIntensity: 0.2,
            shininess: 70
        });
        this.base = new THREE.Mesh(baseGeometry, baseMaterial);
        this.base.position.copy(this.position);
        this.base.position.y = this.type.scale * 0.2; // Half height
        this.scene.add(this.base);
        
        // Create gun turret
        const gunGeometry = new THREE.BoxGeometry(
            this.type.scale * 0.2, // Width
            this.type.scale * 0.2, // Height
            this.type.scale * 1.2 // Length
        );
        const gunMaterial = new THREE.MeshPhongMaterial({
            color: this.type.color,
            emissive: this.type.color,
            emissiveIntensity: 0.4,
            shininess: 90
        });
        this.gun = new THREE.Mesh(gunGeometry, gunMaterial);
        this.gun.position.set(0, this.type.scale * 0.3, this.type.scale * 0.4);
        this.base.add(this.gun);
    }
    
    update(playerPosition) {
        if (!this.alive) {
            // If respawning, check timer
            if (this.respawning) {
                this.respawnTimer--;
                if (this.respawnTimer <= 0) {
                    this.respawn();
                }
            }
            return;
        }
        
        // Activation timer
        if (!this.activated) {
            this.activationTimer++;
            if (this.activationTimer >= this.activationDelay) {
                this.activate();
            }
            
            // Waiting animation - pulse
            if (this.base && this.base.material) {
                const pulseIntensity = 0.1 + (Math.sin(this.activationTimer * 0.05) * 0.05);
                this.base.material.emissiveIntensity = pulseIntensity;
                
                // Change color as activation approaches
                if (this.activationTimer > this.activationDelay * 0.7) {
                    this.base.material.color.setHex(this.type.warningColor);
                    this.base.material.emissive.setHex(this.type.warningColor);
                }
            }
            
            return;
        }
        
        // Track player
        if (playerPosition && this.base) {
            // Calculate angle to player
            const dx = playerPosition.x - this.base.position.x;
            const dz = playerPosition.z - this.base.position.z;
            const targetAngle = Math.atan2(dx, dz);
            
            // Get current angle
            let currentAngle = this.base.rotation.y;
            
            // Smoothly rotate towards target
            const angleDiff = (targetAngle - currentAngle + Math.PI) % (Math.PI * 2) - Math.PI;
            this.base.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.rotationSpeed);
            
            // Decrease cooldown
            if (this.cooldown > 0) {
                this.cooldown--;
            }
            
            // Check if can fire
            const isAiming = Math.abs(angleDiff) < 0.2; // Target within sight
            if (isAiming && this.cooldown <= 0) {
                this.fire(playerPosition);
            }
        }
        
        // Update existing projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            
            // Move projectile
            projectile.mesh.position.x += projectile.direction.x * this.projectileSpeed;
            projectile.mesh.position.z += projectile.direction.z * this.projectileSpeed;
            
            // Check if out of bounds or expired
            projectile.life--;
            if (projectile.life <= 0 || !projectile.alive ||
                Math.abs(projectile.mesh.position.x) > 1000 ||
                Math.abs(projectile.mesh.position.z) > 1000) {
                
                // Remove from scene
                this.scene.remove(projectile.mesh);
                this.projectiles.splice(i, 1);
            }
        }
    }
    
    activate() {
        this.activated = true;
        
        // Change base color to active color
        if (this.base && this.base.material) {
            this.base.material.color.setHex(this.type.activeColor);
            this.base.material.emissive.setHex(this.type.activeColor);
            this.base.material.emissiveIntensity = 0.5;
        }
        
        // Change gun color to active color
        if (this.gun && this.gun.material) {
            this.gun.material.color.setHex(this.type.activeColor);
            this.gun.material.emissive.setHex(this.type.activeColor);
            this.gun.material.emissiveIntensity = 0.5;
        }
    }
    
    fire(targetPosition) {
        // Calculate direction to player
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.base.position)
            .normalize();
        
        // Slight randomization for difficulty adjustment
        direction.x += (Math.random() - 0.5) * 0.1;
        direction.z += (Math.random() - 0.5) * 0.1;
        direction.normalize();
        
        // Create projectile
        const projectileGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const projectileMaterial = new THREE.MeshBasicMaterial({ 
            color: this.type.activeColor, 
            emissive: this.type.activeColor, 
            emissiveIntensity: 1.0 
        });
        
        const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
        
        // Position at gun tip
        const gunDirection = new THREE.Vector3(0, 0, 1);
        gunDirection.applyQuaternion(this.base.quaternion);
        
        // Position at end of gun
        const gunTip = new THREE.Vector3(
            this.base.position.x + gunDirection.x * this.type.scale * 0.6,
            this.base.position.y + this.type.scale * 0.3,
            this.base.position.z + gunDirection.z * this.type.scale * 0.6
        );
        
        projectileMesh.position.copy(gunTip);
        
        // Add to scene
        this.scene.add(projectileMesh);
        
        // Add to projectiles array
        this.projectiles.push({
            mesh: projectileMesh,
            direction: { x: direction.x, y: 0, z: direction.z },
            life: 120, // Lifespan in frames
            damage: this.type.damage,
            alive: true
        });
        
        // Start cooldown
        this.cooldown = this.fireRate;
        
        // Create muzzle flash
        this.createMuzzleFlash(gunTip);
    }
    
    createMuzzleFlash(position) {
        // Create muzzle flash
        const flashGeometry = new THREE.SphereGeometry(1, 8, 8);
        const flashMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffff00,
            transparent: true,
            opacity: 0.8
        });
        
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(position);
        this.scene.add(flash);
        
        // Add light
        const light = new THREE.PointLight(0xffff00, 2, 10);
        light.position.copy(position);
        this.scene.add(light);
        
        // Remove after short time
        setTimeout(() => {
            if (this.scene) {
                this.scene.remove(flash);
                this.scene.remove(light);
            }
        }, 100);
    }
    
    takeDamage(amount) {
        this.health -= amount;
        
        // Check for destruction
        if (this.health <= 0) {
            this.alive = false;
            return true; // Destroyed
        }
        
        return false; // Still alive
    }
    
    respawn() {
        // Reset turret
        this.alive = true;
        this.health = this.type.health;
        this.activated = false;
        this.activationTimer = 0;
        this.activationDelay = Math.floor(Math.random() * 360) + 240;
        this.cooldown = 0;
        this.respawning = false;
        
        // Reset visual appearance
        if (this.base && this.base.material) {
            this.base.material.color.setHex(this.type.color);
            this.base.material.emissive.setHex(this.type.color);
            this.base.material.emissiveIntensity = 0.2;
            
            // Reset rotation
            this.base.rotation.x = 0;
            this.base.rotation.z = 0;
        }
        
        if (this.gun && this.gun.material) {
            this.gun.material.color.setHex(this.type.color);
            this.gun.material.emissive.setHex(this.type.color);
            this.gun.material.emissiveIntensity = 0.2;
        }
    }
    
    getProjectiles() {
        return this.projectiles;
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
    constructor(debugOrCallback = false) {
        console.log("Game constructor");
        
        try {
            // Determine if first parameter is a callback or debug flag
            if (typeof debugOrCallback === 'function') {
                this.onLoadCallback = debugOrCallback;
                this.debug = false;
            } else {
                this.debug = debugOrCallback;
                this.onLoadCallback = function(success) {};
            }
            
            // Create key game components in the right order
            // 1. First create the scene - CRITICAL for adding objects
            this.scene = new THREE.Scene();
            console.log("Scene created successfully");
            
            // 2. Setup camera
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.camera.position.set(0, 5, -10);
            this.camera.lookAt(0, 0, 0);
            
            // 3. Create shared geometries for better performance
            this.sharedParticleGeometry = new THREE.SphereGeometry(1, 8, 6);
            
            // Initialize critical arrays and objects
            this.turrets = [];
            this.powerups = [];
            this.powerupSpawnTimer = 0;
            this.powerupSpawnInterval = 600; // 10 seconds at 60fps
            this.obstacles = [];
            
            // Store this instance globally
            gameInstance = this;
            
            // Detect mobile for performance optimizations
            this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // Optimize settings for mobile while keeping multiplayer enabled
            if (this.isMobile) {
                console.log("Mobile device detected - using optimized settings");
                this.drawDistance = 600;
                this.maxParticles = 10;
                this.shadowsEnabled = false;
                this.effectsEnabled = false;
                this.gridEnabled = true;
                
                // Keep multiplayer enabled on mobile
                window.multiplayerEnabled = true;
            } else {
                this.drawDistance = 2000;
                this.maxParticles = 30;
                this.shadowsEnabled = false;
                this.effectsEnabled = true;
                this.gridEnabled = true;
                
                // Enable multiplayer by default on desktop
                window.multiplayerEnabled = true;
            }
            
            // Create a silent audio manager as a fallback before it's properly initialized
            // This prevents null errors when methods are called
            this.audioManager = {
                playSound: () => {},
                stopSound: () => {},
                playMusic: () => {},
                stopMusic: () => {},
                handleUserInteraction: () => {},
                camera: null
            };
            
            // If audioManager already exists, use it
            if (window.audioManager) {
                this.audioManager = window.audioManager;
            }
            
            // Track initialization status
            this.isInitialized = false;
            this.initializationFailed = false;
            
            // Set a timeout to fail initialization after 15 seconds
            this.initializationTimeout = setTimeout(() => {
                if (!this.isInitialized && !this.initializationFailed) {
                    console.error("Game initialization timed out after 15 seconds");
                    this.initializationFailed = true;
                    this.onLoadCallback(false);
                }
            }, 15000);
            
            // Initialize object pool manager for better performance
            this.objectPools = new ObjectPoolManager();
            
            // Set up object pools
            this.initObjectPools();
            
            // Always use high quality mode
            window.lowPerformanceMode = false;
            this.applyHighPerformanceMode();
            
            // Essential controls only
            this.keys = {
                'ArrowUp': false,
                'ArrowDown': false,
                'ArrowLeft': false,
                'ArrowRight': false,
                ' ': false,
                'M': false,
                'r': false,
                'R': false,
                'forward': false,  // For mobile controls
                'backward': false, // For mobile controls
                'left': false,     // For mobile controls
                'right': false,    // For mobile controls
                'shoot': false     // For mobile controls
            }
            
            // Core game state
            this.score = 0;
            this.health = 100;
            this.maxHealth = 100;
            
            // Continue the initialization process
            this.init();
        } catch (error) {
            console.error("Critical error in Game constructor:", error);
            if (typeof this.onLoadCallback === 'function') {
                this.onLoadCallback(false);
            }
        }
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
                // Always set multiplayer to true
                window.multiplayerEnabled = true;
                toggle.textContent = '🌐 Multiplayer: ON';
                toggle.style.border = '1px solid #00ffff';
                    
                // Save preference to localStorage
                localStorage.setItem('monsterTruckMultiplayer', true);
                    
                // Show notification
                this.showNotification('Multiplayer is always enabled for better experience');
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
            // Always set multiplayer to true
            window.multiplayerEnabled = true;
            toggle.textContent = '🌐 Multiplayer: ON';
            toggle.style.border = '1px solid #00ffff';
                
            // Save preference to localStorage
            localStorage.setItem('monsterTruckMultiplayer', true);
                
            // Show notification
            this.showNotification('Multiplayer is always enabled for better experience');
        });
        
        document.body.appendChild(toggle);
    }

    // Performance toggle removed - always using high quality mode
    addPerformanceToggle() {
        // Function kept empty for compatibility
        // Performance mode is now always set to high quality
    }

    // Method to apply low performance mode
    applyLowPerformanceMode() {
        // Disable shadows
        this.shadowsEnabled = false;
        
        // Keep the grid for visual effect but use simpler grid if needed
        if (this.gridHelper) {
            // If using complex grid, replace with simpler one
            if (this.gridHelper.widthSegments > 30) {
                this.scene.remove(this.gridHelper);
                this.gridHelper = new THREE.GridHelper(1560, 30, 0xff00ff, 0x00ffff);
                this.scene.add(this.gridHelper);
            }
        } else {
            // Create grid if it doesn't exist
            this.gridHelper = new THREE.GridHelper(1560, 30, 0xff00ff, 0x00ffff);
            this.scene.add(this.gridHelper);
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
        try {
            if (!this.scene) {
                console.error("Cannot initialize object pools: scene is not defined");
                return;
            }
            
            if (!this.objectPools) {
                console.error("Cannot initialize object pools: objectPools is not defined");
                return;
            }
            
            if (!this.sharedParticleGeometry) {
                console.log("Creating shared particle geometry");
                // Use low-poly geometry to reduce buffer size
                this.sharedParticleGeometry = new THREE.SphereGeometry(1, 6, 4); // Reduced from 8, 6
            }
            
            // Create particle pool
            this.objectPools.createPool('particles', () => {
                try {
                    // Use shared geometry instead of creating new ones each time
                    const material = new THREE.MeshBasicMaterial({  // Changed from MeshPhongMaterial to MeshBasicMaterial
                        color: 0xff00ff,
                        transparent: true,
                        opacity: 0.8
                    });
                    const mesh = new THREE.Mesh(this.sharedParticleGeometry, material);
                    mesh.visible = false;
                    if (this.scene) {
                        this.scene.add(mesh);
                    } else {
                        console.warn("Scene not available, particle won't be added");
                    }
                    return {
                        mesh: mesh,
                        reset: function(position, color) {
                            if (!position) return this;
                            this.mesh.visible = true;
                            this.mesh.position.copy(position);
                            if (color && this.mesh.material) {
                                this.mesh.material.color.set(color || 0xff00ff);
                            }
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
                            if (!this.mesh) return false;
                            this.life -= delta * 2;
                            if (this.velocity) {
                                this.mesh.position.add(this.velocity);
                            }
                            if (this.mesh.material) {
                                this.mesh.material.opacity = this.life;
                            }
                            return this.life > 0;
                        },
                        hide: function() {
                            if (this.mesh) this.mesh.visible = false;
                        }
                    };
                } catch (e) {
                    console.error("Error creating particle:", e);
                    // Return dummy object with required methods to prevent errors
                    return {
                        mesh: { position: new THREE.Vector3(), visible: false },
                        reset: function() { return this; },
                        update: function() { return false; },
                        hide: function() {}
                    };
                }
            }, this.isMobile ? 10 : 30); // Reduced pool size from 20/50 to 10/30
            
            // Create projectile pool
            this.objectPools.createPool('projectiles', () => {
                try {
                    // Safe creation of Projectile instance
                    if (typeof Projectile === 'function' && this.scene) {
                        const projectileInstance = new Projectile(this.scene);
                        return projectileInstance;
                    } else {
                        // Fallback if Projectile class isn't available or scene is missing
                        console.warn("Using dummy projectile - Projectile class not available or scene missing");
                        return {
                            mesh: { position: new THREE.Vector3(), visible: false },
                            direction: new THREE.Vector3(0, 0, 1),
                            speed: 0.5,
                            damage: 10,
                            alive: false,
                            setup: function() { this.alive = true; return this; },
                            update: function() { return false; },
                            hide: function() { this.alive = false; }
                        };
                    }
                } catch (e) {
                    console.error("Error creating projectile:", e);
                    // Return dummy object with required methods to prevent errors
                    return {
                        mesh: { position: new THREE.Vector3(), visible: false },
                        direction: new THREE.Vector3(0, 0, 1),
                        speed: 0.5,
                        damage: 10,
                        alive: false,
                        setup: function() { this.alive = true; return this; },
                        update: function() { return false; },
                        hide: function() { this.alive = false; }
                    };
                }
            }, this.isMobile ? 10 : 20); // Reduced pool size from 15/30 to 10/20
        } catch (error) {
            console.error("Error initializing object pools:", error);
        }
    }

    init() {
        try {
            // Try to dispose any previous resources first
            this.disposeResources();
            
            // Initialize renderer
            try {
                // Get the canvas element
                const canvas = document.getElementById('game');
                
                // If canvas not found, create one
                let targetCanvas;
                if (!canvas) {
                    const newCanvas = document.createElement('canvas');
                    newCanvas.id = 'game';
                    newCanvas.style.width = '100%';
                    newCanvas.style.height = '100%';
                    newCanvas.style.display = 'block';
                    document.body.appendChild(newCanvas);
                    targetCanvas = newCanvas;
                } else {
                    targetCanvas = canvas;
                }
                
                // Use simpler renderer options for reliability
                const rendererOptions = {
                    canvas: targetCanvas,
                    antialias: false, // Disable antialiasing initially for all devices
                    alpha: false, // Disable alpha for performance
                    preserveDrawingBuffer: false,
                    powerPreference: "default" // Let browser decide power profile
                };
                
                // Create the renderer with basic settings first
                try {
                    // Dispose old renderer if it exists
                    if (this.renderer) {
                        this.renderer.dispose();
                        this.renderer = null;
                    }
                    
                    this.renderer = new THREE.WebGLRenderer(rendererOptions);
                    console.log("WebGL renderer created successfully");
                    
                    // Set the renderer size to match the window
                    this.renderer.setSize(window.innerWidth, window.innerHeight);
                    
                    // Disable shadow maps for performance
                    this.renderer.shadowMap.enabled = false;
                    
                    // Set pixel ratio based on device
                    if (this.isMobile) {
                        // Always use 1.0 for mobile for best performance
                        this.renderer.setPixelRatio(1.0);
                    } else {
                        // Desktop can use higher pixel ratio if available
                        const pixelRatio = window.devicePixelRatio || 1;
                        this.renderer.setPixelRatio(Math.min(pixelRatio, 1.5)); // Reduced from 2 to 1.5
                    }
                    
                    // Explicitly initialize WebGL and create context
                    const gl = this.renderer.getContext();
                    if (!gl) {
                        throw new Error("Unable to get WebGL context");
                    }
                    
                    // Basic color settings (in try-catch for compatibility)
                    try {
                        if (typeof this.renderer.outputColorSpace !== 'undefined') {
                            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
                        }
                        
                        // Simplified tone mapping for all devices
                        this.renderer.toneMapping = THREE.NoToneMapping; // Changed from LinearToneMapping
                        this.renderer.toneMappingExposure = 1.0;
                    } catch (renderPropsErr) {
                        console.warn("Could not set all renderer properties:", renderPropsErr);
                        // Continue anyway
                    }
                } catch (rendererErr) {
                    console.error("WebGL renderer creation failed:", rendererErr);
                    throw new Error("Could not initialize WebGL renderer");
                }
                
                // Add simple WebGL context loss handler
                try {
                    targetCanvas.addEventListener('webglcontextlost', (event) => {
                        event.preventDefault();
                        console.warn("WebGL context lost");
                        
                        // Show a simple message in the loading screen
                        const loadingElement = document.getElementById('loadingScreen');
                        if (loadingElement && loadingElement.style.display !== 'block') {
                            loadingElement.style.display = 'block';
                            loadingElement.innerHTML = '<div class="loading-text">RECONNECTING TO GRID...</div>';
                        }
                    }, false);
                    
                    targetCanvas.addEventListener('webglcontextrestored', () => {
                        console.log("WebGL context restored");
                        
                        // Recreate all materials to ensure proper WebGL state
                        this.recreateMaterials();
                        
                        // Hide the loading screen after restoration
                        const loadingElement = document.getElementById('loadingScreen');
                        if (loadingElement) {
                            loadingElement.style.display = 'none';
                        }
                        
                        // Basic reinitialization - resize the renderer
                        if (this.renderer && this.camera) {
                            this.renderer.setSize(window.innerWidth, window.innerHeight);
                            this.camera.aspect = window.innerWidth / window.innerHeight;
                            this.camera.updateProjectionMatrix();
                        }
                    }, false);
                } catch (eventErr) {
                    console.warn("Could not add context loss handlers:", eventErr);
                    // Continue anyway
                }
                
            } catch (rendererError) {
                console.error("Failed to create renderer:", rendererError);
                
                // Show error in loading screen instead of throwing
                const loadingElement = document.getElementById('loadingScreen');
                if (loadingElement) {
                    loadingElement.innerHTML = '<div class="loading-text">GRAPHICS ERROR - Your device does not fully support WebGL required for this game.</div>';
                }
                return false;
            }
            
            // Add fog for distance culling with cyberpunk background color
            this.scene.fog = new THREE.Fog(0x120023, 1000, 1800); // Dark purple from cyberpunk theme
            
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
                // Modern lighting setup for cyberpunk/synthwave color rendering
                // Main ambient light provides base illumination with subtle purple tint
                const ambientLight = new THREE.AmbientLight(0x8800ff, 0.3); // Subtle purple ambient
                this.scene.add(ambientLight);
                
                // Secondary ambient for basic visibility
                const secondaryAmbient = new THREE.AmbientLight(0xffffff, 0.5);
                this.scene.add(secondaryAmbient);
                
                // Main directional light WITHOUT shadows
                const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
                directionalLight.position.set(50, 200, 100);
                directionalLight.castShadow = false; // Explicitly disable shadows
                this.scene.add(directionalLight);
                
                // Magenta rim lighting for synthwave feel
                const magentaLight = new THREE.DirectionalLight(0xff00ff, 0.8); // Stronger magenta
                magentaLight.position.set(-100, 50, -100);
                magentaLight.castShadow = false;
                this.scene.add(magentaLight);
                
                // Cyan backlight for cyberpunk feel
                const cyanLight = new THREE.DirectionalLight(0x00ffff, 0.8); // Stronger cyan
                cyanLight.position.set(100, 20, -100);
                cyanLight.castShadow = false;
                this.scene.add(cyanLight);
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
            
            // Clear the timeout since initialization completed successfully
            if (this.initializationTimeout) {
                clearTimeout(this.initializationTimeout);
                this.initializationTimeout = null;
            }
            
            // Mark initialization as complete
            this.isInitialized = true;
            this.initializationFailed = false;
            
            // Call the onLoad callback to signal that the game is ready
            if (typeof this.onLoadCallback === 'function') {
                console.log("Game fully initialized, calling onLoad callback with success=true");
                
                // Use setTimeout to ensure UI updates before potentially heavy animation starts
                setTimeout(() => {
                    this.onLoadCallback(true);
                }, 100);
            }
            
            // Start animation loop
            this.animate();
            
        } catch (error) {
            console.error("Critical error in game initialization:", error);
            
            // Clear the timeout if it exists
            if (this.initializationTimeout) {
                clearTimeout(this.initializationTimeout);
                this.initializationTimeout = null;
            }
            
            // Mark initialization as failed
            this.isInitialized = false;
            this.initializationFailed = true;
            
            // Call the callback with failure
            if (typeof this.onLoadCallback === 'function') {
                this.onLoadCallback(false);
            }
            
            // Show error message on screen
            try {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    const loadingText = loadingScreen.querySelector('.loading-text');
                    if (loadingText) {
                        loadingText.innerHTML = `ERROR: ${error.message}<br><small>Please try refreshing the page</small>`;
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

    // New helper method to recreate materials after context loss
    recreateMaterials() {
        try {
            // Only run if scene exists
            if (!this.scene) return;
            
            console.log("Recreating materials after context restoration");
            
            // Traverse all objects in the scene
            this.scene.traverse((object) => {
                if (object.isMesh && object.material) {
                    const oldMaterial = object.material;
                    
                    // Create new material with same properties
                    let newMaterial;
                    
                    if (oldMaterial.isMeshBasicMaterial) {
                        newMaterial = new THREE.MeshBasicMaterial();
                    } else if (oldMaterial.isMeshPhongMaterial) {
                        newMaterial = new THREE.MeshPhongMaterial();
                    } else if (oldMaterial.isMeshStandardMaterial) {
                        newMaterial = new THREE.MeshStandardMaterial();
                    } else {
                        // Default to basic material if unknown type
                        newMaterial = new THREE.MeshBasicMaterial();
                    }
                    
                    // Copy essential properties
                    if (oldMaterial.color) newMaterial.color = oldMaterial.color.clone();
                    if (oldMaterial.emissive) newMaterial.emissive = oldMaterial.emissive.clone();
                    if (oldMaterial.emissiveIntensity) newMaterial.emissiveIntensity = oldMaterial.emissiveIntensity;
                    if (oldMaterial.map) newMaterial.map = oldMaterial.map;
                    newMaterial.transparent = oldMaterial.transparent;
                    newMaterial.opacity = oldMaterial.opacity;
                    newMaterial.wireframe = oldMaterial.wireframe;
                    
                    // Assign the new material
                    object.material = newMaterial;
                    
                    // Dispose of old material to free GPU memory
                    if (oldMaterial.dispose) {
                        oldMaterial.dispose();
                    }
                }
            });
        } catch (error) {
            console.error("Error recreating materials:", error);
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
            color: 0x000033, // Dark blue base for neon grid effect
            transparent: false, // Changed from true to false to avoid WebGL blending issues
            opacity: 1.0      // Changed from 0.8 to 1.0 since transparency is disabled
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = false; // Disabled shadows
        this.scene.add(ground);
        
        // Add grid helper for neon grid effect - use simpler grid with fewer segments
        const gridHelper = new THREE.GridHelper(arenaSize, 30, 0xff00ff, 0x00ffff); // Reduced from 50 to 30
        this.scene.add(gridHelper);
        
        // Create walls - now 50% shorter (height reduced from 100 to 50)
        // Use MeshPhongMaterial for walls with cyberpunk colors and glow
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0x8800ff, // Vibrant purple from cyberpunk scheme
            emissive: 0x8800ff,
            emissiveIntensity: 0.5,
            shininess: 30,
            transparent: false // Make walls fully opaque
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
        
        // Get truck color from localStorage
        let truckColor = 0xff00ff; // Default to magenta/pink
        const savedColor = localStorage.getItem('monsterTruckColor');
        if (savedColor) {
            // Parse the hex color from localStorage (removing # if present)
            truckColor = parseInt(savedColor.replace('#', '0x'), 16);
        }
        console.log("Using truck color:", savedColor || "default pink");
        
        // Double the truck dimensions (2x bigger)
        const truckGeometry = new THREE.BoxGeometry(5, 2.5, 7.5); // 2x the original dimensions
        const truckMaterial = new THREE.MeshPhongMaterial({ // Changed back to MeshPhongMaterial for better lighting
            color: truckColor,
            emissive: truckColor,
            emissiveIntensity: 0.3,
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
        
        // Update player name in UI
        const playerNameElement = document.getElementById('playerName');
        const savedNickname = localStorage.getItem('monsterTruckNickname') || 'PLAYER';
        if (playerNameElement) {
            playerNameElement.textContent = savedNickname.toUpperCase();
            playerNameElement.style.color = savedColor || '#ff00ff';
        }
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
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.key in this.keys) {
                this.keys[e.key] = true;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key in this.keys) {
                this.keys[e.key] = false;
            }
        });
        
        // Mobile detection
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Create mobile controls if needed
        if (this.isMobile) {
            this.createMobileControls();
        }
        
        // Handle window resize
        window.addEventListener('resize', () => {
            // Update camera aspect ratio
            if (this.camera) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
            }
            
            // Update renderer size
            if (this.renderer) {
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
            
            // Update mobile controls visibility
            if (this.isMobile) {
                this.updateMobileControlsVisibility();
            }
        }, { passive: true });
    }
    
    createMobileControls() {
        try {
            if (!this.isMobile) return;
            
            // Remove any existing mobile controls
            const existingControls = document.getElementById('mobile-controls');
            if (existingControls) {
                existingControls.remove();
            }
            
            // Create container for mobile controls
            const controlsContainer = document.createElement('div');
            controlsContainer.id = 'mobile-controls';
            document.body.appendChild(controlsContainer);
            
            // Create movement pad
            const movementPad = document.createElement('div');
            movementPad.id = 'movement-pad';
            movementPad.className = 'control-pad';
            controlsContainer.appendChild(movementPad);
            
            // Create weapon button
            const weaponButton = document.createElement('div');
            weaponButton.id = 'weapon-button';
            weaponButton.className = 'control-button';
            weaponButton.innerHTML = '<i class="fas fa-crosshairs"></i>';
            controlsContainer.appendChild(weaponButton);
            
            // Add touch event listeners with proper options
            const touchOptions = {
                passive: false // Important for iOS
            };
            
            // Movement pad touch handling
            if (movementPad) {
                movementPad.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    if (e.touches && e.touches[0]) {
                        this.handleMovementTouch(e.touches[0]);
                        movementPad.classList.add('active');
                    }
                }, touchOptions);
                
                movementPad.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    if (e.touches && e.touches[0]) {
                        this.handleMovementTouch(e.touches[0]);
                    }
                }, touchOptions);
                
                movementPad.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.resetMovementControls();
                    movementPad.classList.remove('active');
                }, touchOptions);
            }
            
            // Weapon button touch handling
            if (weaponButton) {
                weaponButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.keys.shoot = true;
                    weaponButton.classList.add('active');
                }, touchOptions);
                
                weaponButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.keys.shoot = false;
                    weaponButton.classList.remove('active');
                }, touchOptions);
            }
            
            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                #mobile-controls {
                    position: fixed;
                    bottom: 20px;
                    left: 0;
                    right: 0;
                    height: 180px;
                    z-index: 1000;
                    pointer-events: none;
                    display: ${this.isMobile ? 'block' : 'none'};
                }
                
                .control-pad {
                    position: absolute;
                    left: 20px;
                    bottom: 20px;
                    width: 120px;
                    height: 120px;
                    background: rgba(255, 0, 255, 0.2);
                    border: 2px solid rgba(255, 0, 255, 0.5);
                    border-radius: 50%;
                    pointer-events: auto;
                }
                
                .control-button {
                    position: absolute;
                    right: 20px;
                    bottom: 20px;
                    width: 80px;
                    height: 80px;
                    background: rgba(0, 255, 255, 0.2);
                    border: 2px solid rgba(0, 255, 255, 0.5);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(0, 255, 255, 0.8);
                    font-size: 24px;
                    pointer-events: auto;
                }
                
                .control-pad.active {
                    background: rgba(255, 0, 255, 0.3);
                    border-color: rgba(255, 0, 255, 0.8);
                }
                
                .control-button.active {
                    background: rgba(0, 255, 255, 0.3);
                    border-color: rgba(0, 255, 255, 0.8);
                }
            `;
            document.head.appendChild(style);
            
            console.log("Mobile controls created successfully");
        } catch (error) {
            console.error("Error creating mobile controls:", error);
        }
    }
    
    updateMobileControlsVisibility() {
        try {
            const controls = document.getElementById('mobile-controls');
            if (controls) {
                controls.style.display = this.isMobile ? 'block' : 'none';
            }
        } catch (error) {
            console.error("Error updating mobile controls visibility:", error);
        }
    }
    
    handleMovementTouch(touch) {
        try {
            if (!this.isMobile || !touch) return;
            
            const pad = document.getElementById('movement-pad');
            if (!pad) return;
            
            const rect = pad.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Calculate direction from center of pad
            const deltaX = touch.clientX - centerX;
            const deltaY = touch.clientY - centerY;
            
            // Check if the keys object exists
            if (!this.keys) {
                this.keys = {
                    forward: false,
                    backward: false,
                    left: false,
                    right: false
                };
            }
            
            // Normalize the deltas
            const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            if (length < 10) {
                // If touch is very close to center, don't move
                this.resetMovementControls();
                return;
            }
            
            const normalizedX = deltaX / length;
            const normalizedY = deltaY / length;
            
            // Set movement based on touch position
            this.keys.forward = normalizedY < -0.3;
            this.keys.backward = normalizedY > 0.3;
            this.keys.left = normalizedX < -0.3;
            this.keys.right = normalizedX > 0.3;
        } catch (error) {
            console.error("Error handling movement touch:", error);
            this.resetMovementControls();
        }
    }
    
    resetMovementControls() {
        try {
            if (!this.keys) return;
            
            this.keys.forward = false;
            this.keys.backward = false;
            this.keys.left = false;
            this.keys.right = false;
        } catch (error) {
            console.error("Error resetting movement controls:", error);
        }
    }
    
    setupTouchListeners() {
        // Track touch state
        let touchControls = {
            up: false,
            down: false,
        }
        
        // Update mobile UI when window resizes
        window.addEventListener('resize', () => {
            this.updateMobileUI();
        }, { passive: true });
    }
    
    // Simplified handler for WebGL context restoration
    reinitializeAfterContextLoss() {
        // This simplified method is left for compatibility
        // The actual handling is now done in the context restored event listener
        console.log("Context loss handling moved to event listener");
    }

    initHUD() {
        console.log("Initializing HUD");
        
        // Instead of creating new elements, just get references to existing UI elements
        const healthDiv = document.getElementById('health');
        const scoreDiv = document.getElementById('score');
        const ammoDiv = document.getElementById('ammo');
        
        // Store references for updates
        this.scoreDisplay = scoreDiv;
        this.ammoDisplay = ammoDiv;
        
        // Update with initial values
        if (healthDiv) healthDiv.textContent = `HEALTH: ${this.health}%`;
        if (scoreDiv) scoreDiv.textContent = `SCORE: ${this.score}`;
        if (ammoDiv) ammoDiv.textContent = `AMMO: 0/0`;
    }

    animate() {
        this.__clearedThisFrame = false; // Reset for each frame
        requestAnimationFrame(() => this.animate());
        
        if (!this.isInitialized) return;
        
        try {
            // Performance monitoring
            if (this.stats) this.stats.begin();
            
            // Calculate delta time for stable physics
            const now = performance.now();
            let deltaTime = 0;
            if (this.lastUpdateTime) {
                deltaTime = (now - this.lastUpdateTime) / 1000;
                if (deltaTime > 0.1) deltaTime = 0.1; // Cap delta time
            }
            this.lastUpdateTime = now;
            
            // FPS calculation
            this.frameCount++;
            if (now - this.lastFpsUpdate > this.fpsUpdateInterval) {
                this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
                this.lastFpsUpdate = now;
                this.frameCount = 0;
            }
            
            // Game logic updates
            this.update(deltaTime);
            
            // Render with proper error handling
            if (this.renderer && this.scene && this.camera) {
                try {
                    // Fix for WebGL "must have element array buffer bound" error
                    this.fixWebGLBufferState();
                    
                    // Standard rendering
                    this.renderer.render(this.scene, this.camera);
                } catch (renderError) {
                    console.warn("Render error caught:", renderError);
                    
                    // Try to recover by fixing WebGL state and rendering with simplified scene
                    this.recoverFromRenderError();
                }
            }
            
            // Performance monitoring end
            if (this.stats) this.stats.end();
        } catch (e) {
            console.error("Error in animation loop:", e);
        }
    }
    
    // Add this method to fix WebGL buffer state
    fixWebGLBufferState() {
        try {
            // Get the WebGL renderer context
            const gl = this.renderer.getContext();
            if (!gl) return;

            // STEP 1: Fix all scene geometries to ensure they have appropriate buffers
            this.scene.traverse(obj => {
                if (obj.isMesh && obj.geometry) {
                    // Skip if already processed
                    if (obj.__buffersFixed) return;
                    
                    try {
                        // 1. Ensure index buffer exists and has sufficient size
                        if (!obj.geometry.index && obj.geometry.attributes.position) {
                            const posCount = obj.geometry.attributes.position.count;
                            // Create indices with extra capacity (20% more than needed)
                            const indices = [];
                            for (let i = 0; i < posCount; i++) {
                                indices.push(i);
                            }
                            // Add the index buffer
                            obj.geometry.setIndex(indices);
                        }
                        
                        // 2. Ensure position attribute has correct itemSize to prevent buffer issues
                        if (obj.geometry.attributes.position) {
                            const posAttr = obj.geometry.attributes.position;
                            if (posAttr.itemSize !== 3) {
                                console.warn(`Fixing position attribute itemSize from ${posAttr.itemSize} to 3`);
                                // Clone and reshape attribute to ensure correct size
                                const positions = new Float32Array(posAttr.array);
                                obj.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                            }
                            
                            // Ensure sufficient buffer size by padding if necessary
                            const expectedSize = posAttr.count * posAttr.itemSize;
                            if (posAttr.array.length < expectedSize) {
                                console.warn(`Expanding position buffer from ${posAttr.array.length} to ${expectedSize}`);
                                const newArray = new Float32Array(expectedSize);
                                // Copy existing data
                                newArray.set(posAttr.array);
                                // Create new attribute with sufficient size
                                obj.geometry.setAttribute('position', new THREE.BufferAttribute(newArray, posAttr.itemSize));
                            }
                        }
                        
                        // 3. Check and fix all other attributes
                        for (const key in obj.geometry.attributes) {
                            if (key === 'position') continue; // Already handled
                            
                            const attr = obj.geometry.attributes[key];
                            if (!attr) continue;
                            
                            // Ensure sufficient size
                            const expectedSize = attr.count * attr.itemSize;
                            if (attr.array.length < expectedSize) {
                                console.warn(`Expanding ${key} buffer from ${attr.array.length} to ${expectedSize}`);
                                const newArray = new Float32Array(expectedSize);
                                newArray.set(attr.array);
                                obj.geometry.setAttribute(key, new THREE.BufferAttribute(newArray, attr.itemSize));
                            }
                        }
                        
                        // 4. Force updates
                        if (obj.geometry.index) obj.geometry.index.needsUpdate = true;
                        for (const key in obj.geometry.attributes) {
                            obj.geometry.attributes[key].needsUpdate = true;
                        }
                        
                        // Mark as processed
                        obj.__buffersFixed = true;
                    } catch (e) {
                        console.error("Failed to fix geometry buffers:", e);
                    }
                }
            });
            
            // STEP 2: Create global oversized buffers to handle any rendering call
            if (!this._globalBuffers) {
                try {
                    // Create a structure to hold our global buffers
                    this._globalBuffers = {
                        // For vertex positions - extremely large to handle any mesh
                        vertexBuffer: gl.createBuffer(),
                        // For indices - also very large
                        indexBuffer: gl.createBuffer(),
                        // For normals
                        normalBuffer: gl.createBuffer(),
                        // For UVs
                        uvBuffer: gl.createBuffer(),
                        // Buffer sizes (number of elements)
                        vertexSize: 10000000,  // 10M vertices (x3 components)
                        indexSize: 2000000,    // 2M indices
                        normalSize: 10000000,  // Same as vertex
                        uvSize: 6000000        // 3M UV coordinates
                    };
                    
                    // Initialize all buffers with properly sized arrays
                    
                    // 1. Vertex buffer (ARRAY_BUFFER)
                    gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.vertexBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, 
                        new Float32Array(this._globalBuffers.vertexSize), 
                        gl.DYNAMIC_DRAW);
                    
                    // 2. Index buffer (ELEMENT_ARRAY_BUFFER)
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._globalBuffers.indexBuffer);
                    const indices = new Uint32Array(this._globalBuffers.indexSize);
                    // Fill with sequential values
                    for (let i = 0; i < this._globalBuffers.indexSize; i++) {
                        indices[i] = i;
                    }
                    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
                    
                    // 3. Normal buffer (ARRAY_BUFFER)
                    gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.normalBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, 
                        new Float32Array(this._globalBuffers.normalSize), 
                        gl.DYNAMIC_DRAW);
                    
                    // 4. UV buffer (ARRAY_BUFFER)
                    gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.uvBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, 
                        new Float32Array(this._globalBuffers.uvSize), 
                        gl.DYNAMIC_DRAW);
                    
                    console.log("Created global oversized WebGL buffers");
                } catch (e) {
                    console.error("Failed to create global buffers:", e);
                }
            }
            
            // STEP 3: Set up vertex attribute pointers
            try {
                // Bind our oversized vertex buffer
                gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.vertexBuffer);
                // Set up attribute pointer for position (location 0)
                gl.enableVertexAttribArray(0);
                gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
                
                // Bind our oversized normal buffer
                gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.normalBuffer);
                // Set up attribute pointer for normal (location 1)
                gl.enableVertexAttribArray(1);
                gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
                
                // Bind our oversized UV buffer
                gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.uvBuffer);
                // Set up attribute pointer for UV (location 2)
                gl.enableVertexAttribArray(2);
                gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
                
                // Always bind the index buffer at the end
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._globalBuffers.indexBuffer);
            } catch (e) {
                console.error("Failed to set up attribute pointers:", e);
            }
            
            // STEP 4: Override THREE.js buffer binding to ensure our buffers are used
            if (!this._bufferOverridesInstalled) {
                try {
                    // Get original WebGLRenderer methods
                    const originalSetupVertexAttributes = this.renderer.state.setupVertexAttributes;
                    const originalRenderBufferDirect = this.renderer.renderBufferDirect;
                    
                    // Override setup attributes method
                    this.renderer.state.setupVertexAttributes = (object, material, program, geometry) => {
                        // First try the original method
                        try {
                            originalSetupVertexAttributes.call(this.renderer.state, object, material, program, geometry);
                        } catch (e) {
                            console.warn("Original attribute setup failed, using fallback:", e);
                            // If it fails, bind our global buffers again
                            this.setupFallbackAttributes(gl);
                        }
                        
                        // Always ensure element array buffer is bound at the end
                        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._globalBuffers.indexBuffer);
                    };
                    
                    // Mark as installed
                    this._bufferOverridesInstalled = true;
                    console.log("WebGL buffer overrides installed");
                } catch (e) {
                    console.error("Failed to install buffer overrides:", e);
                }
            }
            
            // STEP 5: Reset renderer state and clear
            this.renderer.state.reset();
            this.renderer.clear();
            
        } catch (e) {
            console.error("WebGL buffer fix error:", e);
        }
    }
    
    // Add a helper method to set up fallback attributes
    setupFallbackAttributes(gl) {
        if (!this._globalBuffers) return;
        
        try {
            // Bind position buffer and set attribute pointer
            gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.vertexBuffer);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            
            // Bind normal buffer and set attribute pointer
            gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.normalBuffer);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
            
            // Bind UV buffer and set attribute pointer
            gl.bindBuffer(gl.ARRAY_BUFFER, this._globalBuffers.uvBuffer);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
            
            // Bind index buffer
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._globalBuffers.indexBuffer);
        } catch (e) {
            console.error("Failed to set up fallback attributes:", e);
        }
    }
    
    // Enhance the recovery method for serious WebGL errors
    recoverFromRenderError() {
        console.log("WebGL error detected - attempting recovery");
        
        try {
            // Get context
            const gl = this.renderer.getContext();
            if (!gl) return;
            
            // Complete state reset - unbind everything
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            
            // Create much larger buffers to handle any potential rendering
            // This addresses the "insufficient buffer size" error
            const createLargeBuffer = (target, size) => {
                const buffer = gl.createBuffer();
                gl.bindBuffer(target, buffer);
                
                // For ELEMENT_ARRAY_BUFFER use Uint16Array, for others use Float32Array
                const array = (target === gl.ELEMENT_ARRAY_BUFFER) 
                    ? new Uint16Array(size)
                    : new Float32Array(size);
                
                // Fill with safe values
                if (target === gl.ELEMENT_ARRAY_BUFFER) {
                    for (let i = 0; i < size; i++) {
                        array[i] = i % 65535;
                    }
                }
                
                // Use DYNAMIC_DRAW to hint we'll update this buffer frequently
                gl.bufferData(target, array, gl.DYNAMIC_DRAW);
                return buffer;
            };
            
            // Create oversized buffers to handle any rendering
            const vertexBuffer = createLargeBuffer(gl.ARRAY_BUFFER, 1000000); // 1M entries 
            const indexBuffer = createLargeBuffer(gl.ELEMENT_ARRAY_BUFFER, 500000); // 500k indices
            
            // Necessary WebGL setup for attributes
            gl.enableVertexAttribArray(0); // Position attribute
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            
            // Force renderer state reset
            this.renderer.state.reset();
            
            // Simplify scene for a moment
            const existingScene = this.scene;
            const existingCamera = this.camera;
            
            // Create a minimal scene for reset
            const tempScene = new THREE.Scene();
            const tempCamera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 10);
            tempCamera.position.z = 5;
            
            // Add minimal content to force a proper rendering cycle
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );
            tempScene.add(cube);
            
            // Render minimal scene with lowest settings
            this.renderer.shadowMap.enabled = false;
            this.renderer.toneMapping = THREE.NoToneMapping;
            
            // Attempt minimal render
            try {
                this.renderer.render(tempScene, tempCamera);
            } catch (renderErr) {
                console.warn("Recovery render failed:", renderErr);
            }
            
            // Restore original scene with safety checks
            if (existingScene && existingCamera) {
                // Retry with minimal settings
                try {
                    this.renderer.render(existingScene, existingCamera);
                    console.log("WebGL recovery successful");
                } catch (finalErr) {
                    console.error("Failed to recover WebGL context:", finalErr);
                }
            }
        } catch (e) {
            console.error("WebGL recovery attempt failed:", e);
        }
    }

    // Prepare the WebGL context for rendering to prevent uniform/buffer errors
    prepareWebGLForRendering() {
        // Only proceed if we have a valid renderer
        if (!this.renderer || !this.scene) return;
        
        try {
            // Use a much lighter approach - don't manipulate materials frequently
            if (!this._didSimplifyMaterials && this.scene) {
                console.log("Applying simplified materials for better performance");
                
                // Only do this material conversion once per session - not on every frame 
                this._didSimplifyMaterials = true;
                
                // Create a whitelist of geometry and material combinations that work well
                const workingMaterials = new Map();
                
                this.scene.traverse(obj => {
                    if (obj.isMesh && obj.material) {
                        // Create a simplified material only once
                        if (!obj.__materialSimplified) {
                            try {
                                // Create a simpler material (for desktop browsers with WebGL issues)
                                const newMaterial = new THREE.MeshBasicMaterial({
                                    color: obj.material.color ? obj.material.color.clone() : 0xffffff,
                                    map: obj.material.map || null,
                                    transparent: obj.material.transparent || false,
                                    opacity: obj.material.opacity || 1.0,
                                    wireframe: obj.material.wireframe || false, 
                                    side: THREE.DoubleSide // Ensure double-sided rendering
                                });
                                
                                // Store original material for reference
                                obj.__originalMaterial = obj.material;
                                obj.material = newMaterial;
                                obj.__materialSimplified = true;
                                
                                // Add to working materials for reuse
                                workingMaterials.set(obj.uuid, newMaterial);
                            } catch (matErr) {
                                console.warn("Error simplifying material:", matErr);
                            }
                        }
                    }
                });
            }
            
            // Just reset renderer state without manipulating geometry or buffers
            this.renderer.state.reset();
        } catch (e) {
            console.error("Error in prepareWebGLForRendering:", e);
        }
    }
    
    // Simplified update renderer settings
    updateRendererSettings() {
        if (!this.renderer) return;
        
        try {
            // Basic settings for compatibility
            this.renderer.shadowMap.enabled = false;
            this.renderer.toneMapping = THREE.NoToneMapping;
            
            // Set low quality rendering for all devices temporarily
            this.renderer.setPixelRatio(1);
        } catch (e) {
            console.error("Error updating renderer settings:", e);
        }
    }

    // Simplified WebGL Error-Resilient Material Creator
    createErrorResilientMaterial(options = {}) {
        // Default to basic material which has fewer uniforms and simpler shaders
        const type = options.type || 'basic';
        let material;
        
        try {
            switch (type.toLowerCase()) {
                case 'phong':
                    material = new THREE.MeshBasicMaterial({
                        color: options.color || 0xffffff,
                        wireframe: options.wireframe || false,
                        transparent: options.transparent || false,
                        opacity: options.opacity || 1.0,
                        side: options.side || THREE.FrontSide
                    });
                    break;
                    
                case 'standard':
                    material = new THREE.MeshBasicMaterial({
                        color: options.color || 0xffffff,
                        wireframe: options.wireframe || false,
                        transparent: options.transparent || false,
                        opacity: options.opacity || 1.0,
                        side: options.side || THREE.FrontSide
                    });
                    break;
                    
                case 'basic':
                default:
                    material = new THREE.MeshBasicMaterial({
                        color: options.color || 0xffffff,
                        wireframe: options.wireframe || false,
                        transparent: options.transparent || false,
                        opacity: options.opacity || 1.0,
                        side: options.side || THREE.FrontSide
                    });
                    break;
            }
            
            // Always set this flag for new materials
            material.needsUpdate = true;
            
            return material;
        } catch (e) {
            console.error("Error creating material:", e);
            // Absolute fallback for error cases
            return new THREE.MeshBasicMaterial({ color: 0xff00ff });
        }
    }

    // Helper method for creating meshes with error-resilient WebGL handling
    createErrorResilientMesh(geometry, materialOptions = {}, position = { x: 0, y: 0, z: 0 }) {
        // Create a material that won't cause WebGL errors
        const material = this.createErrorResilientMaterial(materialOptions);
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        
        // Set position
        mesh.position.set(position.x, position.y, position.z);
        
        // Add to scene
        if (this.scene) {
            this.scene.add(mesh);
        }
        
        return mesh;
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
                    // DAMAGE GUARANTEE: Check for projectile collisions
                    // Check 4 positions along the projectile path to ensure hits aren't missed
                    let hitDetected = this.checkProjectileCollisions(projectile);
                    
                    // Only do additional checks if no hit was detected and we're in multiplayer
                    if (!hitDetected && this.multiplayer && window.multiplayerEnabled && projectile.source === 'player') {
                        // Store original position
                        const originalPos = projectile.mesh.position.clone();
                        
                        // Check points both ahead and behind to catch fast-moving projectiles
                        // This ensures we don't miss hits due to position updates
                        const checkPoints = [
                            // Behind current position (in case we passed through a target)
                            new THREE.Vector3(
                                originalPos.x - projectile.direction.x * 5,
                                originalPos.y - projectile.direction.y * 5,
                                originalPos.z - projectile.direction.z * 5
                            ),
                            // Ahead of current position (to catch hits before they happen)
                            new THREE.Vector3(
                                originalPos.x + projectile.direction.x * 5,
                                originalPos.y + projectile.direction.y * 5,
                                originalPos.z + projectile.direction.z * 5
                            ),
                            // Further ahead (to catch hits that would happen in the next frame)
                            new THREE.Vector3(
                                originalPos.x + projectile.direction.x * 10,
                                originalPos.y + projectile.direction.y * 10,
                                originalPos.z + projectile.direction.z * 10
                            )
                        ];
                        
                        // Check each point
                        for (let j = 0; j < checkPoints.length; j++) {
                            // Temporarily move projectile to check position
                            projectile.mesh.position.copy(checkPoints[j]);
                            
                            // Check for hits at this position
                            if (this.checkProjectileCollisions(projectile)) {
                                hitDetected = true;
                                break;
                            }
                        }
                        
                        // Restore original position if no hit was detected
                        if (!hitDetected) {
                            projectile.mesh.position.copy(originalPos);
                        }
                    }
                }
            }
        }
    }

    // UNIFIED DAMAGE SYSTEM - handles all damage in the game
    applyDamage(damage, source = 'unknown', sourceId = null) {
        console.log(`🩸🩸🩸 APPLYING DAMAGE: ${damage} from ${source} (${sourceId})`);
        
        // CRITICAL: Ensure damage is always at least 20 for visibility
        damage = Math.max(damage, 20);
        
        // STEP 1: CORE HEALTH REDUCTION - This is the fundamental operation
        this.health = Math.max(0, this.health - damage);
        
        // STEP 2: UI UPDATES - Ensure all UI elements reflect damage
        // Update HTML health display
        const healthDiv = document.getElementById('health');
        if (healthDiv) {
            healthDiv.textContent = `HEALTH: ${this.health}%`;
            
            // Add visual flash to health text
            const originalColor = healthDiv.style.color || 'white';
            healthDiv.style.color = 'red';
            setTimeout(() => { healthDiv.style.color = originalColor; }, 300);
        }
        
        // Update health bar with window function
        if (window.updateStatBars) {
            window.updateStatBars(this.health, this.weapon?.ammo, this.weapon?.maxAmmo);
        }
        
        // STEP 3: VISUAL EFFECTS - Multiple visual indicators of damage
        // Flash screen red (more intense for larger damage)
        const opacity = Math.min(0.7, 0.3 + (damage / 100) * 0.4);
        this.flashScreen(`rgba(255, 0, 0, ${opacity})`);
        
        // Shake camera proportional to damage
        this.shakeCamera(damage * 0.1);
        
        // Add blood splatter effect (if available)
        if (typeof this.createBloodEffect === 'function') {
            this.createBloodEffect(this.truck.position);
        }
        
        // STEP 4: AUDIO FEEDBACK - Ensure damage is heard
        // Play hit sound
        if (window.audioManager) {
            window.audioManager.playSound('vehicle_hit', this.truck.position);
        }
        
        // STEP 5: TRUCK VISUALS - Update the vehicle appearance
        // Apply damage to monster truck if it exists
        if (this.truck && typeof this.truck.applyDamage === 'function') {
            this.truck.applyDamage(damage);
        }
        
        // STEP 6: MULTIPLAYER SYNC - Ensure damage is synced to other players
        // Sync damage to multiplayer if in multiplayer mode and this is a local hit
        if (this.multiplayer && window.multiplayerEnabled && source !== 'server') {
            this.multiplayer.syncLocalDamage(damage, source, sourceId);
        }
        
        // STEP 7: GAME STATE VALIDATION - Check for death and make a message
        // Show notification
        const damageLevel = damage < 30 ? 'light' : (damage < 60 ? 'moderate' : 'critical');
        const sourceText = source === 'wall' ? 'wall collision' : 
                           source === 'turret' ? 'turret fire' : 
                           source === 'player' ? 'player attack' : 'damage';
        
        this.showNotification(`Took ${damageLevel} damage from ${sourceText}!`, 'error');
        
        // Check if player died
        if (this.health <= 0) {
            console.log(`🩸🩸🩸 PLAYER DIED from ${source} damage!`);
            this.gameOver();
            
            // Notify multiplayer
            if (this.multiplayer && window.multiplayerEnabled) {
                this.multiplayer.reportLocalPlayerDeath(sourceId);
            }
        }
        
        // Return the new health value
        return this.health;
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
        // REMOVED: Multiplayer hit check logic, including aggressive checks.
        // This responsibility is moved to Multiplayer.js.
        /*
        if (this.multiplayer && window.multiplayerEnabled && 
            (projectile.source === 'player' || projectile.playerId === this.multiplayer.localPlayerId)) {
            
            console.log("🎯 CHECKING PROJECTILE FOR MULTIPLAYER HITS:", projectile);
            
            // First ensure the projectile has our localPlayerId for proper hit detection
            if (!projectile.playerId) {
                projectile.playerId = this.multiplayer.localPlayerId;
            }
            
            // ULTRA-AGGRESSIVE APPROACH: Always check for hits with every projectile update
            // First, let the multiplayer component check for hits normally
            let hitDetected = this.multiplayer.checkProjectileHits(projectile);
            console.log("🎯 Regular hit detection result:", hitDetected);
            
            // CRITICAL FIX: Add second aggressive hit detection
            // If no hit was detected normally, directly check against each player
            if (!hitDetected && this.multiplayer.players && this.multiplayer.players.size > 0) {
                console.log("🎯 SECONDARY CHECK - Force checking nearby players");
                
                // Get all other players
                this.multiplayer.players.forEach((player, playerId) => {
                    // Skip our own player
                    if (playerId === this.multiplayer.localPlayerId) return;
                    
                    // Skip players without meshes
                    if (!player.truckMesh) return;
                    
                    // Check if projectile is close to this player (VERY generous distance)
                    const distance = projectile.mesh.position.distanceTo(player.truckMesh.position);
                    console.log(`🎯 Distance to player ${playerId}: ${distance}`);
                    
                    // GUARANTEED HIT: If projectile is within 20 units, force a hit
                    if (distance < 20) {
                        console.log(`🎯 FORCE HIT on player ${playerId}! Distance: ${distance}`);
                        
                        // Send hit to server multiple times for reliability
                        for (let i = 0; i < 3; i++) {
                            this.multiplayer.sendPlayerHit(playerId, 50, this.multiplayer.localPlayerId);
                        }
                        
                        // Apply massive damage directly for immediate visual feedback
                        const damage = 50;
                        player.health = Math.max(0, player.health - damage);
                        
                        if (player.monsterTruck) {
                            player.monsterTruck.health = player.health;
                        }
                        
                        // Create visual effects
                        this.multiplayer.showDamageEffect(player.truckMesh.position.clone());
                        
                        // Update health bar immediately
                        this.multiplayer.updatePlayerHealthBar(player);
                        
                        // Set hit detected flag
                        hitDetected = true;
                        
                        // Show notification
                        this.multiplayer.showNotification(`Hit on ${player.nickname || 'opponent'}!`, 'success');
                    }
                });
            }
            
            // If a hit was detected through either method, disable the projectile
            if (hitDetected) {
                console.log("🎯 HIT DETECTED! Destroying projectile");
                projectile.alive = false;
                projectile.hide();
                return true; // Signal that we processed a hit
            }
        }
        */
        
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
        // Always create grid helper with more divisions for high quality
        if (this.gridEnabled) {
            this.gridHelper = new THREE.GridHelper(1560, 20); // Higher quality with more divisions
            this.scene.add(this.gridHelper);
        }
    }

    // Debug methods removed - keeping empty stubs for compatibility
    enableDebugLogs() {}
    updateDebugInfo() {}
    toggleDebugMode() {}

    // Helper method to properly dispose and clean up resources
    disposeResources() {
        // Only run if this.scene exists
        if (!this.scene) return;
        
        console.log("Disposing Three.js resources...");
        
        // Traverse the scene to dispose geometries and materials
        this.scene.traverse((object) => {
            // Check for meshes to dispose materials and geometries
            if (object.isMesh) {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                
                // Handle materials (could be an array or a single material)
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });
        
        // Clear object pools
        if (this.objectPools) {
            this.objectPools.clear();
        }
        
        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.forceContextLoss) {
                this.renderer.forceContextLoss();
            }
            this.renderer = null;
        }
        
        console.log("Resources disposed successfully");
    }

    // Restore the createTurrets method that was accidentally removed
    createTurrets() {
        // Create turrets at random positions in the arena
        const arenaSize = 1200; // 2x the original game area size
        const minDistanceFromCenter = 240; // Adjusted for larger arena
        const numTurrets = 4; // Keep the same number of turrets
        
        // Define turret types with cyberpunk/synthwave colors
        const turretTypes = [
            {
                name: "Standard",
                color: 0x00ffff, // Cyan base color
                activeColor: 0xff00ff, // Magenta active color
                warningColor: 0xff8800, // Orange warning color
                health: 5,
                damage: 10,
                fireRate: 180,
                projectileSpeed: 4.5, // Adjusted for larger arena
                rotationSpeed: 0.015,
                scale: 15 // 1.5x bigger (original was 10)
            },
            {
                name: "Heavy",
                color: 0x0088ff, // Blue base color
                activeColor: 0xff00ff, // Magenta active color
                warningColor: 0xff8800, // Orange warning color
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
            
            // Create turret with type
            const turret = new Turret(position, this.scene, turretType);
            
            // Use shorter activation delay (120-240 frames instead of 240-600)
            turret.activationDelay = Math.floor(Math.random() * 120) + 120;
            
            this.turrets.push(turret);
        }
    }
    
    // Also restore the updateTurrets method
    updateTurrets() {
        // Track if any turrets activated this frame
        let newActivations = 0;
        
        // Update each turret
        for (let i = 0; i < this.turrets.length; i++) {
            const turret = this.turrets[i];
            if (!turret) continue;
            
            // Check if turret is about to activate
            const wasActive = turret.activated;
            
            // Pass player position
            if (this.truck) {
                turret.update(this.truck.position);
            }
            
            // Check if turret just activated
            if (!wasActive && turret.activated) {
                newActivations++;
                // Show notification when a turret activates to alert the player
                this.showNotification('Turret activated!', 'warning');
            }
        }
        
        // Show notification if turrets activated
        if (newActivations === 1) {
            this.showNotification("Warning: Turret activated!", 2000);
        } else if (newActivations > 1) {
            this.showNotification(`Warning: ${newActivations} turrets activated!`, 2000);
        }
    }
    
    // Restore the missing createWeapon method
    createWeapon() {
        // Create a weapon for the player using the WeaponTypes from the imported Weapons.js
        this.weapon = new Weapon(this, this.scene, WeaponTypes.MACHINE_GUN);
        
        // Add a simple weapon model attached to the truck
        const weaponGeometry = new THREE.BoxGeometry(0.3, 0.3, 1);
        const weaponMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00ffff,
            emissive: 0x005555
        });
        
        this.weaponMesh = new THREE.Mesh(weaponGeometry, weaponMaterial);
        this.weaponMesh.position.set(0, 0.5, -1); // Mount on front of truck
        
        // Add weapon to truck if truck exists
        if (this.truck) {
            this.truck.add(this.weaponMesh);
        } else {
            console.warn("Truck not available, weapon will not be attached");
            this.scene.add(this.weaponMesh);
        }
        
        // Update ammo display
        if (this.ammoDisplay) {
            this.ammoDisplay.textContent = `Ammo: ${this.weapon.ammo}/${this.weapon.maxAmmo}`;
        }
        
        console.log("Weapon created successfully");
        return this.weapon;
    }

    // Restore the missing update method
    update(deltaTime = 1/60) {
        // Skip update if game over
        if (this.isGameOver) return;
        
        // Basic update for truck movement
        if (!this.truck) return;
        
        // Process keyboard/touch input for truck movement
        const accelerating = this.keys['ArrowUp'] || this.keys['forward'];
        const braking = this.keys['ArrowDown'] || this.keys['backward'];
        const turningLeft = this.keys['ArrowLeft'] || this.keys['left'];
        const turningRight = this.keys['ArrowRight'] || this.keys['right'];
        const shooting = this.keys[' '] || this.keys['shoot'];
        
        // Throttle updates for better performance
        const updateAll = this.frameCount % 2 === 0; // Update non-essential items at half rate
        
        // Process keyboard input for more realistic driving
        const acceleration = 0.008; // Balanced between original 0.01 and slower 0.006
        const deceleration = 0.98; // Friction
        const maxSpeed = 0.9; // Changed from 0.5 to 0.9
        const turnSpeed = 0.05; // Changed from 0.03 to 0.05
        
        // Initialize steering angle if not present
        if (this.truck.steeringAngle === undefined) {
            this.truck.steeringAngle = 0;
        }
        
        // Maximum steering angle in radians (about 30 degrees)
        const maxSteeringAngle = 0.13;
        // How quickly steering centers when not turning
        const steeringReturnSpeed = 0.09;
        // How quickly steering responds to input
        const steeringResponseSpeed = 0.09;
        
        // Calculate the truck's forward direction based on its rotation
        const direction = new THREE.Vector3();
        direction.z = Math.cos(this.truck.rotation.y);
        direction.x = Math.sin(this.truck.rotation.y);
        
        // Acceleration/braking
        if (accelerating) {
            this.truck.velocity += acceleration;
            if (this.truck.velocity > maxSpeed) {
                this.truck.velocity = maxSpeed;
            }
        } else if (braking) {
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
        if (turningLeft) {
            // Gradually increase steering angle
            this.truck.steeringAngle = Math.max(
                -maxSteeringAngle,
                this.truck.steeringAngle - steeringResponseSpeed
            );
        } else if (turningRight) {
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
        if (this.animateWheelTurn) {
            if (this.truck.steeringAngle !== 0) {
                // The steering angle direction is already correct, so we pass it directly
                this.animateWheelTurn(-this.truck.steeringAngle / maxSteeringAngle);
            } else if (this.resetWheels) {
                this.resetWheels();
            }
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
            if (wallCollision && typeof this.applyCollisionDamage === 'function') {
                this.applyCollisionDamage();
                if (typeof this.showCollisionEffect === 'function') {
                    this.showCollisionEffect(newPosition);
                }
            }
        }
        
        // Apply final position
        this.truck.position.copy(newPosition);
        
        // Animate wheels rolling based on speed
        if (typeof this.animateWheelRoll === 'function') {
            this.animateWheelRoll(this.truck.velocity);
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
            
            // Update speedometer - calculate speed in MPH (arbitrary multiplier for game feel)
            const speedMph = Math.abs(Math.round(this.truck.velocity * 100));
            const speedDisplay = document.getElementById('speed');
            if (speedDisplay) {
                speedDisplay.textContent = `SPEED: ${speedMph} MPH`;
            }
            
            // Update score display if score has changed
            if (this.scoreDisplay) {
                this.scoreDisplay.textContent = `SCORE: ${this.score}`;
            }
            
            // Also update the DOM element for score
            const scoreElement = document.getElementById('score');
            if (scoreElement) {
                scoreElement.textContent = `SCORE: ${this.score}`;
            }
        }
        
        // Handle shooting
        if (shooting && this.weapon) {
            const truckDirection = new THREE.Vector3(
                Math.sin(this.truck.rotation.y),
                0,
                Math.cos(this.truck.rotation.y)
            );
            
            // Get position at the front of the truck
            const weaponPosition = this.weaponMesh.getWorldPosition(new THREE.Vector3());
            
            // Fire the weapon
            const projectiles = this.weapon.shoot(weaponPosition, truckDirection, 'player');
            
            // Notify multiplayer system of new projectiles for network sync
            if (this.multiplayer && window.multiplayerEnabled && projectiles && projectiles.length > 0) {
                // Make sure projectiles have correct source
                projectiles.forEach(projectile => {
                    // Force source to be 'player' for reliable hit detection
                    projectile.source = 'player';
                    projectile.playerId = this.multiplayer.localPlayerId;
                    
                    this.multiplayer.sendProjectileCreated(projectile);
                });
            }
        }
        
        // Handle reload
        if ((this.keys['r'] || this.keys['R']) && this.weapon && !this.weapon.isReloading && this.weapon.ammo < this.weapon.maxAmmo) {
            // Start reload
            this.weapon.reload();
            
            // Show reloading notification
            if (typeof this.showNotification === 'function') {
                this.showNotification("Reloading...");
            }
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
        if (updateAll && typeof this.updateTurrets === 'function') {
            this.updateTurrets();
        }
        
        // Update powerups with throttled frequency
        if (updateAll && typeof this.updatePowerups === 'function') {
            this.updatePowerups();
            
            // Check for powerup spawning
            if (this.powerupSpawnTimer !== undefined) {
                this.powerupSpawnTimer++;
                if (this.powerupSpawnTimer >= this.powerupSpawnInterval) {
                    if (typeof this.spawnRandomPowerup === 'function') {
                        this.spawnRandomPowerup();
                    }
                    this.powerupSpawnTimer = 0;
                }
            }
        }
        
        // Check for projectile hits
        if (typeof this.checkProjectileHits === 'function') {
            this.checkProjectileHits();
        }
        
        // Check for player projectile hits on turrets
        if (typeof this.checkPlayerProjectileHits === 'function') {
            this.checkPlayerProjectileHits();
        }
        
        // Check for powerup collection
        if (typeof this.checkPowerupCollection === 'function') {
            this.checkPowerupCollection();
        }
        
        // Update multiplayer system
        if (this.multiplayer && window.multiplayerEnabled) {
            this.multiplayer.update();
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
    
    // Check for mobile devices
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Enable multiplayer for all devices
    window.multiplayerEnabled = true;
    localStorage.setItem('monsterTruckMultiplayer', 'true');
    console.log("Multiplayer enabled for all devices");
    
    // Check for WebGL support before proceeding
    const checkWebGLSupport = () => {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return gl !== null;
        } catch (e) {
            return false;
        }
    };
    
    // If WebGL is not supported, show error message
    if (!checkWebGLSupport()) {
        if (loadingElement) {
            loadingElement.innerHTML = '<div class="loading-text">Your device does not support WebGL, which is required to run this game.</div>';
        }
        console.error("WebGL not supported on this device");
        return;
    }
    
    // Ensure Stats is defined for mobile devices
    if (typeof Stats === 'undefined') {
        // Create a dummy Stats object to prevent errors
        window.Stats = function() {
            return {
                dom: document.createElement('div'),
                begin: function() {},
                end: function() {}
            };
        };
        console.log("Created dummy Stats object for mobile compatibility");
    }
    
    const preloader = new AssetPreloader(() => {
        console.log("Assets preloaded, creating game");
        
        // For mobile devices, modify loading text to inform user
        if (isMobile) {
            if (loadingElement) {
                const loadingText = loadingElement.querySelector('.loading-text');
                if (loadingText) {
                    loadingText.innerHTML = 'INITIALIZING ARENA<br><small>This may take a moment on mobile devices</small>';
                }
            }
        }
        
        try {
            // Create game with a callback for when it's fully loaded
            window.game = new Game((success) => {
                console.log("Game initialization complete, success:", success);
                
                if (success) {
                    // Game initialized successfully
                    if (loadingElement) {
                        loadingElement.style.display = 'none';
                    }
                } else {
                    // Game failed to initialize properly
                    if (loadingElement) {
                        const loadingText = loadingElement.querySelector('.loading-text');
                        if (loadingText) {
                            loadingText.innerHTML = 'INITIALIZATION ERROR<br><small>Please try refreshing the page</small>';
                            loadingText.style.color = 'red';
                        }
                    }
                }
            });
        } catch (e) {
            console.error("Failed to create game:", e);
            if (loadingElement) {
                const loadingText = loadingElement.querySelector('.loading-text');
                if (loadingText) {
                    loadingText.innerHTML = `ERROR: ${e.message}<br><small>Please try a different browser</small>`;
                    loadingText.style.color = 'red';
                }
            }
        }
    });
    
    // Preload key assets
    // Audio files - essential sounds
    preloader.loadAudio('sounds/engine_rev.mp3');
    preloader.loadAudio('sounds/weapon_fire.mp3');
    
    // Preload more assets on mobile to prevent stuttering
    if (isMobile) {
        preloader.loadAudio('sounds/engine_idle.mp3');
        preloader.loadAudio('sounds/tire_screech.mp3');
    }
    
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
        if (!name || typeof createFunc !== 'function') {
            console.error(`Cannot create pool: invalid parameters`);
            return;
        }
        
        try {
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
                try {
                    const obj = createFunc();
                    if (obj) {
                        obj.__poolIndex = i;
                        pool.available.push(obj);
                    }
                } catch (e) {
                    console.error(`Error creating object for pool ${name}:`, e);
                }
            }
            
            this.pools.set(name, pool);
            console.log(`Created object pool '${name}' with ${pool.available.length} objects`);
        } catch (e) {
            console.error(`Error creating pool ${name}:`, e);
        }
    }
    
    // Get an object from pool
    get(name) {
        try {
            const pool = this.pools.get(name);
            if (!pool) {
                console.warn(`Pool ${name} doesn't exist`);
                return null;
            }
            
            let obj;
            if (pool.available.length > 0) {
                obj = pool.available.pop();
            } else {
                // Create new object if none available
                try {
                    obj = pool.createFunc();
                    if (obj) {
                        obj.__poolIndex = pool.active.length + pool.available.length;
                    }
                } catch (e) {
                    console.error(`Error creating new object for pool ${name}:`, e);
                    return null;
                }
            }
            
            if (obj) {
                pool.active.push(obj);
                return obj;
            }
            return null;
        } catch (e) {
            console.error(`Error getting object from pool ${name}:`, e);
            return null;
        }
    }
    
    // Return object to pool
    release(name, obj) {
        try {
            if (!name || !obj) return;
            
            const pool = this.pools.get(name);
            if (!pool) {
                console.warn(`Pool ${name} doesn't exist`);
                return;
            }
            
            const index = pool.active.indexOf(obj);
            if (index !== -1) {
                pool.active.splice(index, 1);
                pool.available.push(obj);
            }
        } catch (e) {
            console.error(`Error releasing object to pool ${name}:`, e);
        }
    }
    
    // Clear all pools
    clear() {
        try {
            this.pools.forEach((pool, name) => {
                pool.active.length = 0;
                pool.available.length = 0;
            });
            this.pools.clear();
        } catch (e) {
            console.error("Error clearing object pools:", e);
        }
    }
}

// Export the Game class for ES modules
export { Game }

// Also make Game available globally for non-module contexts
if (typeof window !== 'undefined') {
    window.Game = Game;
    console.log("Game class exported and made globally available");
}
