import * as THREE from 'three'
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
        console.log("Game constructor called")
        
        // Core initialization only
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = null;
        this.truck = null;
        this.multiplayer = null;
        this.isInitialized = false;
        this.debugMode = true;
        this.isGameOver = false;
        this.frameCount = 0;
        
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
        this.projectiles = [];
        
        // Initialize the game
        this.init();
    }

    async init() {
        try {
            // Initialize renderer first
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(this.renderer.domElement);
            
            // Set up camera
            this.camera.position.set(0, 10, 20);
            this.camera.lookAt(0, 0, 0);
            
            // Add basic lighting
            const ambientLight = new THREE.AmbientLight(0x404040);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
            directionalLight.position.set(1, 1, 1);
            this.scene.add(ambientLight, directionalLight);
            
            // Create arena and truck
            await this.createArena();
            await this.createSimpleTruck();
            
            // Set up controls
            this.setupControls();
            
            // Initialize HUD
            this.initHUD();
            
            // Initialize particle pool
            this.initializeParticlePools();
            
            // Start animation loop
            this.animate();
            
            this.isInitialized = true;
            console.log("Game initialized successfully");
            
        } catch (error) {
            console.error("Error in game initialization:", error);
            // Attempt to recover
            this.handleInitError(error);
        }
    }

    handleInitError(error) {
        console.error("Initialization error:", error);
        
        // Clean up any partially initialized resources
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Reset game state
        this.isInitialized = false;
        this.isGameOver = false;
        
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '50%';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translate(-50%, -50%)';
        errorDiv.style.color = 'red';
        errorDiv.style.fontSize = '24px';
        errorDiv.textContent = 'Failed to initialize game. Please refresh the page.';
        document.body.appendChild(errorDiv);
        
        // Attempt to reinitialize after a delay
        setTimeout(() => {
            errorDiv.remove();
            this.init();
        }, 5000);
    }

    // Simplified particle system
    createParticlePool(size = 100) {
        const pool = [];
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.PointsMaterial({
            size: 0.1,
            transparent: true,
            opacity: 0.6
        });
        
        for (let i = 0; i < size; i++) {
            pool.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                active: false
            });
        }
        
        return {
            pool,
            geometry,
            material,
            points: new THREE.Points(geometry, material)
        };
    }

    // Simplified explosion effect
    createExplosion(position, type = 'standard') {
        const particleCount = type === 'standard' ? 20 : 10;
        const particles = this.createParticlePool(particleCount);
        
        for (let i = 0; i < particleCount; i++) {
            const particle = particles.pool[i];
            particle.position.copy(position);
            particle.velocity.set(
                (Math.random() - 0.5) * 0.5,
                Math.random() * 0.5,
                (Math.random() - 0.5) * 0.5
            );
            particle.life = 1.0;
            particle.active = true;
        }
        
        this.scene.add(particles.points);
        return particles;
    }

    // Remove redundant particle systems
    createOptimizedImpactEffect(position, hitType) {
        // Simplified impact effect
        const particleCount = 5;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 8, 8),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.8
                })
            );
            
            particle.position.copy(position);
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.2
            );
            particle.life = 1.0;
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        return particles;
    }

    // Remove redundant explosion effects
    createExplosion(position, type = 'standard') {
        const particleCount = type === 'standard' ? 10 : 5;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.1, 8, 8),
                new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    transparent: true,
                    opacity: 0.8
                })
            );
            
            particle.position.copy(position);
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 0.3,
                (Math.random() - 0.5) * 0.3
            );
            particle.life = 1.0;
            
            this.scene.add(particle);
            particles.push(particle);
        }
        
        return particles;
    }

    // Remove redundant particle pools
    initializeParticlePools() {
        // Single particle pool for all effects
        this.particlePool = {
            particles: [],
            maxSize: 50
        };
    }

    // ... rest of existing code ...
}

// Initialize game when window is fully loaded
window.addEventListener('load', () => {
    console.log("Window loaded, creating game");
    try {
        // Initialize SoundFX global utility
        window.SoundFX = {
            // Keep track of whether audio is unlocked
            audioUnlocked: false,
            
            // Directly play a sound with error handling
            play: function(soundName) {
                if (!soundName) return;
                
                try {
                    // Create a sound path
                    const soundPath = '/sounds/' + soundName + '.mp3'
                    
                    // Create a new audio element
                    const audio = new Audio(soundPath);
                    audio.volume = 0.5;
                    
                    // Try to play with error handling
                    const playPromise = audio.play();
                    if (playPromise) {
                        playPromise.catch(error => {
                            console.log(`SoundFX: Could not play ${soundName}:`, error);
                            
                            // If not allowed, queue for next user interaction
                            if (error.name === 'NotAllowedError' && !this.audioUnlocked) {
                                this.setupUnlockHandlers()
                            }
                        })
                    }
                    return audio;
                } catch (error) {
                    console.error(`SoundFX: Error playing ${soundName}:`, error);
                    return null;
                }
            },
            
            // Unlock audio on first user interaction
            unlockAudio: function() {
                if (this.audioUnlocked) return;
                
                console.log('SoundFX: Unlocking audio context')
                
                try {
                    // Try to play a silent sound
                    const audio = new Audio();
                    audio.volume = 0;
                    const promise = audio.play();
                    
                    if (promise) {
                        promise.then(() => {
                            console.log('SoundFX: Audio unlocked successfully')
                            this.audioUnlocked = true;
                        }).catch(error => {
                            console.error('SoundFX: Could not unlock audio:', error)
                        })
                    }
                    
                    // Also try to unlock AudioContext if available
                    if (window.AudioContext || window.webkitAudioContext) {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        if (ctx.state === 'suspended') {
                            ctx.resume()
                        }
                        
                        // Create and play a silent buffer
                        const source = ctx.createBufferSource();
                        source.buffer = ctx.createBuffer(1, 1, 22050);
                        source.connect(ctx.destination);
                        source.start(0);
                    }
                } catch (e) {
                    console.error('SoundFX: Error in audio unlock:', e)
                }
            },
            
            // Set up event handlers for unlocking audio
            setupUnlockHandlers: function() {
                if (this.handlersSet) return;
                
                console.log('SoundFX: Setting up unlock handlers')
                this.handlersSet = true;
                
                const unlockFn = () => {
                    this.unlockAudio();
                    document.removeEventListener('click', unlockFn)
                    document.removeEventListener('touchstart', unlockFn)
                    document.removeEventListener('keydown', unlockFn)
                }
                
                document.addEventListener('click', unlockFn)
                document.addEventListener('touchstart', unlockFn)
                document.addEventListener('keydown', unlockFn)
            }
        }
        
        // Initialize unlock handlers
        window.SoundFX.setupUnlockHandlers();
        
        // Create game
        window.game = new Game();
        
        // Initialize the game
        window.game.init();
        
        console.log("Game instance created and initialized")
    } catch (error) {
        console.error("Error creating game instance:", error);
    }
})

export { Game }
