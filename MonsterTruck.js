function handleControls(accelerating, braking, turningLeft, turningRight) {
    // Validate input parameters
    accelerating = Boolean(accelerating);
    braking = Boolean(braking);
    turningLeft = Boolean(turningLeft);
    turningRight = Boolean(turningRight);
    
    // Ensure speed is a valid number
    if (!Number.isFinite(this.speed)) {
        this.speed = 0;
    }
    
    // Ensure rotation is a valid number
    if (!Number.isFinite(this.rotation)) {
        this.rotation = 0;
    }
    
    // Acceleration and braking with validation
    if (accelerating) {
        this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
    } else if (braking) {
        this.speed = Math.max(this.speed - this.brakingForce, -this.maxSpeed * 0.5);
    } else {
        // Natural deceleration with validation
        this.speed *= (1 - this.deceleration);
    }
    
    // Ensure speed is still valid after calculations
    if (!Number.isFinite(this.speed)) {
        this.speed = 0;
    }
    
    // Turning (more effective at lower speeds)
    const turnFactor = 1 - (Math.abs(this.speed) / this.maxSpeed) * 0.5;
    if (turningLeft) {
        this.rotation -= this.turnSpeed * turnFactor * Math.sign(this.speed);
    }
    if (turningRight) {
        this.rotation += this.turnSpeed * turnFactor * Math.sign(this.speed);
    }
    
    // Ensure rotation is still valid after calculations
    if (!Number.isFinite(this.rotation)) {
        this.rotation = 0;
    }
    
    // Apply movement with validation
    const direction = new THREE.Vector3(
        Math.sin(this.rotation),
        0,
        Math.cos(this.rotation)
    );
    
    // Validate direction vector
    if (!Number.isFinite(direction.x) || !Number.isFinite(direction.z)) {
        console.warn("Invalid direction vector detected. Resetting movement.");
        direction.set(0, 0, 1);
        this.speed = 0;
        this.resetMovementState();
        return;
    }
    
    // Update velocity with grip factor - ensure finite values
    this.velocity.x = Number.isFinite(direction.x * this.speed) ? direction.x * this.speed : 0;
    this.velocity.z = Number.isFinite(direction.z * this.speed) ? direction.z * this.speed : 0;
    
    // Final validation of velocity
    if (!Number.isFinite(this.velocity.x) || !Number.isFinite(this.velocity.z)) {
        console.warn("Invalid velocity detected. Resetting movement.");
        this.velocity.set(0, 0, 0);
        this.speed = 0;
        this.resetMovementState();
        return;
    }
    
    // Apply velocity to position
    this.body.position.add(this.velocity);
    
    // Validate final position
    if (!Number.isFinite(this.body.position.x) || 
        !Number.isFinite(this.body.position.y) || 
        !Number.isFinite(this.body.position.z)) {
        console.warn("Invalid position detected. Resetting position.");
        this.body.position.set(0, 0.5, 0);
        this.velocity.set(0, 0, 0);
        this.speed = 0;
        this.resetMovementState();
        return;
    }
    
    // Update truck rotation
    this.body.rotation.y = this.rotation;
    
    // Update wheel rotation and suspension
    this.updateWheels();
} 