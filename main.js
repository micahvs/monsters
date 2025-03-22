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
                for (let i = 0; i < elements.length; i++) {
                    if (!Number.isFinite(elements[i])) {
                        elements[i] = 0;
                    }
                }
                this.camera.matrixWorldNeedsUpdate = true;
            }

            // ... rest of animate code ...
        } catch (error) {
            console.error("Error in animation loop:", error);
        }
    }
} 