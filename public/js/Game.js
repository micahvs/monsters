// In your render/update loop
update() {
    // ... existing code ...
    
    // Limit physics updates to a fixed time step
    const maxDelta = 0.1; // Maximum time step (in seconds)
    if (deltaTime > maxDelta) deltaTime = maxDelta;
    
    // ... existing code ...
}

// Optimize object creation
createGameObjects() {
    // ... existing code ...
    
    // Use object pooling for frequently created/destroyed objects
    this.projectilePool = [];
    this.effectsPool = [];
    
    // Pre-create objects for pooling
    for (let i = 0; i < 20; i++) {
        // Create reusable projectiles/effects
    }
    
    // ... existing code ...
} 