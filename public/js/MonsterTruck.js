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
        
        // Get machine-specific values
        const machineType = config.machineType || 'neon-crusher';
        this.maxHealth = this.getMaxHealthForMachine(machineType);
        this.armorRating = this.getArmorRatingForMachine(machineType);
        this.health = this.maxHealth;
        this.ammo = 30;
        this.damageTimeout = 0; // Cooldown for damage visual effects
        
        // Physics constants
        this.maxSpeed = this.getMaxSpeedForMachine(machineType);
        this.acceleration = this.getAccelerationForMachine(machineType);
        this.turnSpeed = this.getTurnSpeedForMachine(machineType);
        
        // Validate position before creating truck
        if (!position || isNaN(position.x) || isNaN(position.y) || isNaN(position.z)) {
            console.warn("Invalid position provided to MonsterTruck constructor! Using default position.");
            position = new THREE.Vector3(0, 0.5, 0);
        }
        
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
    
    getMaxHealthForMachine(machineType) {
        const healthValues = {
            'grid-ripper': 80,    // Fast but fragile
            'neon-crusher': 100,  // Balanced
            'cyber-beast': 120    // Slow but tough
        };
        return healthValues[machineType] || 100;
    }
    
    getArmorRatingForMachine(machineType) {
        const armorValues = {
            'grid-ripper': 0.8,    // 20% less damage resistance
            'neon-crusher': 1.0,   // Base damage resistance
            'cyber-beast': 1.2     // 20% more damage resistance
        };
        return armorValues[machineType] || 1.0;
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
        
        // First create the body
        this.body = new THREE.Mesh(geometry, material);
        this.body.position.copy(position);
        
        // THEN add different geometries based on machine type
        // (after this.body is defined)
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
        
        // Add wheels with suspension
        this.wheels = [];
        
        // Get wheel design based on truck type
        const machineType = this.config.machineType || 'grid-ripper';
        const wheelDesign = this.getWheelDesignForType(machineType);
        
        const wheelGeometry = new THREE.CylinderGeometry(
            wheelDesign.radius, 
            wheelDesign.radius, 
            wheelDesign.width, 
            wheelDesign.segments
        );
        
        const wheelMaterial = new THREE.MeshPhongMaterial({ 
            color: wheelDesign.color,
            shininess: 70,
            specular: 0x444444
        });
        
        // Define wheel positions - adjusted based on truck type
        const wheelPositions = [
            { x: -wheelDesign.offsetX, z: -wheelDesign.offsetZ }, // Back Left
            { x: wheelDesign.offsetX, z: -wheelDesign.offsetZ },  // Back Right
            { x: -wheelDesign.offsetX, z: wheelDesign.offsetZ },  // Front Left
            { x: wheelDesign.offsetX, z: wheelDesign.offsetZ }    // Front Right
        ];
        
        wheelPositions.forEach((pos, index) => {
            // Create main wheel
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.position.set(pos.x, wheelDesign.baseY, pos.z);
            wheel.rotation.z = Math.PI / 2;
            this.body.add(wheel);
            
            // Add wheel rim (hub cap)
            const rimGeometry = new THREE.CylinderGeometry(
                wheelDesign.radius * 0.6, 
                wheelDesign.radius * 0.6, 
                wheelDesign.width + 0.05, 
                wheelDesign.segments
            );
            
            const rimColor = (this.config.color) ? 
                new THREE.Color(this.config.color) : 
                new THREE.Color(0xff00ff);
                
            const rimMaterial = new THREE.MeshPhongMaterial({
                color: 0x111111,
                emissive: rimColor.clone().multiplyScalar(0.2),
                shininess: 100
            });
            
            const rim = new THREE.Mesh(rimGeometry, rimMaterial);
            rim.rotation.z = Math.PI / 2;
            wheel.add(rim);
            
            // Add spokes/details to wheels
            const spokeCount = 5;
            for (let i = 0; i < spokeCount; i++) {
                const angle = (i / spokeCount) * Math.PI * 2;
                const spokeGeometry = new THREE.BoxGeometry(
                    wheelDesign.width + 0.1, 
                    wheelDesign.radius * 0.15, 
                    wheelDesign.radius * 0.8
                );
                
                const spokeMaterial = new THREE.MeshPhongMaterial({
                    color: 0x888888,
                    shininess: 100
                });
                
                const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
                spoke.position.set(0, 0, 0);
                spoke.rotation.x = angle;
                rim.add(spoke);
            }
            
            // Add tire treads
            if (wheelDesign.hasTreads) {
                const treadCount = 8;
                for (let i = 0; i < treadCount; i++) {
                    const angle = (i / treadCount) * Math.PI * 2;
                    const treadGeometry = new THREE.BoxGeometry(
                        wheelDesign.width + 0.01, 
                        wheelDesign.radius * 0.1, 
                        wheelDesign.radius * 1.1
                    );
                    
                    const treadMaterial = new THREE.MeshPhongMaterial({
                        color: 0x222222,
                        shininess: 30
                    });
                    
                    const tread = new THREE.Mesh(treadGeometry, treadMaterial);
                    tread.position.set(0, 0, 0);
                    tread.rotation.x = angle;
                    wheel.add(tread);
                }
            }
            
            // Add glowing effect for specific wheel types
            if (wheelDesign.glowing) {
                const glowLight = new THREE.PointLight(
                    new THREE.Color(this.config.color || '#ff00ff'), 
                    0.3, 
                    2
                );
                glowLight.position.set(0, 0, 0);
                wheel.add(glowLight);
            }
            
            // Store wheel info for animation
            this.wheels.push({
                mesh: wheel,
                suspension: 0,
                baseY: wheelDesign.baseY
            });
        });
        
        this.scene.add(this.body);
    }
    
    addExtraGeometry(type) {
        // Get the base color from config
        const baseColor = new THREE.Color(this.config.color || '#ff00ff');
        const emissiveColor = baseColor.clone().multiplyScalar(0.3);
        const accentColor = this.getAccentColor(baseColor);
        
        // Add unique geometric features based on truck type
        switch(type) {
            case 'crusher':
                // === NEON CRUSHER - HEAVY ARMORED BEAST ===
                // Heavy plated body with energy shields and reinforced frame
                
                // Main armor plates
                const armorGeometry = new THREE.BoxGeometry(3.3 * this.scale, 2.3 * this.scale, 5.2 * this.scale);
                const armorMaterial = new THREE.MeshPhongMaterial({
                    color: baseColor,
                    emissive: emissiveColor,
                    shininess: 50,
                    transparent: true,
                    opacity: 0.9
                });
                const armorPlate = new THREE.Mesh(armorGeometry, armorMaterial);
                armorPlate.position.set(0, 0, 0);
                this.body.add(armorPlate);
                
                // Front heavy bumper
                const bumperGeometry = new THREE.BoxGeometry(3.5 * this.scale, 0.8 * this.scale, 0.6 * this.scale);
                const bumperMaterial = new THREE.MeshPhongMaterial({
                    color: 0x444444,
                    shininess: 80
                });
                const bumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
                bumper.position.set(0, -0.6 * this.scale, 2.5 * this.scale);
                this.body.add(bumper);
                
                // Energy shield rim effect (top)
                const shieldRimGeometry = new THREE.TorusGeometry(1.5 * this.scale, 0.1 * this.scale, 8, 24);
                const shieldRimMaterial = new THREE.MeshPhongMaterial({
                    color: accentColor,
                    emissive: accentColor.clone().multiplyScalar(0.8),
                    transparent: true,
                    opacity: 0.7,
                    shininess: 100
                });
                const shieldRimTop = new THREE.Mesh(shieldRimGeometry, shieldRimMaterial);
                shieldRimTop.rotation.x = Math.PI/2;
                shieldRimTop.position.set(0, 1.2 * this.scale, 0);
                this.body.add(shieldRimTop);
                
                // Add roof-mounted weapon turret
                const turretBaseGeometry = new THREE.CylinderGeometry(0.5 * this.scale, 0.6 * this.scale, 0.3 * this.scale, 8);
                const turretBaseMaterial = new THREE.MeshPhongMaterial({
                    color: 0x333333,
                    shininess: 50
                });
                const turretBase = new THREE.Mesh(turretBaseGeometry, turretBaseMaterial);
                turretBase.position.set(0, 1.2 * this.scale, 0);
                this.body.add(turretBase);
                
                // Turret gun
                const turretGunGeometry = new THREE.CylinderGeometry(0.15 * this.scale, 0.15 * this.scale, 1 * this.scale, 8);
                const turretGunMaterial = new THREE.MeshPhongMaterial({
                    color: 0x111111,
                    shininess: 100
                });
                const turretGun = new THREE.Mesh(turretGunGeometry, turretGunMaterial);
                turretGun.rotation.x = Math.PI/2;
                turretGun.position.set(0, 0.2 * this.scale, 0.5 * this.scale);
                turretBase.add(turretGun);
                
                // Add energy glow to gun tip
                const gunTipGeometry = new THREE.SphereGeometry(0.18 * this.scale, 8, 8);
                const gunTipMaterial = new THREE.MeshPhongMaterial({
                    color: baseColor,
                    emissive: baseColor,
                    emissiveIntensity: 1,
                    transparent: true,
                    opacity: 0.8
                });
                const gunTip = new THREE.Mesh(gunTipGeometry, gunTipMaterial);
                gunTip.position.set(0, 0, 0.5 * this.scale);
                turretGun.add(gunTip);
                
                // Add side armor plates
                const sideArmorGeometry = new THREE.BoxGeometry(0.4 * this.scale, 1.8 * this.scale, 4.8 * this.scale);
                const sideArmorMaterial = new THREE.MeshPhongMaterial({
                    color: 0x333333,
                    shininess: 70
                });
                
                const leftArmor = new THREE.Mesh(sideArmorGeometry, sideArmorMaterial);
                leftArmor.position.set(-1.6 * this.scale, 0, 0);
                this.body.add(leftArmor);
                
                const rightArmor = new THREE.Mesh(sideArmorGeometry, sideArmorMaterial);
                rightArmor.position.set(1.6 * this.scale, 0, 0);
                this.body.add(rightArmor);
                
                // Add light for cool effect
                const crusherLight = new THREE.PointLight(baseColor, 0.8, 5);
                crusherLight.position.set(0, 0.5 * this.scale, 0);
                this.body.add(crusherLight);
                
                break;
                
            case 'beast':
                // === CYBER BEAST - FAST AND FUTURISTIC ===
                // Sleek design with huge spoiler and hover-like effects
                
                // Streamlined body
                const bodyGeometry = new THREE.BoxGeometry(2.8 * this.scale, 1.4 * this.scale, 5.2 * this.scale);
                const bodyMaterial = new THREE.MeshPhongMaterial({
                    color: baseColor,
                    emissive: emissiveColor,
                    shininess: 90,
                    specular: 0xffffff
                });
                const cyberbody = new THREE.Mesh(bodyGeometry, bodyMaterial);
                cyberbody.position.set(0, 0, 0);
                this.body.add(cyberbody);
                
                // Front wedge (pointed front)
                const wedgeGeometry = new THREE.ConeGeometry(1.4 * this.scale, 2 * this.scale, 4);
                wedgeGeometry.rotateX(Math.PI/2);
                const wedgeMaterial = new THREE.MeshPhongMaterial({
                    color: accentColor,
                    shininess: 100
                });
                const wedge = new THREE.Mesh(wedgeGeometry, wedgeMaterial);
                wedge.rotation.z = Math.PI; // Rotate to point forward
                wedge.position.set(0, -0.3 * this.scale, 3 * this.scale);
                this.body.add(wedge);
                
                // Massive multi-level spoiler
                const spoilerBaseGeometry = new THREE.BoxGeometry(3 * this.scale, 0.15 * this.scale, 0.7 * this.scale);
                const spoilerMaterial = new THREE.MeshPhongMaterial({
                    color: 0x222222,
                    emissive: baseColor.clone().multiplyScalar(0.2),
                    shininess: 80
                });
                const spoilerBase = new THREE.Mesh(spoilerBaseGeometry, spoilerMaterial);
                spoilerBase.position.set(0, 0.8 * this.scale, -2.2 * this.scale);
                this.body.add(spoilerBase);
                
                // Top spoiler level
                const spoilerTopGeometry = new THREE.BoxGeometry(2.6 * this.scale, 0.15 * this.scale, 0.5 * this.scale);
                const spoilerTopMaterial = new THREE.MeshPhongMaterial({
                    color: baseColor,
                    emissive: baseColor.clone().multiplyScalar(0.4),
                    shininess: 100
                });
                const spoilerTop = new THREE.Mesh(spoilerTopGeometry, spoilerTopMaterial);
                spoilerTop.position.set(0, 0.5 * this.scale, 0);
                spoilerBase.add(spoilerTop);
                
                // Spoiler vertical supports
                const supportGeometry = new THREE.BoxGeometry(0.15 * this.scale, 0.5 * this.scale, 0.15 * this.scale);
                const supportMaterial = new THREE.MeshPhongMaterial({
                    color: 0x333333,
                    shininess: 70
                });
                
                const leftSupport = new THREE.Mesh(supportGeometry, supportMaterial);
                leftSupport.position.set(-1.2 * this.scale, 0.25 * this.scale, 0);
                spoilerBase.add(leftSupport);
                
                const rightSupport = new THREE.Mesh(supportGeometry, supportMaterial);
                rightSupport.position.set(1.2 * this.scale, 0.25 * this.scale, 0);
                spoilerBase.add(rightSupport);
                
                // Add side fins
                const finGeometry = new THREE.BoxGeometry(0.15 * this.scale, 0.7 * this.scale, 2 * this.scale);
                const finMaterial = new THREE.MeshPhongMaterial({
                    color: accentColor,
                    emissive: accentColor.clone().multiplyScalar(0.3),
                    shininess: 80
                });
                
                const leftFin = new THREE.Mesh(finGeometry, finMaterial);
                leftFin.position.set(-1.5 * this.scale, 0.4 * this.scale, -1 * this.scale);
                this.body.add(leftFin);
                
                const rightFin = new THREE.Mesh(finGeometry, finMaterial);
                rightFin.position.set(1.5 * this.scale, 0.4 * this.scale, -1 * this.scale);
                this.body.add(rightFin);
                
                // Add engine exhausts with glow
                const exhaustGeometry = new THREE.CylinderGeometry(0.3 * this.scale, 0.4 * this.scale, 0.5 * this.scale, 8);
                exhaustGeometry.rotateX(Math.PI/2);
                const exhaustMaterial = new THREE.MeshPhongMaterial({
                    color: 0x333333,
                    emissive: 0x331111,
                    shininess: 100
                });
                
                const leftExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
                leftExhaust.position.set(-0.8 * this.scale, -0.3 * this.scale, -2.5 * this.scale);
                this.body.add(leftExhaust);
                
                const rightExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
                rightExhaust.position.set(0.8 * this.scale, -0.3 * this.scale, -2.5 * this.scale);
                this.body.add(rightExhaust);
                
                // Add exhaust flames with glow
                const flameGeometry = new THREE.ConeGeometry(0.25 * this.scale, 1 * this.scale, 8);
                flameGeometry.rotateX(Math.PI/-2);
                const flameMaterial = new THREE.MeshPhongMaterial({
                    color: 0xff3300,
                    emissive: 0xff5500,
                    transparent: true,
                    opacity: 0.7
                });
                
                const leftFlame = new THREE.Mesh(flameGeometry, flameMaterial);
                leftFlame.position.set(0, 0, -0.7 * this.scale);
                leftExhaust.add(leftFlame);
                
                const rightFlame = new THREE.Mesh(flameGeometry, flameMaterial);
                rightFlame.position.set(0, 0, -0.7 * this.scale);
                rightExhaust.add(rightFlame);
                
                // Add flame light
                const flameLight = new THREE.PointLight(0xff5500, 1, 4);
                flameLight.position.set(0, -0.3 * this.scale, -3 * this.scale);
                this.body.add(flameLight);
                
                break;
                
            default: // grid-ripper
                // === GRID RIPPER - AGILE LIGHT FRAME ===
                // Low profile, sleek design with sharp edges
                
                // Sleek low-profile body
                const ripperBodyGeometry = new THREE.BoxGeometry(2.5 * this.scale, 1.2 * this.scale, 5 * this.scale);
                const ripperBodyMaterial = new THREE.MeshPhongMaterial({
                    color: baseColor, 
                    emissive: emissiveColor,
                    shininess: 80
                });
                const ripperBody = new THREE.Mesh(ripperBodyGeometry, ripperBodyMaterial);
                ripperBody.position.set(0, 0, 0);
                this.body.add(ripperBody);
                
                // Sleek windshield/cockpit
                const cockpitGeometry = new THREE.BoxGeometry(2 * this.scale, 0.4 * this.scale, 2 * this.scale);
                const cockpitMaterial = new THREE.MeshPhongMaterial({
                    color: 0x111111,
                    emissive: 0x222222,
                    shininess: 100,
                    transparent: true,
                    opacity: 0.7
                });
                const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
                cockpit.position.set(0, 0.8 * this.scale, 0.5 * this.scale);
                this.body.add(cockpit);
                
                // Add aerodynamic nose cone
                const noseGeometry = new THREE.ConeGeometry(1.25 * this.scale, 1.5 * this.scale, 4);
                noseGeometry.rotateX(Math.PI/2);
                noseGeometry.rotateZ(Math.PI/4); // Rotate to align corners with the body
                const noseMaterial = new THREE.MeshPhongMaterial({
                    color: accentColor,
                    shininess: 90
                });
                const nose = new THREE.Mesh(noseGeometry, noseMaterial);
                nose.position.set(0, -0.1 * this.scale, 3 * this.scale);
                this.body.add(nose);
                
                // Add sleek light strips along sides
                const stripGeometry = new THREE.BoxGeometry(0.1 * this.scale, 0.1 * this.scale, 4 * this.scale);
                const stripMaterial = new THREE.MeshPhongMaterial({
                    color: baseColor,
                    emissive: baseColor,
                    emissiveIntensity: 1,
                    transparent: true,
                    opacity: 0.8
                });
                
                const leftStrip = new THREE.Mesh(stripGeometry, stripMaterial);
                leftStrip.position.set(-1.3 * this.scale, 0.2 * this.scale, 0);
                this.body.add(leftStrip);
                
                const rightStrip = new THREE.Mesh(stripGeometry, stripMaterial);
                rightStrip.position.set(1.3 * this.scale, 0.2 * this.scale, 0);
                this.body.add(rightStrip);
                
                // Low profile stabilizer fins
                const stabilizersGeometry = new THREE.BoxGeometry(3 * this.scale, 0.1 * this.scale, 0.6 * this.scale);
                const stabilizersMaterial = new THREE.MeshPhongMaterial({
                    color: 0x333333,
                    shininess: 80
                });
                const stabilizers = new THREE.Mesh(stabilizersGeometry, stabilizersMaterial);
                stabilizers.position.set(0, 0.4 * this.scale, -2.2 * this.scale);
                this.body.add(stabilizers);
                
                // Add front light bar
                const lightBarGeometry = new THREE.BoxGeometry(2 * this.scale, 0.2 * this.scale, 0.1 * this.scale);
                const lightBarMaterial = new THREE.MeshPhongMaterial({
                    color: 0xffffff,
                    emissive: 0xffffff,
                    emissiveIntensity: 1
                });
                const lightBar = new THREE.Mesh(lightBarGeometry, lightBarMaterial);
                lightBar.position.set(0, 0.6 * this.scale, 2.6 * this.scale);
                this.body.add(lightBar);
                
                // Add a point light for the headlights
                const headlight = new THREE.PointLight(0xffffff, 0.7, 10);
                headlight.position.set(0, 0.6 * this.scale, 3 * this.scale);
                this.body.add(headlight);
        }
        
        // Add glow effect to the vehicle based on the color
        const glow = new THREE.PointLight(baseColor, 0.5, 3);
        glow.position.set(0, 0, 0);
        this.body.add(glow);
    }
    
    // Helper method to get complementary accent color
    getAccentColor(baseColor) {
        // Create a complementary or contrasting color
        const hsl = {};
        baseColor.getHSL(hsl);
        
        // Shift hue by 180 degrees for complementary color
        hsl.h = (hsl.h + 0.5) % 1.0;
        
        // Ensure high saturation and reasonable lightness
        hsl.s = Math.min(1, hsl.s + 0.2);
        hsl.l = Math.max(0.3, Math.min(0.7, hsl.l));
        
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
    }
    
    // Helper method to get wheel design based on machine type
    getWheelDesignForType(machineType) {
        switch(machineType) {
            case 'neon-crusher':
                // Heavy-duty armored wheels with treads
                return {
                    radius: 1.2 * this.scale,
                    width: 0.7 * this.scale,
                    segments: 16,
                    color: 0x222222,
                    baseY: -0.7 * this.scale,
                    offsetX: 1.7 * this.scale,
                    offsetZ: 2.0 * this.scale,
                    hasTreads: true,
                    glowing: false
                };
                
            case 'cyber-beast':
                // Sleek, futuristic wheels with glow effect
                return {
                    radius: 1.0 * this.scale,
                    width: 0.4 * this.scale,
                    segments: 24, // More segments for smoother look
                    color: 0x333333,
                    baseY: -0.6 * this.scale,
                    offsetX: 1.6 * this.scale,
                    offsetZ: 2.1 * this.scale,
                    hasTreads: false,
                    glowing: true
                };
                
            default: // grid-ripper
                // Low profile, sporty wheels
                return {
                    radius: 0.9 * this.scale,
                    width: 0.5 * this.scale,
                    segments: 20,
                    color: 0x222222,
                    baseY: -0.5 * this.scale,
                    offsetX: 1.5 * this.scale,
                    offsetZ: 2.0 * this.scale,
                    hasTreads: false,
                    glowing: false
                };
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
        
        // VALIDATION: Check for NaN values in direction and speed
        if (isNaN(direction.x) || isNaN(direction.z) || isNaN(this.speed)) {
            console.warn("NaN values detected in movement calculation! Resetting values.");
            direction.set(0, 0, 1);
            this.speed = 0;
            
            // Call resetMovementState to ensure all motion variables are reset
            if (typeof this.resetMovementState === 'function') {
                this.resetMovementState();
            } else {
                // Fallback if resetMovementState is not available
                this.velocity = this.velocity || new THREE.Vector3(0, 0, 0);
                this.velocity.set(0, 0, 0);
                
                // Check if acceleration is a number or object
                if (typeof this.acceleration === 'number') {
                    this.acceleration = 0.02; // Reset to default acceleration value
                } else if (this.acceleration && typeof this.acceleration.set === 'function') {
                    this.acceleration.set(0, 0, 0);
                }
                // Don't try to use acceleration.set if it's just a number
            }
        }
        
        // Update velocity with grip factor - ensure finite values
        this.velocity.x = Number.isFinite(direction.x * this.speed) ? direction.x * this.speed : 0;
        this.velocity.z = Number.isFinite(direction.z * this.speed) ? direction.z * this.speed : 0;
        
        // VALIDATION: Check for NaN values in velocity
        if (isNaN(this.velocity.x) || isNaN(this.velocity.z)) {
            console.warn("NaN values detected in velocity! Resetting values.");
            this.velocity.set(0, 0, 0);
            this.speed = 0;
        }
        
        // Apply velocity to position
        this.body.position.add(this.velocity);
        
        // VALIDATION: Final check for position validity
        if (isNaN(this.body.position.x) || isNaN(this.body.position.y) || isNaN(this.body.position.z)) {
            console.warn("NaN values detected in truck position! Resetting position.");
            this.body.position.set(0, 0.5, 0);
        }
        
        // Update truck rotation
        this.body.rotation.y = this.rotation;
        
        // Update wheel rotation and suspension
        this.updateWheels();
    }
    
    updateWheels() {
        const speedRotation = this.speed * 0.5;
        const machineType = this.config.machineType || 'grid-ripper';
        const time = Date.now() * 0.001;
        
        // Different vehicles have different suspension characteristics
        const suspensionSettings = {
            'neon-crusher': {
                stiffness: 0.05,    // Stiffer suspension (less movement)
                frequency: 3,       // Slower oscillation
                amplitude: 0.07     // Lesser movement
            },
            'cyber-beast': {
                stiffness: 0.12,    // Looser suspension (more movement)
                frequency: 5,       // Faster oscillation
                amplitude: 0.15     // More dramatic movement
            },
            'grid-ripper': {
                stiffness: 0.08,    // Medium suspension
                frequency: 4,       // Medium oscillation
                amplitude: 0.1      // Medium movement
            }
        };
        
        // Get settings based on vehicle type or fall back to grid-ripper
        const settings = suspensionSettings[machineType] || suspensionSettings['grid-ripper'];
        
        this.wheels.forEach((wheel, index) => {
            // Rotate wheels based on speed with some randomness for realism
            wheel.mesh.rotation.x += speedRotation * (1 + Math.sin(time + index) * 0.05);
            
            // Simulate suspension with type-specific characteristics
            const offset = Math.sin(time * settings.frequency + index) * settings.amplitude;
            const speedFactor = Math.min(1, Math.abs(this.speed) * 5); // More suspension movement at higher speeds
            wheel.suspension = wheel.baseY + (offset * speedFactor);
            wheel.mesh.position.y = wheel.suspension;
            
            // Add wheel effects based on vehicle type
            if (machineType === 'cyber-beast' && this.speed > 0.3) {
                // Add wheel trail/glow for Cyber Beast at high speeds
                const children = wheel.mesh.children;
                for (let i = 0; i < children.length; i++) {
                    if (children[i].isPointLight) {
                        children[i].intensity = 0.3 + (Math.abs(this.speed) * 0.5);
                        children[i].distance = 2 + (Math.abs(this.speed) * 1.5);
                    }
                }
            }
        });
        
        // Enhanced vehicle body physics based on speed, turning and machine type
        
        // Side tilt when turning (more pronounced for Grid Ripper)
        let tiltAngleZ = this.velocity.x * 0.1;
        if (machineType === 'grid-ripper') tiltAngleZ *= 1.5;
        if (machineType === 'neon-crusher') tiltAngleZ *= 0.7;
        
        // Forward/backward tilt
        let tiltAngleX = -this.speed * 0.1;
        
        // Add some oscillation for better physical feel
        const oscillation = Math.sin(time * 10) * 0.01 * Math.min(1, Math.abs(this.speed) * 10);
        
        // Apply rotation to body with some damping/smoothing
        this.body.rotation.z = tiltAngleZ + (machineType === 'cyber-beast' ? oscillation * 0.5 : 0);
        this.body.rotation.x = tiltAngleX + oscillation;
        
        // Vehicle-specific effects
        if (machineType === 'cyber-beast' && Math.abs(this.speed) > 0.5) {
            // Find flame objects for cyber-beast and adjust based on speed
            this.body.traverse(child => {
                // Look for flame objects (cones at the back)
                if (child.geometry && 
                    child.geometry.type === 'ConeGeometry' &&
                    child.position.z < -0.3) {
                    
                    // Adjust scale based on speed
                    const baseScale = 1.0;
                    const speedScale = Math.min(2, 1 + (Math.abs(this.speed) * 1.5));
                    
                    child.scale.set(
                        baseScale,
                        baseScale * speedScale, // Make flame longer with speed
                        baseScale
                    );
                    
                    // Randomly flicker flames
                    child.material.opacity = 0.5 + Math.random() * 0.5;
                }
            });
        }
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
    
    takeDamage(amount) {
        // If we're already showing damage effect, skip
        if (this.damageTimeout > 0) return;
        
        // Apply armor rating to reduce damage (higher armor = less damage)
        const actualDamage = Math.floor(amount / this.armorRating);
        this.health = Math.max(0, this.health - actualDamage);
        
        // Visual effect for damage - flash the vehicle
        const originalMaterials = [];
        const flashMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });
        
        // Store original materials and apply flash
        this.body.traverse(child => {
            if (child.isMesh) {
                originalMaterials.push({
                    mesh: child,
                    material: child.material
                });
                child.material = flashMaterial;
            }
        });
        
        // Reset cooldown
        this.damageTimeout = 15; // 15 frames
        
        // Reset materials after flash
        setTimeout(() => {
            originalMaterials.forEach(item => {
                item.mesh.material = item.material;
            });
            this.damageTimeout = 0;
        }, 200);
        
        // Create spark particles from impact
        this.createDamageParticles(actualDamage);
        
        return actualDamage;
    }
    
    createDamageParticles(amount) {
        // Number of particles based on damage amount
        const particleCount = Math.min(20, Math.max(5, amount / 5));
        
        for (let i = 0; i < particleCount; i++) {
            // Create small spark geometry
            const sparkGeometry = new THREE.SphereGeometry(0.1, 4, 4);
            const sparkMaterial = new THREE.MeshBasicMaterial({
                color: 0xff3300,
                emissive: 0xff3300,
                transparent: true,
                opacity: 1
            });
            
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            
            // Position at random point on truck body
            spark.position.copy(this.body.position);
            spark.position.x += (Math.random() - 0.5) * 2;
            spark.position.y += (Math.random() * 2);
            spark.position.z += (Math.random() - 0.5) * 3;
            
            // Add to scene
            this.scene.add(spark);
            
            // Animate and remove spark
            const velocityX = (Math.random() - 0.5) * 0.15;
            const velocityY = Math.random() * 0.1 + 0.05;
            const velocityZ = (Math.random() - 0.5) * 0.15;
            
            let life = 1.0;
            
            const animateSpark = () => {
                if (life <= 0) {
                    this.scene.remove(spark);
                    return;
                }
                
                // Move spark
                spark.position.x += velocityX;
                spark.position.y += velocityY;
                spark.position.z += velocityZ;
                
                // Apply gravity
                spark.position.y -= 0.01;
                
                // Fade out
                life -= 0.05;
                spark.material.opacity = life;
                
                requestAnimationFrame(animateSpark);
            };
            
            animateSpark();
        }
    }
    
    update() {
        // Update damage cooldown
        if (this.damageTimeout > 0) {
            this.damageTimeout--;
        }
    }
}
