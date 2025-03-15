import * as THREE from 'three';

// Define the different weapon types
export const WeaponTypes = {
    MACHINE_GUN: {
        name: "Machine Gun",
        damage: 15,
        cooldown: 5, // Lower cooldown for rapid fire
        speed: 2.0,
        projectileSize: 0.1,
        color: 0x00ffff,
        ammoPerMagazine: 50,
        icon: "=+",
        projectilesPerShot: 1,
        spread: 0, // No spread
        description: "Rapid fire weapon with moderate damage"
    },
    ROCKETS: {
        name: "Rockets",
        damage: 50,
        cooldown: 40, // Higher cooldown for balance
        speed: 1.5,
        projectileSize: 0.3,
        color: 0xff0000,
        ammoPerMagazine: 10,
        icon: "=�",
        projectilesPerShot: 1,
        spread: 0,
        description: "Slower, high damage rockets with area effect"
    },
    SHOTGUN: {
        name: "Shotgun",
        damage: 10, // Per projectile
        cooldown: 30,
        speed: 1.8,
        projectileSize: 0.08,
        color: 0xffff00,
        ammoPerMagazine: 15,
        icon: "=*",
        projectilesPerShot: 5, // Multiple projectiles per shot
        spread: 0.2, // Wider spread
        description: "Short range spread weapon"
    },
    MINES: {
        name: "Mines",
        damage: 75,
        cooldown: 50,
        speed: 0, // Stationary
        projectileSize: 0.4,
        color: 0xff00ff,
        ammoPerMagazine: 8,
        icon: "=�",
        projectilesPerShot: 1,
        spread: 0,
        description: "Drop proximity mines behind your vehicle"
    }
};

// Weapon class for handling weapon functionality
export class Weapon {
    constructor(scene, type = WeaponTypes.MACHINE_GUN) {
        this.scene = scene;
        this.type = type;
        this.ammo = type.ammoPerMagazine;
        this.maxAmmo = type.ammoPerMagazine;
        this.cooldownTimer = 0;
        this.isReloading = false;
        this.reloadTime = 120; // 2 seconds (60 frames per second)
        this.reloadTimer = 0;
        this.damageMultiplier = 1.0;
        this.projectiles = [];
    }
    
    shoot(position, direction, source = 'player') {
        if (this.cooldownTimer > 0 || this.ammo <= 0 || this.isReloading) {
            return false; // Can't shoot
        }
        
        // Set cooldown
        this.cooldownTimer = this.type.cooldown;
        
        // Use ammo
        this.ammo--;
        
        // Create projectiles
        const projectiles = [];
        
        for (let i = 0; i < this.type.projectilesPerShot; i++) {
            let shotDirection = direction.clone();
            
            // Apply spread if needed
            if (this.type.spread > 0) {
                // Add random deviation for spread weapons
                const spreadX = (Math.random() - 0.5) * this.type.spread;
                const spreadY = (Math.random() - 0.5) * this.type.spread * 0.5; // Less vertical spread
                const spreadZ = (Math.random() - 0.5) * this.type.spread;
                
                shotDirection.x += spreadX;
                shotDirection.y += spreadY;
                shotDirection.z += spreadZ;
                shotDirection.normalize();
            }
            
            // Create projectile mesh
            let geometry;
            if (this.type.name === "Rockets") {
                // Rocket shape
                geometry = new THREE.ConeGeometry(this.type.projectileSize, this.type.projectileSize * 3, 8);
                geometry.rotateX(Math.PI / 2); // Point forward
            } else if (this.type.name === "Mines") {
                // Mine shape
                geometry = new THREE.SphereGeometry(this.type.projectileSize, 8, 8);
            } else {
                // Default shape (energy bolt)
                geometry = new THREE.CylinderGeometry(this.type.projectileSize, this.type.projectileSize, this.type.projectileSize * 4, 8);
                geometry.rotateX(Math.PI / 2);
            }
            
            const material = new THREE.MeshPhongMaterial({
                color: this.type.color,
                emissive: this.type.color,
                emissiveIntensity: 0.8,
                transparent: true,
                opacity: 0.8,
                shininess: 30
            });
            
            const projectile = new THREE.Mesh(geometry, material);
            
            // Position at slightly different points for multiple projectiles
            const offsetX = this.type.projectilesPerShot > 1 ? (i - Math.floor(this.type.projectilesPerShot / 2)) * 0.2 : 0;
            projectile.position.copy(position);
            projectile.position.x += offsetX;
            
            // Set rotation to match direction
            projectile.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                shotDirection
            );
            
            // Add light for better visibility
            const light = new THREE.PointLight(this.type.color, 0.8, 3);
            projectile.add(light);
            
            // Add to scene
            this.scene.add(projectile);
            
            // Add to projectiles array
            const projectileData = {
                mesh: projectile,
                direction: shotDirection,
                speed: this.type.speed,
                damage: this.type.damage * this.damageMultiplier,
                lifetime: this.type === WeaponTypes.MINES ? 600 : 100, // Longer lifetime for mines
                source: source,
                type: this.type,
                armed: this.type === WeaponTypes.MINES ? false : true, // Mines start unarmed
                armTimer: this.type === WeaponTypes.MINES ? 30 : 0 // Arm after 0.5 second
            };
            
            projectiles.push(projectileData);
            this.projectiles.push(projectileData);
        }
        
        // Create muzzle flash based on weapon type
        if (this.type !== WeaponTypes.MINES) {
            this.createMuzzleFlash(position, direction);
        }
        
        // Auto reload if needed
        if (this.ammo === 0 && !this.isReloading) {
            this.startReload();
        }
        
        return projectiles;
    }
    
    update() {
        // Update cooldown
        if (this.cooldownTimer > 0) {
            this.cooldownTimer--;
        }
        
        // Update reload timer
        if (this.isReloading) {
            this.reloadTimer--;
            
            if (this.reloadTimer <= 0) {
                this.finishReload();
            }
        }
        
        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            
            // Update position if not a mine or if mine is being placed
            if (projectile.type !== WeaponTypes.MINES || projectile.armTimer > 0) {
                projectile.mesh.position.x += projectile.direction.x * projectile.speed;
                projectile.mesh.position.y += projectile.direction.y * projectile.speed;
                projectile.mesh.position.z += projectile.direction.z * projectile.speed;
            }
            
            // Handle mine arming
            if (projectile.type === WeaponTypes.MINES && projectile.armTimer > 0) {
                projectile.armTimer--;
                
                // When finished placing, set to ground level and arm
                if (projectile.armTimer <= 0) {
                    projectile.mesh.position.y = 0.4; // Just above ground
                    projectile.armed = true;
                    
                    // Add pulsing effect to armed mine
                    this.addMinePulse(projectile);
                }
            }
            
            // Create trail for rockets and energy weapons
            if (projectile.type === WeaponTypes.ROCKETS || projectile.type === WeaponTypes.MACHINE_GUN) {
                this.createProjectileTrail(projectile);
            }
            
            // Decrease lifetime
            projectile.lifetime--;
            
            // Remove if lifetime ended
            if (projectile.lifetime <= 0) {
                // Create explosion for rockets and mines
                if (projectile.type.name === "Rockets" || projectile.type.name === "Mines") {
                    this.createExplosion(projectile.mesh.position.clone(), projectile.type);
                }
                
                // Remove from scene
                this.scene.remove(projectile.mesh);
                this.projectiles.splice(i, 1);
            }
        }
        
        return {
            ammo: this.ammo,
            maxAmmo: this.maxAmmo,
            isReloading: this.isReloading,
            reloadProgress: this.isReloading ? 1 - (this.reloadTimer / this.reloadTime) : 0,
            cooldownProgress: this.type.cooldown > 0 ? 1 - (this.cooldownTimer / this.type.cooldown) : 1
        };
    }
    
    startReload() {
        if (this.isReloading || this.ammo === this.maxAmmo) return;
        
        this.isReloading = true;
        this.reloadTimer = this.reloadTime;
    }
    
    finishReload() {
        this.ammo = this.maxAmmo;
        this.isReloading = false;
    }
    
    createMuzzleFlash(position, direction) {
        // Create point light for flash
        const flashLight = new THREE.PointLight(this.type.color, 2, 5);
        flashLight.position.copy(position);
        this.scene.add(flashLight);
        
        // Create flash geometry based on weapon type
        let flashGeometry;
        if (this.type === WeaponTypes.ROCKETS) {
            flashGeometry = new THREE.ConeGeometry(0.5, 1, 8);
        } else if (this.type === WeaponTypes.SHOTGUN) {
            flashGeometry = new THREE.CylinderGeometry(0.3, 0.6, 0.5, 8);
        } else {
            flashGeometry = new THREE.PlaneGeometry(0.6, 0.6);
        }
        
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: this.type.color,
            transparent: true,
            opacity: 1
        });
        
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(position);
        flash.lookAt(
            position.x + direction.x, 
            position.y + direction.y, 
            position.z + direction.z
        );
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
    
    createProjectileTrail(projectile) {
        // Skip trail for mines
        if (projectile.type === WeaponTypes.MINES) return;
        
        // Create small trail particles
        const trailGeometry = new THREE.SphereGeometry(
            projectile.type === WeaponTypes.ROCKETS ? 0.2 : 0.05, 
            8, 
            8
        );
        
        const trailMaterial = new THREE.MeshBasicMaterial({
            color: projectile.type.color,
            transparent: true,
            opacity: 0.7
        });
        
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.copy(projectile.mesh.position);
        this.scene.add(trail);
        
        // Add velocity for rocket trails
        let velocity = null;
        if (projectile.type === WeaponTypes.ROCKETS) {
            const angle = Math.random() * Math.PI * 2;
            velocity = {
                x: Math.cos(angle) * 0.05,
                y: Math.random() * 0.05,
                z: Math.sin(angle) * 0.05
            };
        }
        
        // Fade out and remove
        let trailLife = projectile.type === WeaponTypes.ROCKETS ? 20 : 10;
        const fadeTrail = () => {
            trailLife--;
            if (trailLife > 0) {
                // Update position for rocket trails to create smoke effect
                if (velocity) {
                    trail.position.x += velocity.x;
                    trail.position.y += velocity.y;
                    trail.position.z += velocity.z;
                }
                
                trail.material.opacity = trailLife / (projectile.type === WeaponTypes.ROCKETS ? 20 : 10) * 0.7;
                trail.scale.multiplyScalar(0.95);
                requestAnimationFrame(fadeTrail);
            } else {
                this.scene.remove(trail);
            }
        };
        
        fadeTrail();
    }
    
    addMinePulse(projectile) {
        // Create pulsing light for mine
        const pulseLight = new THREE.PointLight(0xff0000, 0.7, 5);
        pulseLight.position.copy(projectile.mesh.position);
        pulseLight.position.y += 0.2;
        this.scene.add(pulseLight);
        
        // Add light to projectile for cleanup
        projectile.pulseLight = pulseLight;
        
        // Pulse animation
        let pulseValue = 0;
        const animatePulse = () => {
            if (!projectile.mesh.parent) {
                this.scene.remove(pulseLight);
                return;
            }
            
            pulseValue += 0.1;
            pulseLight.intensity = 0.3 + Math.sin(pulseValue) * 0.4;
            
            requestAnimationFrame(animatePulse);
        };
        
        animatePulse();
    }
    
    createExplosion(position, type) {
        // Use the game's enhanced explosion effect if available
        if (window.game && typeof window.game.createExplosion === 'function') {
            // Determine explosion type based on weapon
            const explosionType = type.name === "Rockets" ? 'standard' : 'large';
            window.game.createExplosion(position, explosionType);
            return;
        }
        
        // Fallback implementation if game's explosion effect is not available
        // Explosion size based on weapon type
        const size = type.name === "Rockets" ? 1.5 : 2.0; // Mines have bigger explosions
        
        // Create flash
        const explosionLight = new THREE.PointLight(0xff5500, 3, size * 10);
        explosionLight.position.copy(position);
        explosionLight.position.y += 1;
        this.scene.add(explosionLight);
        
        // Create explosion particles
        const particleCount = 30;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const pSize = Math.random() * 0.5 + 0.2;
            const particleGeometry = new THREE.SphereGeometry(pSize, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: i % 2 === 0 ? 0xff5500 : 0xffff00,
                transparent: true,
                opacity: 1
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            
            // Random velocity
            const angle = Math.random() * Math.PI * 2;
            const upSpeed = Math.random() * 0.3 + 0.2;
            const outSpeed = Math.random() * 0.3 + 0.2;
            particle.velocity = {
                x: Math.cos(angle) * outSpeed,
                y: upSpeed,
                z: Math.sin(angle) * outSpeed
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
    
    setDamageMultiplier(multiplier) {
        this.damageMultiplier = multiplier;
    }
    
    checkCollision(position, radius) {
        // Check if any projectile is in collision with the given position/radius
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            
            // Skip unarmed mines
            if (projectile.type.name === "Mines" && !projectile.armed) {
                continue;
            }
            
            const distance = position.distanceTo(projectile.mesh.position);
            const hitRadius = projectile.type.name === "Mines" ? 5 : radius;
            
            if (distance < hitRadius) {
                // Calculate damage based on distance for explosives
                let damage = projectile.damage;
                if (projectile.type.name === "Mines" || projectile.type.name === "Rockets") {
                    // Damage falls off with distance
                    const falloff = 1 - (distance / hitRadius);
                    damage = projectile.damage * falloff;
                }
                
                // Create impact effect
                this.createImpactEffect(projectile);
                
                // Remove from scene and array
                this.scene.remove(projectile.mesh);
                
                // Remove pulse light for mines
                if (projectile.pulseLight) {
                    this.scene.remove(projectile.pulseLight);
                }
                
                this.projectiles.splice(i, 1);
                
                // Return damage and impact data
                return {
                    damage: Math.max(5, Math.round(damage)),
                    explosive: projectile.type === WeaponTypes.MINES || projectile.type === WeaponTypes.ROCKETS
                };
            }
        }
        
        return null;
    }
    
    createImpactEffect(projectile) {
        // Create different effects based on weapon type
        if (projectile.type.name === "Rockets" || projectile.type.name === "Mines") {
            // For explosives, create explosion
            this.createExplosion(projectile.mesh.position.clone(), projectile.type);
        } else {
            // For non-explosives, create simpler impact
            const light = new THREE.PointLight(projectile.type.color, 1, 5);
            light.position.copy(projectile.mesh.position);
            this.scene.add(light);
            
            // Create spark particles
            const particleCount = 10;
            const particles = [];
            
            for (let i = 0; i < particleCount; i++) {
                const particleGeometry = new THREE.SphereGeometry(0.1, 6, 6);
                const particleMaterial = new THREE.MeshBasicMaterial({
                    color: projectile.type.color,
                    transparent: true,
                    opacity: 0.8
                });
                
                const particle = new THREE.Mesh(particleGeometry, particleMaterial);
                particle.position.copy(projectile.mesh.position);
                
                // Random velocity
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 0.2 + 0.1;
                particle.velocity = {
                    x: Math.cos(angle) * speed,
                    y: Math.random() * 0.2 + 0.1,
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
                    light.intensity = impactLife / 20;
                    
                    // Update particles
                    for (const particle of particles) {
                        particle.position.x += particle.velocity.x;
                        particle.position.y += particle.velocity.y;
                        particle.position.z += particle.velocity.z;
                        
                        // Apply gravity
                        particle.velocity.y -= 0.01;
                        
                        // Fade out
                        particle.material.opacity = impactLife / 20 * 0.8;
                    }
                    
                    requestAnimationFrame(fadeImpact);
                } else {
                    // Remove light and particles
                    this.scene.remove(light);
                    for (const particle of particles) {
                        this.scene.remove(particle);
                    }
                }
            };
            
            fadeImpact();
        }
    }
}

// Pickup class for weapon pickups
export class WeaponPickup {
    constructor(scene, position, weaponType) {
        this.scene = scene;
        this.position = position;
        this.weaponType = weaponType;
        this.mesh = null;
        this.light = null;
        this.created = false;
        this.createdTime = Date.now();
        this.floatOffset = Math.random() * Math.PI * 2;
        
        this.create();
    }
    
    create() {
        if (this.created) return;
        
        // Create container
        this.mesh = new THREE.Object3D();
        this.mesh.position.copy(this.position);
        
        // Create base geometry based on weapon type
        let geometry;
        
        switch(this.weaponType) {
            case WeaponTypes.MACHINE_GUN:
                geometry = new THREE.BoxGeometry(0.5, 0.3, 1.2);
                break;
            case WeaponTypes.ROCKETS:
                geometry = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
                geometry.rotateZ(Math.PI / 2);
                break;
            case WeaponTypes.SHOTGUN:
                geometry = new THREE.CylinderGeometry(0.1, 0.2, 1.2, 8);
                geometry.rotateZ(Math.PI / 2);
                break;
            case WeaponTypes.MINES:
                geometry = new THREE.SphereGeometry(0.5, 12, 12);
                break;
            default:
                geometry = new THREE.BoxGeometry(0.8, 0.5, 0.5);
        }
        
        // Create material
        const material = new THREE.MeshPhongMaterial({
            color: this.weaponType.color,
            emissive: this.weaponType.color,
            emissiveIntensity: 0.5,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });
        
        const pickupMesh = new THREE.Mesh(geometry, material);
        this.mesh.add(pickupMesh);
        
        // Add a point light to make it glow
        this.light = new THREE.PointLight(this.weaponType.color, 1, 5);
        this.light.position.set(0, 0, 0);
        this.mesh.add(this.light);
        
        // Set initial position
        this.mesh.position.y = 2; // Slightly above ground
        
        // Add to scene
        this.scene.add(this.mesh);
        this.created = true;
    }
    
    update() {
        if (!this.mesh) return;
        
        const now = Date.now();
        
        // Make pickup rotate
        this.mesh.rotation.y += 0.02;
        
        // Make pickup float up and down
        const floatOffset = Math.sin(now * 0.001 + this.floatOffset) * 0.5;
        this.mesh.position.y = 2 + floatOffset;
        
        // Pulse the light
        this.light.intensity = 0.7 + Math.sin(now * 0.003) * 0.3;
        
        // Check if pickup should despawn (after 30 seconds)
        if (now - this.createdTime > 30000) {
            return true; // Signal to remove
        }
        
        return false; // Keep updating
    }
    
    remove() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
    }
    
    createPickupEffect() {
        if (!this.mesh) return;
        
        // Create particles
        const particleCount = 15;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.2, 8, 8);
            const particleMaterial = new THREE.MeshPhongMaterial({
                color: this.weaponType.color,
                emissive: this.weaponType.color,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position around pickup
            const angle = Math.random() * Math.PI * 2;
            const radius = 1;
            particle.position.set(
                this.mesh.position.x + Math.cos(angle) * radius,
                this.mesh.position.y + Math.random() * 2,
                this.mesh.position.z + Math.sin(angle) * radius
            );
            
            // Set velocity - outward
            const speed = Math.random() * 0.2 + 0.1;
            particle.velocity = {
                x: Math.cos(angle) * speed,
                y: Math.random() * 0.2 + 0.1,
                z: Math.sin(angle) * speed
            };
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        // Flash effect
        const flash = new THREE.PointLight(this.weaponType.color, 2, 10);
        flash.position.copy(this.mesh.position);
        this.scene.add(flash);
        
        // Animate particles and flash
        let effectLife = 20;
        const animateEffect = () => {
            effectLife--;
            
            if (effectLife > 0) {
                // Update flash
                flash.intensity = effectLife / 10;
                
                // Update particles
                for (const particle of particles) {
                    particle.position.x += particle.velocity.x;
                    particle.position.y += particle.velocity.y;
                    particle.position.z += particle.velocity.z;
                    
                    // Fade out
                    particle.material.opacity = effectLife / 20 * 0.8;
                }
                
                requestAnimationFrame(animateEffect);
            } else {
                // Remove flash and particles
                this.scene.remove(flash);
                for (const particle of particles) {
                    this.scene.remove(particle);
                }
            }
        };
        
        animateEffect();
    }
}