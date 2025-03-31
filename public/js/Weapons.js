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
    constructor(game, scene, type = WeaponTypes.MACHINE_GUN) {
        this.game = game;
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
            return null; // Can't shoot
        }
        
        // Set cooldown
        this.cooldownTimer = this.type.cooldown;
        
        // Use ammo
        this.ammo--;
        
        // Acquire projectiles from the pool
        const pooledProjectiles = [];
        
        for (let i = 0; i < this.type.projectilesPerShot; i++) {
            const pooledProjectile = this.game.objectPools.acquire('projectiles');
            if (!pooledProjectile) {
                console.warn("Weapon.shoot: Failed to acquire projectile from pool.");
                continue; // Skip if pool is exhausted
            }

            let shotDirection = direction.clone();
            
            // Apply spread if needed
            if (this.type.spread > 0) {
                const spreadX = (Math.random() - 0.5) * this.type.spread;
                const spreadY = (Math.random() - 0.5) * this.type.spread * 0.5; // Less vertical spread
                const spreadZ = (Math.random() - 0.5) * this.type.spread;
                
                shotDirection.x += spreadX;
                shotDirection.y += spreadY;
                shotDirection.z += spreadZ;
                shotDirection.normalize();
            }
            
            // Configure the acquired projectile
            pooledProjectile.setup(
                position, 
                shotDirection, 
                this.type.speed, 
                this.type.damage * this.damageMultiplier, 
                this.type === WeaponTypes.MINES ? 600 : 100, // lifetime
                source, 
                this.type // Pass weapon type for visuals/behavior
            );

            // Specific setup for mines
            if (this.type === WeaponTypes.MINES) {
                pooledProjectile.armed = false;
                pooledProjectile.armTimer = 30;
            } else {
                 pooledProjectile.armed = true;
                 pooledProjectile.armTimer = 0;
            }

            // Ensure mesh is visible and positioned correctly
            // Note: The pool's acquire/setup might handle scene add/visibility
            pooledProjectile.mesh.position.copy(position);
             // Offset for multiple projectiles
            const offsetX = this.type.projectilesPerShot > 1 ? (i - Math.floor(this.type.projectilesPerShot / 2)) * 0.2 : 0;
            pooledProjectile.mesh.position.x += offsetX;

            // Update mesh appearance based on weapon type (assuming setup does this)
            // pooledProjectile.updateAppearance(this.type); 

            pooledProjectiles.push(pooledProjectile);
            // REMOVED: Don't add to internal this.projectiles array
            // this.projectiles.push(projectileData);
        }
        
        // Create muzzle flash based on weapon type
        if (this.type !== WeaponTypes.MINES) {
            this.createMuzzleFlash(position, direction);
        }
        
        // Auto reload if needed
        if (this.ammo === 0 && !this.isReloading) {
            this.startReload();
        }
        
        // Return the list of POOLED projectiles
        return pooledProjectiles.length > 0 ? pooledProjectiles : null;
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
        
        // Update active trails
        if (this.activeTrails && this.activeTrails.length > 0) {
            this.updateTrails();
        }
        
        // Update active muzzle flashes
        if (this.activeFlashes && this.activeFlashes.length > 0) {
            this.updateMuzzleFlashes();
        }
        
        return {
            ammo: this.ammo,
            maxAmmo: this.maxAmmo,
            isReloading: this.isReloading,
            reloadProgress: this.isReloading ? 1 - (this.reloadTimer / this.reloadTime) : 0,
            cooldownProgress: this.type.cooldown > 0 ? 1 - (this.cooldownTimer / this.type.cooldown) : 1
        };
    }
    
    reload() {
        // Don't reload if already full or already reloading
        if (this.ammo >= this.maxAmmo || this.isReloading) {
            return false;
        }
        
        this.startReload();
        return true;
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
    
    // Initialize muzzle flash pool
    initializeMuzzleFlashPool() {
        if (this.muzzleFlashPool) return; // Already initialized
        
        this.muzzleFlashPool = {
            lights: [],
            meshes: {
                rocket: [],
                shotgun: [],
                machineGun: []
            }
        };
        
        this.activeFlashes = [];
        
        // Create lights
        for (let i = 0; i < 20; i++) {
            const light = new THREE.PointLight(0xffffff, 0, 5);
            light.visible = false;
            this.scene.add(light);
            
            this.muzzleFlashPool.lights.push({
                light: light,
                inUse: false
            });
        }
        
        // Create meshes for each weapon type
        // Rocket flashes
        for (let i = 0; i < 5; i++) {
            const geometry = new THREE.ConeGeometry(0.5, 1, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.visible = false;
            this.scene.add(mesh);
            
            this.muzzleFlashPool.meshes.rocket.push({
                mesh: mesh,
                inUse: false
            });
        }
        
        // Shotgun flashes
        for (let i = 0; i < 5; i++) {
            const geometry = new THREE.CylinderGeometry(0.3, 0.6, 0.5, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.visible = false;
            this.scene.add(mesh);
            
            this.muzzleFlashPool.meshes.shotgun.push({
                mesh: mesh,
                inUse: false
            });
        }
        
        // Machine gun flashes
        for (let i = 0; i < 10; i++) {
            const geometry = new THREE.PlaneGeometry(0.6, 0.6);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.visible = false;
            this.scene.add(mesh);
            
            this.muzzleFlashPool.meshes.machineGun.push({
                mesh: mesh,
                inUse: false
            });
        }
    }
    
    // Get flash light from pool
    getFlashLightFromPool() {
        if (!this.muzzleFlashPool) {
            this.initializeMuzzleFlashPool();
        }
        
        // Find first available light
        for (let i = 0; i < this.muzzleFlashPool.lights.length; i++) {
            if (!this.muzzleFlashPool.lights[i].inUse) {
                this.muzzleFlashPool.lights[i].inUse = true;
                this.muzzleFlashPool.lights[i].light.visible = true;
                return this.muzzleFlashPool.lights[i];
            }
        }
        
        // If no lights available, reuse the first one
        this.muzzleFlashPool.lights[0].light.visible = true;
        return this.muzzleFlashPool.lights[0];
    }
    
    // Get flash mesh from pool
    getFlashMeshFromPool(weaponType) {
        if (!this.muzzleFlashPool) {
            this.initializeMuzzleFlashPool();
        }
        
        let meshType = 'machineGun'; // Default
        
        if (weaponType === WeaponTypes.ROCKETS) {
            meshType = 'rocket';
        } else if (weaponType === WeaponTypes.SHOTGUN) {
            meshType = 'shotgun';
        }
        
        // Find first available mesh of the right type
        const meshes = this.muzzleFlashPool.meshes[meshType];
        for (let i = 0; i < meshes.length; i++) {
            if (!meshes[i].inUse) {
                meshes[i].inUse = true;
                meshes[i].mesh.visible = true;
                return meshes[i];
            }
        }
        
        // If no meshes available, reuse the first one
        meshes[0].mesh.visible = true;
        return meshes[0];
    }
    
    // Update all active muzzle flashes
    updateMuzzleFlashes() {
        for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
            const flash = this.activeFlashes[i];
            
            // Update lifetime
            flash.life--;
            
            if (flash.life <= 0) {
                // Release back to pool
                flash.lightObj.inUse = false;
                flash.lightObj.light.visible = false;
                flash.lightObj.light.intensity = 0;
                
                flash.meshObj.inUse = false;
                flash.meshObj.mesh.visible = false;
                flash.meshObj.mesh.material.opacity = 0;
                
                // Remove from active flashes
                this.activeFlashes.splice(i, 1);
                continue;
            }
            
            // Update intensity and opacity
            const progress = flash.life / flash.maxLife;
            flash.lightObj.light.intensity = progress * 2;
            flash.meshObj.mesh.material.opacity = progress;
        }
    }
    
    createMuzzleFlash(position, direction) {
        // Initialize muzzle flash pool if needed
        if (!this.muzzleFlashPool) {
            this.initializeMuzzleFlashPool();
        }
        
        // Get light from pool
        const lightObj = this.getFlashLightFromPool();
        lightObj.light.position.copy(position);
        lightObj.light.color.set(this.type.color);
        lightObj.light.intensity = 2;
        
        // Get mesh from pool
        const meshObj = this.getFlashMeshFromPool(this.type);
        meshObj.mesh.position.copy(position);
        meshObj.mesh.material.color.set(this.type.color);
        meshObj.mesh.material.opacity = 1;
        
        // Orient the flash
        meshObj.mesh.lookAt(
            position.x + direction.x, 
            position.y + direction.y, 
            position.z + direction.z
        );
        
        // Create flash data
        const flashData = {
            lightObj: lightObj,
            meshObj: meshObj,
            life: 5,
            maxLife: 5
        };
        
        // Add to active flashes
        this.activeFlashes.push(flashData);
    }
    
    // Initialize trail particle pool
    initializeTrailPool() {
        if (this.trailPool) return; // Already initialized
        
        this.trailPool = [];
        this.activeTrails = [];
        
        // Create small trail particles for regular weapons
        for (let i = 0; i < 100; i++) {
            // Regular weapon trails (smaller)
            const trailGeometry = new THREE.SphereGeometry(0.05, 8, 8);
            const trailMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff, // Will be set to weapon color when used
                transparent: true,
                opacity: 0
            });
            
            const trail = new THREE.Mesh(trailGeometry, trailMaterial);
            trail.visible = false;
            this.scene.add(trail);
            
            this.trailPool.push({
                mesh: trail,
                inUse: false,
                type: 'regular'
            });
            
            // Rocket trails (larger)
            if (i < 50) {
                const rocketTrailGeometry = new THREE.SphereGeometry(0.2, 8, 8);
                const rocketTrailMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0
                });
                
                const rocketTrail = new THREE.Mesh(rocketTrailGeometry, rocketTrailMaterial);
                rocketTrail.visible = false;
                this.scene.add(rocketTrail);
                
                this.trailPool.push({
                    mesh: rocketTrail,
                    inUse: false,
                    type: 'rocket'
                });
            }
        }
    }
    
    // Get trail from pool
    getTrailFromPool(isRocket) {
        if (!this.trailPool) {
            this.initializeTrailPool();
        }
        
        const trailType = isRocket ? 'rocket' : 'regular';
        
        // Find first available trail of the right type
        for (let i = 0; i < this.trailPool.length; i++) {
            if (!this.trailPool[i].inUse && this.trailPool[i].type === trailType) {
                this.trailPool[i].inUse = true;
                this.trailPool[i].mesh.visible = true;
                return this.trailPool[i];
            }
        }
        
        // If no trails available, reuse the oldest one of the right type
        for (let i = 0; i < this.trailPool.length; i++) {
            if (this.trailPool[i].type === trailType) {
                this.trailPool[i].mesh.visible = true;
                return this.trailPool[i];
            }
        }
        
        // Fallback to any available trail
        return this.trailPool[0];
    }
    
    // Update all active trails
    updateTrails() {
        for (let i = this.activeTrails.length - 1; i >= 0; i--) {
            const trail = this.activeTrails[i];
            
            // Update lifetime
            trail.life--;
            
            if (trail.life <= 0) {
                // Release back to pool
                trail.trailObj.inUse = false;
                trail.trailObj.mesh.visible = false;
                trail.trailObj.mesh.material.opacity = 0;
                
                // Remove from active trails
                this.activeTrails.splice(i, 1);
                continue;
            }
            
            // Update position for rocket trails to create smoke effect
            if (trail.velocity) {
                trail.trailObj.mesh.position.x += trail.velocity.x;
                trail.trailObj.mesh.position.y += trail.velocity.y;
                trail.trailObj.mesh.position.z += trail.velocity.z;
            }
            
            // Update opacity
            const progress = 1 - (trail.life / trail.maxLife);
            trail.trailObj.mesh.material.opacity = (1 - progress) * 0.7;
            
            // Shrink trail over time
            trail.trailObj.mesh.scale.multiplyScalar(0.95);
        }
    }
    
    createProjectileTrail(projectile) {
        // Skip trail for mines
        if (projectile.type === WeaponTypes.MINES) return;
        
        // Initialize trail pool if needed
        if (!this.trailPool) {
            this.initializeTrailPool();
        }
        
        // Get trail from pool
        const isRocket = projectile.type === WeaponTypes.ROCKETS;
        const trailObj = this.getTrailFromPool(isRocket);
        
        // Set trail properties
        const trail = trailObj.mesh;
        trail.position.copy(projectile.mesh.position);
        trail.material.color.set(projectile.type.color);
        trail.material.opacity = 0.7;
        trail.scale.set(1, 1, 1);
        
        // Create trail data
        const trailData = {
            trailObj: trailObj,
            life: isRocket ? 20 : 10,
            maxLife: isRocket ? 20 : 10,
            velocity: null
        };
        
        // Add velocity for rocket trails
        if (isRocket) {
            const angle = Math.random() * Math.PI * 2;
            trailData.velocity = {
                x: Math.cos(angle) * 0.05,
                y: Math.random() * 0.05,
                z: Math.sin(angle) * 0.05
            };
        }
        
        // Add to active trails
        this.activeTrails.push(trailData);
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
            const hitRadius = projectile.type.name === "Mines" ? 3 : radius;
            
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