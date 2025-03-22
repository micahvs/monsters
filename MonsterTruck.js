function handleControls(delta) {
    // ... existing code ...
    
    // Add validation for movement calculations
    const velocity = {
        x: Number.isFinite(calculatedX) ? calculatedX : 0,
        y: Number.isFinite(calculatedY) ? calculatedY : 0,
        z: Number.isFinite(calculatedZ) ? calculatedZ : 0
    };
    
    // If all values are invalid, reset to default state
    if (!Number.isFinite(calculatedX) && !Number.isFinite(calculatedY) && !Number.isFinite(calculatedZ)) {
        console.warn('NaN values detected in movement calculation! Resetting values.');
        this.resetMovementState(); // Implement this method to reset velocity, acceleration, etc.
        return;
    }
    
    // ... existing code ...
} 