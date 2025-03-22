const DEBUG_MODE = true;

function debugLog(values) {
    if (DEBUG_MODE) {
        console.log('Current values:', values);
    }
}

function updateTruck(delta) {
    // ... existing code ...
    
    // Add validation before updating position
    if (isNaN(newPosition.x) || isNaN(newPosition.y) || isNaN(newPosition.z)) {
        console.warn('Invalid position values detected. Resetting to last valid position.');
        newPosition.copy(this.lastValidPosition); // Assuming you store last valid position
    } else {
        this.lastValidPosition.copy(newPosition);
    }
    
    this.position.copy(newPosition);
    // ... existing code ...
}

function updateAudio(position) {
    // ... existing code ...
    
    // Validate values before updating audio parameters
    const safeValue = Number.isFinite(value) ? value : 0;
    audioParam.linearRampToValueAtTime(safeValue, audioContext.currentTime + duration);
    
    // ... existing code ...
}

function resetMovementState() {
    this.velocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
    // Add any other relevant resets
} 