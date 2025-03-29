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
        
        // Apply 10x scaling factor
        const turretScale = 10;
        
        // Create turret base - adjust size based on type
        const baseScale = type.name === "Heavy" ? 1.3 : (type.name === "Rapid" ? 0.8 : 1);
        const baseGeometry = new THREE.CylinderGeometry(
            1 * baseScale * turretScale, 
            1 * baseScale * turretScale, 
            1 * turretScale, 
            8
        );
        const baseMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(type.color),
            shininess: 30
        })
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
        
        const gunMaterial = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color(type.color),
            shininess: 30
        })
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
            this.scene.remove(projectile.light);
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
        // Create a flash effect
        const flashColor = this.type.color;
        const flashLight = new THREE.PointLight(flashColor, 3, 30);
        flashLight.position.copy(this.base.position);
        flashLight.position.y += 5;
        this.scene.add(flashLight);
        
        // Create particles
        const particles = [];
        const particleCount = 20;
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.3, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: flashColor,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position above turret
            const angle = Math.random() * Math.PI * 2;
            const radius = 2 + Math.random() * 8;
            
            particle.position.set(
                this.base.position.x + Math.cos(angle) * radius,
                this.base.position.y + 15 + Math.random() * 5,
                this.base.position.z + Math.sin(angle) * radius
            );
            
            // Add velocity
            const speed = 0.15 + Math.random() * 0.1;
            particle.userData = {
                velocity: new THREE.Vector3(
                    0,
                    -speed * 2, // Falling down
                    0
                ),
                rotationSpeed: {
                    x: (Math.random() - 0.5) * 0.1,
                    y: (Math.random() - 0.5) * 0.1,
                    z: (Math.random() - 0.5) * 0.1
                }
            };
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate effect
        let effectTime = 1.0;
        const animateEffect = () => {
            effectTime -= 0.02;
            
            if (effectTime <= 0) {
                // Remove light
                this.scene.remove(flashLight);
                
                // Remove particles
                particles.forEach(p => this.scene.remove(p));
                return;
            }
            
            // Update light
            flashLight.intensity = effectTime * 3;
            
            // Update particles
            particles.forEach(p => {
                // Update position
                p.position.x += p.userData.velocity.x;
                p.position.y += p.userData.velocity.y;
                p.position.z += p.userData.velocity.z;
                
                // Rotate particle
                p.rotation.x += p.userData.rotationSpeed.x;
                p.rotation.y += p.userData.rotationSpeed.y;
                p.rotation.z += p.userData.rotationSpeed.z;
                
                // Fade out
                p.material.opacity = effectTime * 0.8;
                
                // Accelerate fall as they get closer to turret
                if (p.position.y < this.base.position.y + 10) {
                    p.userData.velocity.y *= 1.05;
                }
            });
            
            requestAnimationFrame(animateEffect);
        };
        
        animateEffect();
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
        this.particles = [];
        this.created = false;
        this.createdTime = Date.now();
        this.floatOffset = Math.random() * Math.PI * 2;
        this.rotationSpeed = {
            x: (Math.random() - 0.5) * 0.03,
            y: (Math.random() - 0.5) * 0.03,
            z: (Math.random() - 0.5) * 0.03
        };
        this.pulsePhase = Math.random() * Math.PI * 2;
        
        // Create immediately
        this.create();
        
        // Add spawn effect
        this.createSpawnEffect();
    }
    
    create() {
        if (this.created) return;
        
        // Create container
        this.mesh = new THREE.Object3D();
        this.mesh.position.copy(this.position);
        
        // Create base geometry based on powerup type
        let geometry;
        let color;
        let emissiveIntensity = 0.8;
        
        switch(this.type) {
            case 'SPEED_BOOST':
                // Sleek aerodynamic shape for speed boost
                geometry = new THREE.OctahedronGeometry(0.8, 2);
                color = 0x00ff99;
                emissiveIntensity = 1.0;
                break;
            case 'REPAIR':
                // Heart-like shape for repair
                const heartShape = new THREE.Shape();
                heartShape.moveTo(0, 0.5);
                heartShape.bezierCurveTo(0, 0.8, 0.7, 0.8, 0.7, 0.5);
                heartShape.bezierCurveTo(0.7, 0.2, 0, 0.2, 0, 0.5);
                heartShape.bezierCurveTo(0, 0.2, -0.7, 0.2, -0.7, 0.5);
                heartShape.bezierCurveTo(-0.7, 0.8, 0, 0.8, 0, 0.5);
                
                geometry = new THREE.ExtrudeGeometry(heartShape, {
                    depth: 0.4,
                    bevelEnabled: true,
                    bevelSegments: 2,
                    bevelSize: 0.1,
                    bevelThickness: 0.1
                });
                geometry.scale(0.8, 0.8, 0.8);
                color = 0xff3366;
                break;
            case 'SHIELD':
                // Energy shield shape
                geometry = new THREE.TorusGeometry(0.8, 0.3, 16, 32);
                color = 0xffcc00;
                break;
            case 'AMMO':
                // Create a custom bullet-like shape
                const bulletGroup = new THREE.Group();
                
                // Bullet body
                const bulletBody = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16),
                    new THREE.MeshStandardMaterial({
                        color: 0xcccccc,
                        metalness: 1.0,
                        roughness: 0.2
                    })
                );
                
                // Bullet tip
                const bulletTip = new THREE.Mesh(
                    new THREE.ConeGeometry(0.2, 0.4, 16),
                    new THREE.MeshStandardMaterial({
                        color: 0xff9900,
                        metalness: 0.9,
                        roughness: 0.2
                    })
                );
                bulletTip.position.y = 0.6;
                
                bulletGroup.add(bulletBody);
                bulletGroup.add(bulletTip);
                bulletGroup.scale.set(1.2, 1.2, 1.2);
                
                // Use a box geometry as placeholder for collisions
                geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                geometry.visible = false;
                
                color = 0x00aaff;
                
                // Create the mesh with invisible collision geometry
                const powerupMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: emissiveIntensity,
                    roughness: 0.2,
                    metalness: 0.8,
                    transparent: true,
                    opacity: 0.0 // Invisible
                }));
                
                // Add the bullet model to our powerup mesh
                powerupMesh.add(bulletGroup);
                this.mesh.add(powerupMesh);
                
                // Add custom rotation for this special model
                bulletGroup.rotation.x = Math.PI * 0.5;
                
                // Skip normal material creation since we have a custom model
                this.scene.add(this.mesh);
                this.created = true;
                
                // Add a point light to make it glow
                this.light = new THREE.PointLight(color, 2.0, 8);
                this.light.position.set(0, 0, 0);
                this.mesh.add(this.light);
                
                // Add energy field effect
                const energyField = new THREE.Mesh(
                    new THREE.SphereGeometry(1.2, 16, 16),
                    new THREE.MeshStandardMaterial({
                        color: color,
                        emissive: color,
                        emissiveIntensity: 0.5,
                        transparent: true,
                        opacity: 0.2
                    })
                );
                this.mesh.add(energyField);
                this.energyField = energyField;
                
                return; // Skip standard material creation
                
            default:
                geometry = new THREE.TetrahedronGeometry(0.8, 2);
                color = 0xff00ff;
        }
        
        // Create material with enhanced emissive properties for better visibility
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: emissiveIntensity,
            roughness: 0.2,
            metalness: 0.8,
            transparent: true,
            opacity: 0.9
        });
        
        const powerupMesh = new THREE.Mesh(geometry, material);
        this.mesh.add(powerupMesh);
        
        // Add a point light to make it glow
        this.light = new THREE.PointLight(color, 2.0, 8);
        this.light.position.set(0, 0, 0);
        this.mesh.add(this.light);
        
        // Add energy field effect (for all types except AMMO which has its own)
        if (this.type !== 'AMMO') {
            const energyField = new THREE.Mesh(
                new THREE.SphereGeometry(1.2, 16, 16),
                new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.5,
                    transparent: true,
                    opacity: 0.2
                })
            );
            this.mesh.add(energyField);
            this.energyField = energyField;
        }
        
        // Set initial position
        this.mesh.position.y = 2; // Slightly above ground
        
        // Add to scene
        this.scene.add(this.mesh);
        this.created = true;
    }
    
    createSpawnEffect() {
        // Add dramatic spawn effect
        const color = this.light ? this.light.color.getHex() : 0xffffff;
        
        // Create expanding ring
        const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(this.position);
        ring.position.y = 0.1;
        ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
        
        // Add vertical light beam
        const beamGeometry = new THREE.CylinderGeometry(0.1, 0.1, 10, 8, 1, true);
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.copy(this.position);
        beam.position.y = 5;
        this.scene.add(beam);
        
        // Animate spawn effects
        let spawnAge = 0;
        const animateSpawn = () => {
            spawnAge += 0.05;
            
            // Expand ring
            ring.scale.set(1 + spawnAge * 3, 1 + spawnAge * 3, 1);
            ring.material.opacity = Math.max(0, 0.8 - spawnAge * 0.8);
            
            // Shrink beam
            beam.scale.y = Math.max(0.1, 1 - spawnAge * 0.5);
            beam.material.opacity = Math.max(0, 0.5 - spawnAge * 0.5);
            
            if (spawnAge < 1) {
                requestAnimationFrame(animateSpawn);
            } else {
                // Remove effects when animation is complete
                this.scene.remove(ring);
                this.scene.remove(beam);
            }
        };
        
        animateSpawn();
    }
    
    update(isFullUpdate = true) {
        if (!this.mesh) return;
        
        const now = Date.now();
        
        // Make powerup use complex rotation on all axes
        this.mesh.rotation.x += this.rotationSpeed.x;
        this.mesh.rotation.y += this.rotationSpeed.y;
        this.mesh.rotation.z += this.rotationSpeed.z;
        
        // Make powerup float up and down with a more complex motion
        const floatOffset = Math.sin(now * 0.001 + this.floatOffset) * 0.5;
        this.mesh.position.y = 2 + floatOffset;
        
        // Add some subtle horizontal drift
        const driftX = Math.sin(now * 0.0005 + this.floatOffset * 2) * 0.1;
        const driftZ = Math.cos(now * 0.0007 + this.floatOffset * 3) * 0.1;
        this.mesh.position.x = this.position.x + driftX;
        this.mesh.position.z = this.position.z + driftZ;
        
        // Pulse the light with a breathing effect
        const pulseIntensity = 1.5 + Math.sin(now * 0.003 + this.pulsePhase) * 0.5;
        if (this.light) {
            this.light.intensity = pulseIntensity;
            this.light.distance = 8 + Math.sin(now * 0.002) * 2;
        }
        
        // Scale energy field for pulsing effect
        if (this.energyField) {
            const fieldScale = 1 + Math.sin(now * 0.002 + this.pulsePhase) * 0.1;
            this.energyField.scale.set(fieldScale, fieldScale, fieldScale);
        }
        
        // Only do particle effects on full update frames
        if (isFullUpdate) {
            // Occasionally emit particles (different for each powerup type)
            if (Math.random() < 0.05) {
                this.emitParticle();
            }
            
            // Update existing particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const particle = this.particles[i];
                particle.life -= 0.02;
                
                if (particle.life <= 0) {
                    this.scene.remove(particle.mesh);
                    this.particles.splice(i, 1);
                    continue;
                }
                
                // Move particle
                particle.mesh.position.x += particle.velocity.x;
                particle.mesh.position.y += particle.velocity.y;
                particle.mesh.position.z += particle.velocity.z;
                
                // Apply gravity if applicable
                if (particle.useGravity) {
                    particle.velocity.y -= 0.01;
                }
                
                // Update opacity
                if (particle.mesh.material) {
                    particle.mesh.material.opacity = particle.life * particle.initialOpacity;
                }
                
                // Special effect: Make speed boost particles trail
                if (this.type === 'SPEED_BOOST' && Math.random() < 0.4) {
                    this.createMiniTrail(particle.mesh.position.clone());
                }
            }
        }
        
        // Check if powerup should despawn (after 30 seconds)
        if (now - this.createdTime > 30000) {
            return true; // Signal to remove
        }
        
        return false; // Keep updating
    }
    
    emitParticle() {
        let geometry, material, velocity, life, useGravity;
        const position = this.mesh.position.clone();
        
        // Get color from the powerup
        const color = this.light ? this.light.color.clone() : new THREE.Color(0xffffff);
        
        // Customize particles based on powerup type
        switch(this.type) {
            case 'SPEED_BOOST':
                // Speed boost emits energy trails
                geometry = new THREE.SphereGeometry(0.1, 8, 8);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.7
                });
                
                // Particles shoot downward and outward
                const angle = Math.random() * Math.PI * 2;
                const radius = 0.8;
                position.x += Math.cos(angle) * radius;
                position.z += Math.sin(angle) * radius;
                
                velocity = {
                    x: Math.cos(angle) * 0.05,
                    y: -0.05, // Trails downward
                    z: Math.sin(angle) * 0.05
                };
                
                life = 0.7;
                useGravity = false;
                break;
                
            case 'REPAIR':
                // Repair emits healing particles that float upward
                geometry = new THREE.SphereGeometry(0.08, 8, 8);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8
                });
                
                // Position around powerup
                const repairAngle = Math.random() * Math.PI * 2;
                position.x += Math.cos(repairAngle) * 0.7;
                position.z += Math.sin(repairAngle) * 0.7;
                position.y -= 0.3; // Start slightly below
                
                velocity = {
                    x: Math.cos(repairAngle) * 0.01,
                    y: 0.03 + Math.random() * 0.02, // Float upward
                    z: Math.sin(repairAngle) * 0.01
                };
                
                life = 1.0;
                useGravity = false;
                break;
                
            case 'SHIELD':
                // Shield emits orbital particles
                geometry = new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 8, 8);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.6 + Math.random() * 0.2
                });
                
                // Position in orbit
                const orbitAngle = Math.random() * Math.PI * 2;
                const orbitRadius = 0.8 + Math.random() * 0.4;
                position.x += Math.cos(orbitAngle) * orbitRadius;
                position.z += Math.sin(orbitAngle) * orbitRadius;
                position.y += Math.random() * 0.8 - 0.4;
                
                // Circular motion
                const perpAngle = orbitAngle + Math.PI/2;
                velocity = {
                    x: Math.cos(perpAngle) * (0.03 + Math.random() * 0.02),
                    y: (Math.random() - 0.5) * 0.01,
                    z: Math.sin(perpAngle) * (0.03 + Math.random() * 0.02)
                };
                
                life = 1.5;
                useGravity = false;
                break;
                
            case 'AMMO':
                // Ammo emits metallic sparks
                geometry = new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 4, 4);
                material = new THREE.MeshBasicMaterial({
                    color: Math.random() < 0.5 ? 0xff9900 : 0xffcc00,
                    transparent: true,
                    opacity: 0.8
                });
                
                // Position at bottom of powerup
                position.y -= 0.4;
                position.x += (Math.random() - 0.5) * 0.4;
                position.z += (Math.random() - 0.5) * 0.4;
                
                // Spray upward with arc
                velocity = {
                    x: (Math.random() - 0.5) * 0.08,
                    y: 0.05 + Math.random() * 0.08,
                    z: (Math.random() - 0.5) * 0.08
                };
                
                life = 0.8;
                useGravity = true;
                break;
                
            default:
                // Default particles
                geometry = new THREE.SphereGeometry(0.1, 8, 8);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.7
                });
                
                // Random outward velocity
                const defaultAngle = Math.random() * Math.PI * 2;
                velocity = {
                    x: Math.cos(defaultAngle) * 0.03,
                    y: 0.02 + Math.random() * 0.03,
                    z: Math.sin(defaultAngle) * 0.03
                };
                
                life = 1.0;
                useGravity = false;
        }
        
        // Create the particle
        const particleMesh = new THREE.Mesh(geometry, material);
        particleMesh.position.copy(position);
        
        // Add to scene and tracking
        this.scene.add(particleMesh);
        this.particles.push({
            mesh: particleMesh,
            velocity: velocity,
            life: life,
            initialOpacity: material.opacity,
            useGravity: useGravity
        });
    }
    
    createMiniTrail(position) {
        // Speed boost special effect: tiny trail particles
        const geometry = new THREE.SphereGeometry(0.02, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: 0x88ffcc,
            transparent: true,
            opacity: 0.5
        });
        
        const trail = new THREE.Mesh(geometry, material);
        trail.position.copy(position);
        this.scene.add(trail);
        
        // Fade out quickly
        let trailLife = 0.5;
        
        const updateTrail = () => {
            trailLife -= 0.1;
            trail.material.opacity = trailLife * 0.5;
            
            if (trailLife <= 0) {
                this.scene.remove(trail);
                return;
            }
            
            requestAnimationFrame(updateTrail);
        };
        
        updateTrail();
    }
    
    createPickupEffect() {
        if (!this.mesh) return;
        
        // Get powerup position and color for effect
        const position = this.mesh.position.clone();
        const color = this.light ? this.light.color.getHex() : 0xffffff;
        
        // Create specialized pickup effects based on powerup type
        switch(this.type) {
            case 'SPEED_BOOST':
                this.createSpeedBoostEffect(position, color);
                break;
                
            case 'REPAIR':
                this.createRepairEffect(position, color);
                break;
                
            case 'SHIELD':
                this.createShieldEffect(position, color);
                break;
                
            case 'AMMO':
                this.createAmmoEffect(position, color);
                break;
                
            default:
                this.createDefaultEffect(position, color);
        }
    }
    
    createSpeedBoostEffect(position, color) {
        // Create speed lines shooting outward
        const particleCount = 30;
        const particles = [];
        
        // Flash of light
        const flash = new THREE.PointLight(color, 3, 15);
        flash.position.copy(position);
        this.scene.add(flash);
        
        // Speed ring expanding outward
        const ringGeometry = new THREE.RingGeometry(0.5, 0.7, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(position);
        ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
        
        // Create streaking particles
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.2 + Math.random() * 0.3);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.7
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position at center
            particle.position.copy(position);
            
            // Set outward velocity
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.2 + Math.random() * 0.3;
            const velocity = {
                x: Math.cos(angle) * speed,
                y: (Math.random() - 0.3) * 0.1, // Mostly horizontal
                z: Math.sin(angle) * speed
            };
            
            // Point in direction of travel
            particle.lookAt(position.clone().add(new THREE.Vector3(velocity.x, velocity.y, velocity.z)));
            
            this.scene.add(particle);
            particles.push({
                mesh: particle,
                velocity: velocity
            });
        }
        
        // Animate effects
        let effectLife = 1.0;
        const animateEffect = () => {
            effectLife -= 0.04;
            
            if (effectLife <= 0) {
                // Clean up
                this.scene.remove(flash);
                this.scene.remove(ring);
                particles.forEach(p => this.scene.remove(p.mesh));
                return;
            }
            
            // Update flash
            flash.intensity = effectLife * 3;
            
            // Expand and fade ring
            ring.scale.set(1 + (1 - effectLife) * 5, 1 + (1 - effectLife) * 5, 1);
            ring.material.opacity = effectLife * 0.8;
            
            // Update particles
            particles.forEach(p => {
                p.mesh.position.x += p.velocity.x;
                p.mesh.position.y += p.velocity.y;
                p.mesh.position.z += p.velocity.z;
                
                // Stretch as they travel
                p.mesh.scale.z = 1 + (1 - effectLife) * 2;
                
                // Fade out
                p.mesh.material.opacity = effectLife * 0.7;
            });
            
            requestAnimationFrame(animateEffect);
        };
        
        animateEffect();
    }
    
    createRepairEffect(position, color) {
        // Create healing particles floating upward
        const particleCount = 25;
        const particles = [];
        
        // Create healing cross shape helper function
        const createHealingCross = (pos, size, angle) => {
            const group = new THREE.Group();
            
            // Horizontal bar
            const hBar = new THREE.Mesh(
                new THREE.BoxGeometry(size, size/5, size/5),
                new THREE.MeshBasicMaterial({ color: color })
            );
            
            // Vertical bar
            const vBar = new THREE.Mesh(
                new THREE.BoxGeometry(size/5, size, size/5),
                new THREE.MeshBasicMaterial({ color: color })
            );
            
            group.add(hBar);
            group.add(vBar);
            
            // Position and rotate
            group.position.copy(pos);
            group.rotation.z = angle;
            
            return group;
        };
        
        // Add healing ring pulsing outward
        const ringGeometry = new THREE.RingGeometry(0.2, 0.4, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(position);
        ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
        
        // Add healing crosses
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const distance = 1.0;
            const crossPos = new THREE.Vector3(
                position.x + Math.cos(angle) * distance,
                position.y,
                position.z + Math.sin(angle) * distance
            );
            
            const cross = createHealingCross(crossPos, 0.5, Math.random() * Math.PI);
            cross.rotation.x = Math.PI / 2; // Lie flat
            this.scene.add(cross);
            
            particles.push({
                mesh: cross,
                initialY: crossPos.y,
                angle: angle,
                distance: distance,
                phase: Math.random() * Math.PI * 2
            });
        }
        
        // Add healing glow
        const glow = new THREE.PointLight(color, 2, 10);
        glow.position.copy(position);
        this.scene.add(glow);
        
        // Animate healing effect
        let effectLife = 1.0;
        const animateEffect = () => {
            effectLife -= 0.015; // Slower fade for healing effect
            
            if (effectLife <= 0) {
                // Clean up
                this.scene.remove(glow);
                this.scene.remove(ring);
                particles.forEach(p => this.scene.remove(p.mesh));
                return;
            }
            
            // Pulse glow
            glow.intensity = 2 + Math.sin(effectLife * 20) * 1;
            
            // Expand and pulse ring
            ring.scale.set(1 + (1 - effectLife) * 3, 1 + (1 - effectLife) * 3, 1);
            ring.material.opacity = effectLife * (0.5 + Math.sin(effectLife * 20) * 0.3);
            
            // Move crosses in a spiral pattern
            particles.forEach((p, i) => {
                // Decrease distance over time (spiral inward)
                p.distance = Math.max(0.2, p.distance * 0.98);
                
                // Rotate around center point
                p.angle += 0.02;
                
                // Update position
                p.mesh.position.x = position.x + Math.cos(p.angle) * p.distance;
                p.mesh.position.z = position.z + Math.sin(p.angle) * p.distance;
                
                // Float upward
                p.mesh.position.y = p.initialY + (1 - effectLife) * 3;
                
                // Spin
                p.mesh.rotation.y += 0.05;
                
                // Fade out
                p.mesh.children.forEach(child => {
                    child.material.opacity = effectLife;
                });
            });
            
            requestAnimationFrame(animateEffect);
        };
        
        animateEffect();
    }
    
    createShieldEffect(position, color) {
        // Create expanding shield bubble
        const bubbleGeometry = new THREE.SphereGeometry(1.5, 32, 32);
        const bubbleMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            wireframe: true
        });
        
        const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
        bubble.position.copy(position);
        this.scene.add(bubble);
        
        // Add solid bubble inside
        const innerBubbleGeometry = new THREE.SphereGeometry(1.3, 32, 32);
        const innerBubbleMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        
        const innerBubble = new THREE.Mesh(innerBubbleGeometry, innerBubbleMaterial);
        bubble.add(innerBubble);
        
        // Add energy rings
        const rings = [];
        for (let i = 0; i < 3; i++) {
            const ringGeometry = new THREE.RingGeometry(1.5, 1.7, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide
            });
            
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            
            // Position with different rotations
            ring.rotation.x = Math.random() * Math.PI;
            ring.rotation.y = Math.random() * Math.PI;
            
            bubble.add(ring);
            rings.push(ring);
        }
        
        // Add central flash
        const flash = new THREE.PointLight(color, 3, 15);
        flash.position.copy(position);
        this.scene.add(flash);
        
        // Animate shield effect
        let effectLife = 1.0;
        const animateEffect = () => {
            effectLife -= 0.02;
            
            if (effectLife <= 0) {
                // Clean up
                this.scene.remove(bubble);
                this.scene.remove(flash);
                return;
            }
            
            // Expand bubbles
            const expandFactor = 1 + (1 - effectLife) * 2;
            bubble.scale.set(expandFactor, expandFactor, expandFactor);
            
            // Rotate rings
            rings.forEach((ring, i) => {
                ring.rotation.x += 0.01 * (i + 1);
                ring.rotation.y += 0.02 * (i + 1);
                ring.rotation.z += 0.015 * (i + 1);
            });
            
            // Fade out
            bubble.material.opacity = effectLife * 0.5;
            innerBubble.material.opacity = effectLife * 0.2;
            rings.forEach(ring => {
                ring.material.opacity = effectLife * 0.7;
            });
            
            // Flash fades faster
            flash.intensity = effectLife * 3;
            
            requestAnimationFrame(animateEffect);
        };
        
        animateEffect();
    }
    
    createAmmoEffect(position, color) {
        // Create explosive ammo effect
        const particleCount = 40;
        const particles = [];
        
        // Create metal fragments
        for (let i = 0; i < particleCount; i++) {
            const size = 0.05 + Math.random() * 0.1;
            let geometry;
            
            // Mix of different fragment shapes
            const shapeType = Math.floor(Math.random() * 3);
            switch(shapeType) {
                case 0:
                    geometry = new THREE.TetrahedronGeometry(size);
                    break;
                case 1:
                    geometry = new THREE.BoxGeometry(size, size, size);
                    break;
                default:
                    geometry = new THREE.OctahedronGeometry(size, 0);
            }
            
            // Metallic material with random shades
            const material = new THREE.MeshStandardMaterial({
                color: Math.random() < 0.5 ? 0xcccccc : 0x888888,
                metalness: 0.8,
                roughness: 0.2,
                transparent: true,
                opacity: 0.9
            });
            
            const fragment = new THREE.Mesh(geometry, material);
            fragment.position.copy(position);
            
            // Random velocity in all directions
            const angle = Math.random() * Math.PI * 2;
            const elevation = Math.random() * Math.PI - Math.PI/2;
            const speed = 0.1 + Math.random() * 0.2;
            
            const velocity = {
                x: Math.cos(angle) * Math.cos(elevation) * speed,
                y: Math.sin(elevation) * speed,
                z: Math.sin(angle) * Math.cos(elevation) * speed
            };
            
            // Random rotation
            const rotation = {
                x: (Math.random() - 0.5) * 0.2,
                y: (Math.random() - 0.5) * 0.2,
                z: (Math.random() - 0.5) * 0.2
            };
            
            this.scene.add(fragment);
            particles.push({
                mesh: fragment,
                velocity: velocity,
                rotation: rotation
            });
        }
        
        // Add explosion flash
        const flash = new THREE.PointLight(color, 3, 15);
        flash.position.copy(position);
        this.scene.add(flash);
        
        // Add orange explosion flash
        const explosion = new THREE.PointLight(0xff6600, 2, 10);
        explosion.position.copy(position);
        this.scene.add(explosion);
        
        // Animate ammo effect
        let effectLife = 1.0;
        const animateEffect = () => {
            effectLife -= 0.03;
            
            if (effectLife <= 0) {
                // Clean up
                this.scene.remove(flash);
                this.scene.remove(explosion);
                particles.forEach(p => this.scene.remove(p.mesh));
                return;
            }
            
            // Update flash
            flash.intensity = effectLife * 3;
            
            // Explosion fades in then out
            const explosionIntensity = Math.sin((1 - effectLife) * Math.PI) * 2;
            explosion.intensity = explosionIntensity;
            
            // Update fragments
            particles.forEach(p => {
                // Apply velocity
                p.mesh.position.x += p.velocity.x;
                p.mesh.position.y += p.velocity.y;
                p.mesh.position.z += p.velocity.z;
                
                // Apply gravity
                p.velocity.y -= 0.01;
                
                // Rotate fragments
                p.mesh.rotation.x += p.rotation.x;
                p.mesh.rotation.y += p.rotation.y;
                p.mesh.rotation.z += p.rotation.z;
                
                // Fade out
                p.mesh.material.opacity = effectLife * 0.9;
            });
            
            requestAnimationFrame(animateEffect);
        };
        
        animateEffect();
    }
    
    createDefaultEffect(position, color) {
        // Generic particle explosion
        const particleCount = 20;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.1 + Math.random() * 0.1, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position around pickup
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 0.5;
            particle.position.set(
                position.x + Math.cos(angle) * radius,
                position.y + Math.random() * 1,
                position.z + Math.sin(angle) * radius
            );
            
            // Set velocity - outward
            const speed = 0.1 + Math.random() * 0.1;
            const velocity = {
                x: Math.cos(angle) * speed,
                y: Math.random() * 0.1,
                z: Math.sin(angle) * speed
            };
            
            this.scene.add(particle);
            particles.push({
                mesh: particle,
                velocity: velocity
            });
        }
        
        // Flash effect
        const flash = new THREE.PointLight(color, 2, 10);
        flash.position.copy(position);
        this.scene.add(flash);
        
        // Animate effect
        let effectLife = 1.0;
        const animateEffect = () => {
            effectLife -= 0.05;
            
            if (effectLife <= 0) {
                // Remove effects
                this.scene.remove(flash);
                particles.forEach(p => this.scene.remove(p.mesh));
                return;
            }
            
            // Update flash
            flash.intensity = effectLife * 2;
            
            // Update particles
            particles.forEach(p => {
                p.mesh.position.x += p.velocity.x;
                p.mesh.position.y += p.velocity.y;
                p.mesh.position.z += p.velocity.z;
                
                // Fade out
                p.mesh.material.opacity = effectLife * 0.8;
                
                // Slow down over time
                p.velocity.x *= 0.95;
                p.velocity.y *= 0.95;
                p.velocity.z *= 0.95;
            });
            
            requestAnimationFrame(animateEffect);
        };
        
        animateEffect();
    }
    
    removeFromScene() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
        
        // Clean up all particles
        this.particles.forEach(particle => {
            if (particle.mesh) {
                this.scene.remove(particle.mesh);
            }
        });
        this.particles = [];
    }
}

class Game {
    constructor() {
        console.log("Game constructor called");
        
        // Core initialization only
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 800, 1600); // Adjusted for better view of regular arena with large turrets
        this.renderer = null;
        this.truck = null;
        this.isInitialized = false;
        
        // Initialize audio manager with camera
        if (!window.audioManager) {
            console.log("Creating new AudioManager instance");
            window.audioManager = new AudioManager(this.camera);
        }
        this.audioManager = window.audioManager; // Always use the global instance
        
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
        
        // Add powerups array
        this.powerups = [];
        this.powerupSpawnTimer = 0;
        this.powerupSpawnInterval = 300; // Spawn a powerup every 300 frames (about 5 seconds)
        
        // Initialize the game
        this.init();
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
                this.renderer.shadowMap.enabled = true;
                
                // Improve color rendering with current THREE.js settings
                this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Instead of outputEncoding
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
                this.renderer.toneMappingExposure = 1.0;
                // Note: physicallyCorrectLights is deprecated; modern THREE.js uses physically correct lighting by default
            } catch (rendererError) {
                console.error("Failed to create renderer:", rendererError);
                throw rendererError;
            }
            
            // Set up camera
            try {
                this.camera.position.set(0, 800, 1600);
                this.camera.lookAt(0, 0, 0);
            } catch (cameraError) {
                console.error("Failed to configure camera:", cameraError);
                throw cameraError;
            }
            
            // Add basic lighting
            try {
                // Modern lighting setup for better color rendering
                // Main ambient light provides base illumination
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
                this.scene.add(ambientLight);
                
                // Main directional light with shadows
                const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
                directionalLight.position.set(50, 200, 100);
                directionalLight.castShadow = true;
                directionalLight.shadow.mapSize.width = 1024;
                directionalLight.shadow.mapSize.height = 1024;
                directionalLight.shadow.camera.near = 10;
                directionalLight.shadow.camera.far = 500;
                directionalLight.shadow.bias = -0.001;
                this.scene.add(directionalLight);
                
                // Add some colored rim lighting for visual interest
                const pinkLight = new THREE.DirectionalLight(0xff00ff, 0.3);
                pinkLight.position.set(-100, 50, -100);
                this.scene.add(pinkLight);
                
                // Blue backlight for cyberpunk feel
                const blueLight = new THREE.DirectionalLight(0x0088ff, 0.3);
                blueLight.position.set(100, 20, -100);
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
    }

    createArena() {
        console.log("Creating arena...");
        
        // Create ground
        const groundGeometry = new THREE.PlaneGeometry(780, 780); // Increased from 600 to 780 (30% larger)
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        console.log("Ground added to scene");

        // Create walls
        const wallMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x666666,
            roughness: 0.7,
            metalness: 0.3
        });

        // North wall
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(780, 100, 10), // Increased from 600 to 780
            wallMaterial
        );
        northWall.position.set(0, 50, -390); // Adjusted from -300 to -390
        northWall.castShadow = true;
        northWall.receiveShadow = true;
        this.scene.add(northWall);
        console.log("North wall added to scene");

        // South wall
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(780, 100, 10), // Increased from 600 to 780
            wallMaterial
        );
        southWall.position.set(0, 50, 390); // Adjusted from 300 to 390
        southWall.castShadow = true;
        southWall.receiveShadow = true;
        this.scene.add(southWall);
        console.log("South wall added to scene");

        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(10, 100, 780), // Increased from 600 to 780
            wallMaterial
        );
        eastWall.position.set(390, 50, 0); // Adjusted from 300 to 390
        eastWall.castShadow = true;
        eastWall.receiveShadow = true;
        this.scene.add(eastWall);
        console.log("East wall added to scene");

        // West wall
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(10, 100, 780), // Increased from 600 to 780
            wallMaterial
        );
        westWall.position.set(-390, 50, 0); // Adjusted from -300 to -390
        westWall.castShadow = true;
        westWall.receiveShadow = true;
        this.scene.add(westWall);
        console.log("West wall added to scene");

        // Add grid helper for reference
        const gridHelper = new THREE.GridHelper(780, 78); // Increased from 600 to 780, adjusted grid divisions
        this.scene.add(gridHelper);
        console.log("Grid helper added to scene");

        // Add arena lighting
        const arenaLight = new THREE.PointLight(0xffffff, 1, 1000);
        arenaLight.position.set(0, 200, 0);
        arenaLight.castShadow = true;
        this.scene.add(arenaLight);
        console.log("Arena light added to scene");

        // Add corner lights
        const cornerLight = new THREE.PointLight(0xffffff, 0.5, 500);
        cornerLight.position.set(520, 100, 520); // Adjusted from 400 to 520
        cornerLight.castShadow = true;
        this.scene.add(cornerLight);
        console.log("Corner light added to scene");

        // Store wall references for collision detection
        this.walls = {
            north: northWall,
            south: southWall,
            east: eastWall,
            west: westWall,
            halfSize: 390, // Half of arena size (780/2)
            thickness: 10
        };
        console.log("Arena creation complete");
    }

    createSimpleTruck() {
        console.log("Creating simplified truck");
        
        // Create a basic box for the truck
        const truckGeometry = new THREE.BoxGeometry(2.5, 1.25, 3.75);
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
        wheelFL.position.set(-1.21, -0.3, -1.1);
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
        
        // Helper to update keys based on touch controls
        const updateKeysFromTouch = () => {
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
        
        // Movement controls
        if (padUp) {
            padUp.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.up = true;
                padUp.classList.add('active');
                updateKeysFromTouch();
            });
            
            padUp.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.up = false;
                padUp.classList.remove('active');
                updateKeysFromTouch();
            });
        }
        
        if (padDown) {
            padDown.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.down = true;
                padDown.classList.add('active');
                updateKeysFromTouch();
            });
            
            padDown.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.down = false;
                padDown.classList.remove('active');
                updateKeysFromTouch();
            });
        }
        
        if (padLeft) {
            padLeft.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.left = true;
                padLeft.classList.add('active');
                updateKeysFromTouch();
            });
            
            padLeft.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.left = false;
                padLeft.classList.remove('active');
                updateKeysFromTouch();
            });
        }
        
        if (padRight) {
            padRight.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.right = true;
                padRight.classList.add('active');
                updateKeysFromTouch();
            });
            
            padRight.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.right = false;
                padRight.classList.remove('active');
                updateKeysFromTouch();
            });
        }
        
        // Fire button
        if (fireButton) {
            fireButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchControls.fire = true;
                fireButton.classList.add('active');
                updateKeysFromTouch();
            });
            
            fireButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                touchControls.fire = false;
                fireButton.classList.remove('active');
                updateKeysFromTouch();
            });
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
            });
            
            weaponButton.addEventListener('touchend', (e) => {
                e.preventDefault();
                weaponButton.classList.remove('active');
            });
        }
        
        // Update mobile UI when window resizes
        window.addEventListener('resize', () => {
            this.updateMobileUI();
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
        
        // Check collisions with turrets
        for (const turret of this.turrets) {
            // Skip destroyed turrets
            if (!turret || !turret.alive || !turret.base) continue;
            
            // Calculate distance between truck and turret
            const distance = this.truck.position.distanceTo(turret.base.position);
            
            // Collision distance (sum of truck radius and turret radius)
            const collisionDistance = 2.75 + 10; // truck size + turret base radius (scaled)
            
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
        
        // Update powerups
        this.updatePowerups();
        
        // Check for powerup spawning
        this.powerupSpawnTimer++;
        if (this.powerupSpawnTimer >= this.powerupSpawnInterval) {
            this.spawnRandomPowerup();
            this.powerupSpawnTimer = 0;
        }
        
        // Check for projectile hits
        this.checkProjectileHits();
        
        // Check for player projectile hits on turrets
        this.checkPlayerProjectileHits();
        
        // Check for powerup collection
        this.checkPowerupCollection();
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
        const arenaSize = 600; // Keep original arena size (not 10x larger)
        const minDistanceFromCenter = 120; // Increased minimum distance for better spacing
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
                fireRate: 120, // 2 seconds between shots (was 60)
                projectileSpeed: 3, // Scale projectile speed appropriately 
                rotationSpeed: 0.015 // Slow rotation speed
            },
            {
                name: "Heavy",
                color: 0x444444,
                activeColor: 0xbb0000,
                warningColor: 0xbbbb00,
                health: 8,
                damage: 20,
                fireRate: 180, // 3 seconds between shots (was 120)
                projectileSpeed: 2.5, // Scale projectile speed appropriately
                rotationSpeed: 0.008 // Very slow rotation for heavy turrets
            },
            {
                name: "Rapid",
                color: 0x888888,
                activeColor: 0xff3333,
                warningColor: 0xffff33,
                health: 3,
                damage: 5,
                fireRate: 90, // 1.5 seconds between shots (was 30)
                projectileSpeed: 3.5, // Scale projectile speed appropriately
                rotationSpeed: 0.02 // Slightly faster rotation for rapid turrets
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
                if (distance < 2.2) { // Increased by 10% for larger truck
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
                
                // Skip dead turrets or turrets without a base
                if (!turret || !turret.alive || !turret.base) continue;
                
                // Get distance to turret
                const distance = projectile.mesh.position.distanceTo(turret.base.position);
                
                // If hit - 10x larger hit radius
                if (distance < 15) {
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
        // Performance optimization: Only run full updates at 30fps (every other frame)
        this._powerupUpdateFrame = !this._powerupUpdateFrame;
        const isFullUpdate = this._powerupUpdateFrame;
        
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
        
        // Define collection radius
        const collectionRadius = 3;
        
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
}

// Initialize game when window is fully loaded
window.addEventListener('load', () => {
    console.log("Window loaded, creating game");
    try {
        // Create audio manager first to ensure it's available globally
        if (!window.audioManager) {
            console.log("Creating global AudioManager instance");
            window.audioManager = new AudioManager();
        }
        
        // Create game
        window.game = new Game();
        
        console.log("Game instance created and initialized");
    } catch (error) {
        console.error("Error creating game instance:", error);
    }
});

export { Game }
