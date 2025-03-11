import * as THREE from 'three';

export class MonsterTruck {
    constructor(scene, position = new THREE.Vector3(), config = {}) {
        this.scene = scene;
        this.config = config;
        this.isPreview = config.isPreview || false;
        
        // Adjust scale for preview
        this.scale = this.isPreview ? 0.5 : 1;
        
        this.velocity = new THREE.Vector3();
        this.speed = 0;
        this.rotation = 0;
        this.health = 100;
        this.ammo = 30;
        
        // Physics constants
        this.maxSpeed = this.getMaxSpeedForMachine(config.machineType);
        this.acceleration = this.getAccelerationForMachine(config.machineType);
        this.turnSpeed = this.getTurnSpeedForMachine(config.machineType);
        
        this.createTruck(position);
    }
    
    getMaxSpeedForMachine(machineType) {
        const speeds = {
            'grid-ripper': 1.0,
            'neon-crusher': 0.8,
            'cyber-beast': 1.2
        };
        return speeds[machineType] || 1.0;
    }
    
    getAccelerationForMachine(machineType) {
        const acceleration = {
            'grid-ripper': 0.02,
            'neon-crusher': 0.025,
            'cyber-beast': 0.015
        };
        return acceleration[machineType] || 0.02;
    }
    
    getTurnSpeedForMachine(machineType) {
        const turnSpeeds = {
            'grid-ripper': 0.03,
            'neon-crusher': 0.025,
            'cyber-beast': 0.035
        };
        return turnSpeeds[machineType] || 0.03;
    }
    
    createTruck(position) {
        // Create truck body with selected color
        const geometry = new THREE.BoxGeometry(3 * this.scale, 2 * this.scale, 5 * this.scale);
        const material = new THREE.MeshPhongMaterial({
            color: new THREE.Color(this.config.color || '#ff00ff'),
            emissive: new THREE.Color(this.config.color || '#ff00ff').multiplyScalar(0.2),
            specular: new THREE.Color(this.config.color || '#ff00ff'),
            shininess: 30
        });
        
        // Add different geometries based on machine type
        switch(this.config.machineType) {
            case 'neon-crusher':
                // Add extra armor plates and bulkier design
                this.addExtraGeometry('crusher');
                break;
            case 'cyber-beast':
                // Add spoilers and aggressive design
                this.addExtraGeometry('beast');
                break;
            default:
                // Basic grid-ripper design
                this.addExtraGeometry('ripper');
        }
        
        this.body = new THREE.Mesh(geometry, material);
        this.body.position.copy(position);
        
        // Add wheels with suspension
        this.wheels = [];
        const wheelGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 16);
        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
        
        const wheelPositions = [
            { x: -1.5, z: -2 }, // Back Left
            { x: 1.5, z: -2 },  // Back Right
            { x: -1.5, z: 2 },  // Front Left
            { x: 1.5, z: 2 }    // Front Right
        ];
        
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.position.set(pos.x, -0.5, pos.z);
            wheel.rotation.z = Math.PI / 2;
            this.body.add(wheel);
            this.wheels.push({
                mesh: wheel,
                suspension: 0,
                baseY: -0.5
            });
        });
        
        this.scene.add(this.body);
    }
    
    addExtraGeometry(type) {
        // Add unique geometric features based on truck type
        switch(type) {
            case 'crusher':
                // Add armor plates
                const armorGeometry = new THREE.BoxGeometry(3.2 * this.scale, 2.2 * this.scale, 0.2 * this.scale);
                const armorMaterial = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(this.config.color || '#ff00ff'),
                    emissive: new THREE.Color(this.config.color || '#ff00ff').multiplyScalar(0.1)
                });
                const armorPlate = new THREE.Mesh(armorGeometry, armorMaterial);
                this.body.add(armorPlate);
                break;
            case 'beast':
                // Add spoiler
                const spoilerGeometry = new THREE.BoxGeometry(3 * this.scale, 1 * this.scale, 0.2 * this.scale);
                const spoilerMaterial = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(this.config.color || '#ff00ff'),
                    emissive: new THREE.Color(this.config.color || '#ff00ff').multiplyScalar(0.1)
                });
                const spoiler = new THREE.Mesh(spoilerGeometry, spoilerMaterial);
                spoiler.position.set(0, 1 * this.scale, -2 * this.scale);
                this.body.add(spoiler);
                break;
            default:
                // Add streamlined features
                const accentGeometry = new THREE.BoxGeometry(0.2 * this.scale, 0.2 * this.scale, 4 * this.scale);
                const accentMaterial = new THREE.MeshPhongMaterial({
                    color: new THREE.Color(this.config.color || '#ff00ff'),
                    emissive: new THREE.Color(this.config.color || '#ff00ff').multiplyScalar(0.3)
                });
                const accent = new THREE.Mesh(accentGeometry, accentMaterial);
                this.body.add(accent);
        }
    }
    
    handleControls(accelerating, braking, turningLeft, turningRight) {
        // Acceleration and braking
        if (accelerating) {
            this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
        } else if (braking) {
            this.speed = Math.max(this.speed - this.brakingForce, -this.maxSpeed * 0.5);
        } else {
            // Natural deceleration
            this.speed *= (1 - this.deceleration);
        }
        
        // Turning (more effective at lower speeds)
        const turnFactor = 1 - (Math.abs(this.speed) / this.maxSpeed) * 0.5;
        if (turningLeft) {
            this.rotation -= this.turnSpeed * turnFactor * Math.sign(this.speed);
        }
        if (turningRight) {
            this.rotation += this.turnSpeed * turnFactor * Math.sign(this.speed);
        }
        
        // Apply movement
        const direction = new THREE.Vector3(
            Math.sin(this.rotation),
            0,
            Math.cos(this.rotation)
        );
        
        // Update velocity with grip factor
        this.velocity.x = direction.x * this.speed;
        this.velocity.z = direction.z * this.speed;
        
        // Apply velocity to position
        this.body.position.add(this.velocity);
        
        // Update truck rotation
        this.body.rotation.y = this.rotation;
        
        // Update wheel rotation and suspension
        this.updateWheels();
    }
    
    updateWheels() {
        const speedRotation = this.speed * 0.5;
        
        this.wheels.forEach((wheel, index) => {
            // Rotate wheels based on speed
            wheel.mesh.rotation.x += speedRotation;
            
            // Simulate basic suspension
            const time = Date.now() * 0.001;
            const offset = Math.sin(time * 4 + index) * 0.1;
            wheel.suspension = wheel.baseY + offset;
            wheel.mesh.position.y = wheel.suspension;
        });
        
        // Tilt the truck body based on acceleration and turning
        const tiltAngleZ = this.velocity.x * 0.1; // Side tilt when turning
        const tiltAngleX = -this.speed * 0.1;    // Forward/backward tilt
        
        this.body.rotation.z = tiltAngleZ;
        this.body.rotation.x = tiltAngleX;
    }
    
    shoot() {
        if (this.ammo <= 0) return;
        
        // Create projectile
        const projectileGeometry = new THREE.SphereGeometry(0.2);
        const projectileMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff
        });
        
        const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
        projectile.position.copy(this.body.position);
        
        // Add to scene and handle projectile logic
        this.scene.add(projectile);
        this.ammo--;
    }
}
