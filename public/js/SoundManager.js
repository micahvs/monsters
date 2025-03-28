import * as THREE from 'three';

export class SoundManager {
    constructor(camera) {
        console.log('SoundManager: Initializing with new approach');
        
        // Store camera reference
        this.camera = camera;
        
        // Initialize sound pools (needed for main.js)
        this.soundPools = new Map();
        
        // Create sounds map
        this.sounds = {};
        
        // Track active sounds
        this.activeSounds = {};
        
        // Volume and mute settings
        this.muted = false;
        this.sfxMuted = false;
        this.sfxVolume = 0.7;  // Default SFX volume (0-1)
        this.masterVolume = 1.0; // Default master volume (0-1)
        
        // Direct loading of engine sounds
        this.sounds.engine_rev = '/sounds/engine_rev.mp3';
        this.sounds.engine_deceleration = '/sounds/engine_deceleration.mp3';
        this.sounds.engine_idle = '/sounds/engine_idle.mp3';
        
        // Weapon sounds
        this.sounds.weapon_fire = '/sounds/weapon_fire.mp3';
        
        // Add vehicle and game sounds (if available)
        this.sounds.suspension_bounce = '/sounds/suspension_bounce.mp3';
        this.sounds.tire_screech = '/sounds/tire_screech.mp3';
        this.sounds.tire_dirt = '/sounds/tire_dirt.mp3';
        
        // Preload all sounds when browser allows
        this.preloadSounds();
        
        // Add global audio unlock
        document.addEventListener('click', () => this.unlockAudio());
        document.addEventListener('keydown', () => this.unlockAudio());
        
        // Load saved settings from localStorage
        this.loadSavedSettings();
    }
    
    loadSavedSettings() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem('monsterTruckAudioSettings')) || {};
            
            // Extract SFX settings if they exist
            if (savedSettings.sfxVolume !== undefined) {
                this.sfxVolume = savedSettings.sfxVolume;
            }
            
            if (savedSettings.isSFXMuted !== undefined) {
                this.sfxMuted = savedSettings.isSFXMuted;
            }
            
            // Extract master settings if they exist
            if (savedSettings.masterVolume !== undefined) {
                this.masterVolume = savedSettings.masterVolume;
            }
            
            // We'll use SFX mute setting independent of master mute
            // This is to prevent music muting from affecting sound effects
            
            console.log(`SoundManager: Loaded settings - SFX volume: ${this.sfxVolume}, SFX muted: ${this.sfxMuted}`);
        } catch (error) {
            console.error('SoundManager: Error loading settings:', error);
        }
    }
    
    unlockAudio() {
        // Create a brief silent sound to unlock audio
        const audio = new Audio();
        audio.play().catch(() => {});
    }
    
    preloadSounds() {
        // Pre-create and load audio objects for engine sounds
        this._playbackObjects = {};
        
        for (const [name, path] of Object.entries(this.sounds)) {
            try {
                const audio = new Audio(path);
                audio.load(); // Start loading
                this._playbackObjects[name] = audio;
                console.log(`SoundManager: Preloaded ${name}`);
            } catch (e) {
                console.error(`SoundManager: Error preloading ${name}:`, e);
            }
        }
    }
    
    // Required by main.js
    initializeSoundPools() {
        console.log('SoundManager: initializeSoundPools called');
        // Don't need to do anything here
    }
    
    // Play a sound using direct native Audio objects
    playSound(name) {
        // Check if sound effects are muted
        if (this.sfxMuted) {
            console.log(`SoundManager: Not playing ${name} because SFX are muted`);
            return;
        }
        
        try {
            // Stop the sound if it conflicts with state changes
            if (name === 'engine_rev' || name === 'engine_deceleration') {
                this.stopSound('engine_idle');
            } else if (name === 'engine_idle') {
                this.stopSound('engine_rev');
                this.stopSound('engine_deceleration');
            }
            
            console.log(`SoundManager: Playing sound ${name}`);
            
            // Path to the sound file
            const path = this.sounds[name];
            if (!path) {
                console.warn(`SoundManager: Sound not found: ${name}`);
                return;
            }
            
            // Create a new Audio object for overlapping sounds
            const audio = new Audio(path);
            
            // Calculate effective volume based on master and SFX volumes
            // We ignore the global mute state to make sound effects independent
            const effectiveVolume = this.sfxVolume * this.masterVolume;
            audio.volume = effectiveVolume;
            
            // Store reference to active sound
            if (!this.activeSounds[name]) {
                this.activeSounds[name] = [];
            }
            this.activeSounds[name].push(audio);
            
            // Set up ended event to remove from active sounds
            audio.addEventListener('ended', () => {
                if (this.activeSounds[name]) {
                    const index = this.activeSounds[name].indexOf(audio);
                    if (index !== -1) {
                        this.activeSounds[name].splice(index, 1);
                    }
                }
            });
            
            // Play with error handling
            audio.play()
                .then(() => {
                    console.log(`SoundManager: Sound started: ${name}`);
                })
                .catch(error => {
                    console.error(`SoundManager: Error playing ${name}:`, error);
                    
                    // Try fallback method
                    this.playFallbackSound(name, path);
                });
        } catch (error) {
            console.error(`SoundManager: Error in playSound ${name}:`, error);
            this.playFallbackSound(name, this.sounds[name]);
        }
    }
    
    // Stop a specific sound if it's playing
    stopSound(name) {
        if (this.activeSounds[name] && this.activeSounds[name].length > 0) {
            console.log(`SoundManager: Stopping sound ${name}`);
            
            // Copy the array to avoid modification during iteration
            const sounds = [...this.activeSounds[name]];
            
            // Stop and clean up each sound
            sounds.forEach(audio => {
                try {
                    audio.pause();
                    audio.currentTime = 0;
                } catch (error) {
                    console.error(`SoundManager: Error stopping sound ${name}:`, error);
                }
            });
            
            // Clear the active sounds array
            this.activeSounds[name] = [];
        }
    }
    
    // Fallback method using DOM audio elements
    playFallbackSound(name, path) {
        // Don't play if muted
        if (this.sfxMuted) return;
        
        try {
            console.log(`SoundManager: Using fallback for ${name}`);
            
            // Create audio element
            const audioElement = document.createElement('audio');
            audioElement.src = path;
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);
            
            // Set volume
            const effectiveVolume = this.sfxVolume * this.masterVolume;
            audioElement.volume = effectiveVolume;
            
            // Track in active sounds
            if (!this.activeSounds[name]) {
                this.activeSounds[name] = [];
            }
            this.activeSounds[name].push(audioElement);
            
            // Set up cleanup
            const cleanup = () => {
                try {
                    document.body.removeChild(audioElement);
                    
                    // Remove from active sounds
                    if (this.activeSounds[name]) {
                        const index = this.activeSounds[name].indexOf(audioElement);
                        if (index !== -1) {
                            this.activeSounds[name].splice(index, 1);
                        }
                    }
                } catch (e) {}
            };
            
            // Play with promise
            audioElement.play()
                .then(() => {
                    console.log(`SoundManager: Fallback playing: ${name}`);
                    
                    // Remove after playing
                    audioElement.addEventListener('ended', cleanup);
                    
                    // Safety cleanup after 5 seconds
                    setTimeout(cleanup, 5000);
                })
                .catch(error => {
                    console.error(`SoundManager: Fallback error: ${error}`);
                    cleanup();
                });
        } catch (error) {
            console.error(`SoundManager: Fallback error: ${error}`);
        }
    }
    
    // Set SFX volume (0-1)
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        console.log(`SoundManager: Set SFX volume to ${this.sfxVolume}`);
        
        // Save to localStorage
        this.saveSettings();
    }
    
    // Set SFX muted state
    setSFXMuted(muted) {
        this.sfxMuted = muted;
        console.log(`SoundManager: Set SFX muted to ${muted}`);
        
        if (muted) {
            // Stop all active sounds when muting
            Object.keys(this.activeSounds).forEach(name => {
                this.stopSound(name);
            });
        }
        
        // Save to localStorage
        this.saveSettings();
    }
    
    // Set master volume (0-1)
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        console.log(`SoundManager: Set master volume to ${this.masterVolume}`);
        
        // We don't save this - it's handled by the music player
    }
    
    // Old method kept for backward compatibility
    setMuted(muted) {
        // This only sets the SFX mute now, independent from music
        this.setSFXMuted(muted);
    }
    
    // Save current settings to localStorage
    saveSettings() {
        try {
            // Get existing settings
            const settings = JSON.parse(localStorage.getItem('monsterTruckAudioSettings')) || {};
            
            // Update SFX settings
            settings.sfxVolume = this.sfxVolume;
            settings.isSFXMuted = this.sfxMuted;
            
            // Save back to localStorage
            localStorage.setItem('monsterTruckAudioSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('SoundManager: Error saving settings:', error);
        }
    }
} 