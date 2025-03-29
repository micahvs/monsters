/**
 * Legacy music-player.js - Redirects to AudioManager.js
 * 
 * This file exists only to prevent 404 errors for any legacy code that might
 * still be trying to load the old music-player.js file. All audio functionality
 * has been moved to AudioManager.js.
 */
console.log('Loaded legacy music-player.js - Audio functionality has been moved to AudioManager.js');

// If the script is loaded via a regular script tag, create a redirect notice
if (typeof window !== 'undefined') {
    console.warn('This script is deprecated. Please use AudioManager.js instead.');
    
    // Check if there are any audio functions from the old music-player that we need to maintain for compatibility
    if (!window.audioManager && !window.AudioManager) {
        console.error('AudioManager not found. Make sure to import AudioManager.js first.');
    }
}

// Export empty methods as a fallback to prevent errors
export const MusicPlayer = {
    initialize: () => {
        console.warn('MusicPlayer.initialize() is deprecated. Use AudioManager instead.');
        return null;
    },
    loadTrack: (trackPath) => {
        console.warn('MusicPlayer.loadTrack() is deprecated. Use AudioManager.loadTrack() instead.');
        if (window.audioManager) {
            window.audioManager.playMusic(trackPath);
        }
    },
    play: () => {
        console.warn('MusicPlayer.play() is deprecated. Use AudioManager.togglePlayPause() instead.');
        if (window.audioManager) {
            window.audioManager.togglePlayPause();
        }
    },
    pause: () => {
        console.warn('MusicPlayer.pause() is deprecated. Use AudioManager.togglePlayPause() instead.');
        if (window.audioManager) {
            window.audioManager.togglePlayPause();
        }
    },
    nextTrack: () => {
        console.warn('MusicPlayer.nextTrack() is deprecated. Use AudioManager.nextTrack() instead.');
        if (window.audioManager) {
            window.audioManager.nextTrack();
        }
    },
    prevTrack: () => {
        console.warn('MusicPlayer.prevTrack() is deprecated. Use AudioManager.prevTrack() instead.');
        if (window.audioManager) {
            window.audioManager.prevTrack();
        }
    }
};

// Default export
export default MusicPlayer; 