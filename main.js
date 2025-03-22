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
    if (!audioParam || !audioContext) {
        console.warn('Invalid audio parameters: audioParam or audioContext is null');
        return;
    }
    
    // Validate value and duration parameters
    const safeValue = Number.isFinite(value) ? value : 0;
    const safeDuration = Number.isFinite(duration) ? duration : 0.1; // Default small duration
    
    // Use safe values for the audio update
    try {
        audioParam.linearRampToValueAtTime(safeValue, audioContext.currentTime + safeDuration);
    } catch (error) {
        console.error('Error updating audio parameter:', error);
    }
    
    // ... existing code ...
}

function resetMovementState() {
    this.velocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
    // Add any other relevant resets
}

class Game {
    constructor() {
        // ... existing code ...
    }

    init() {
        try {
            // ... existing code ...

            // Add validation for camera matrix
            if (this.camera) {
                // Ensure camera has valid matrix
                if (!this.camera.matrixWorld || !this.camera.matrixWorld.elements) {
                    this.camera.matrixWorld = new THREE.Matrix4();
                }

                // Validate matrix elements
                const elements = this.camera.matrixWorld.elements;
                for (let i = 0; i < elements.length; i++) {
                    if (!Number.isFinite(elements[i])) {
                        elements[i] = 0;
                    }
                }
                
                this.camera.matrixWorldNeedsUpdate = true;
                this.camera.updateMatrixWorld();
            }

            // Initialize sound manager with validated camera
            this.soundManager = new SoundManager(this.camera);
            
            // ... rest of init code ...
        } catch (error) {
            console.error("Error in game initialization:", error);
        }
    }

    animate() {
        try {
            // Validate camera matrix before rendering
            if (this.camera && this.camera.matrixWorld) {
                const elements = this.camera.matrixWorld.elements;
                let hasInvalidElements = false;

                // Check if matrix elements are valid
                for (let i = 0; i < elements.length; i++) {
                    if (!Number.isFinite(elements[i])) {
                        hasInvalidElements = true;
                        break;
                    }
                }

                // Reset matrix if invalid
                if (hasInvalidElements) {
                    console.warn("Invalid camera matrix detected, resetting to identity");
                    this.camera.matrixWorld.identity();
                    this.camera.position.set(0, 10, 20); // Reset to default position
                    this.camera.lookAt(0, 0, 0); // Reset look target
                    this.camera.updateMatrixWorld(true);
                }
            }

            // ... rest of animate code ...
        } catch (error) {
            console.error("Error in animation loop:", error);
        }
    }
} 
} 