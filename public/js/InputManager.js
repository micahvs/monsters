// Optimize touch input handling
setupTouchControls() {
    // ... existing code ...
    
    // Use passive event listeners for better performance
    this.touchElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    this.touchElement.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    
    // Add touch event debouncing
    this.lastTouchTime = 0;
    this.touchThrottleMs = 16; // ~60fps
    
    // ... existing code ...
}

handleTouchMove(event) {
    // ... existing code ...
    
    // Throttle touch events for better performance
    const now = performance.now();
    if (now - this.lastTouchTime < this.touchThrottleMs) {
        return;
    }
    this.lastTouchTime = now;
    
    // ... existing code ...
} 