/**
 * Unified Audio Manager for Monster Truck Stadium
 * 
 * This module handles all audio functionality including music playback,
 * sound effects, and volume control.
 */
export class AudioManager {
    constructor(camera) {
        // Store camera reference for spatial audio
        this.camera = camera;
        
        // Audio elements
        this.audioElement = document.getElementById('backgroundMusic');
        
        // Track management
        this.musicTracks = [];
        this.currentTrackIndex = 0;
        
        // Sound management
        this.sounds = {};
        this.activeSounds = {};
        this.soundPools = new Map();
        
        // Sound throttling - prevent sounds from playing too frequently
        this.lastSoundPlayed = {};
        this.throttleTime = {
            'engine_rev': 100,        // Only play every 100ms
            'engine_idle': 500,       // Only play every 500ms
            'engine_deceleration': 100,// Only play every 100ms
            'tire_screech': 200,      // Only play every 200ms
            'suspension_bounce': 200  // Only play every 200ms
        };
        
        // UI elements
        this.trackDisplay = document.getElementById('current-track-name');
        this.musicPlayButton = document.getElementById('music-play');
        this.musicPrevButton = document.getElementById('music-prev');
        this.musicNextButton = document.getElementById('music-next');
        this.musicMuteButton = document.getElementById('music-mute');
        this.musicVolumeSlider = document.getElementById('music-volume');
        this.masterMuteButton = document.getElementById('master-mute');
        this.masterVolumeSlider = document.getElementById('master-volume');
        this.sfxMuteButton = document.getElementById('sfx-mute');
        this.sfxVolumeSlider = document.getElementById('sfx-volume');
        this.audioPanelToggle = document.getElementById('audio-panel-toggle');
        this.audioPanel = document.getElementById('audio-panel');
        
        // Volume and mute settings
        this.musicVolume = 0.3;  // 0 to 1
        this.sfxVolume = 0.7;    // 0 to 1
        this.masterVolume = 1.0; // 0 to 1
        this.isMusicMuted = false;
        this.isSFXMuted = false;
        this.isMasterMuted = false;
        
        // Initialize sound paths
        this.initializeSoundPaths();
        
        // Lazy initialize
        this.audioContext = null;
        this.poolsInitialized = false;
        
        // Only initialize on user interaction
        this.initControlListeners();
        this.loadSavedSettings();
        
        // Add global audio unlock
        document.addEventListener('click', this.handleUserInteraction.bind(this), { passive: true, once: true });
        document.addEventListener('keydown', this.handleUserInteraction.bind(this), { passive: true, once: true });
    }
    
    handleUserInteraction() {
        if (!this.poolsInitialized) {
            this.scanForMusicFiles();
            this.unlockAudio();
            this.initializeSoundPools();
            this.poolsInitialized = true;
        }
    }
    
    initializeSoundPaths() {
        // Direct loading of engine sounds
        this.sounds.engine_rev = '/sounds/engine_rev.mp3';
        this.sounds.engine_deceleration = '/sounds/engine_deceleration.mp3';
        this.sounds.engine_idle = '/sounds/engine_idle.mp3';
        
        // Weapon sounds
        this.sounds.weapon_fire = '/sounds/weapon_fire.mp3';
        
        // Vehicle and game sounds
        this.sounds.suspension_bounce = '/sounds/suspension_bounce.mp3';
        this.sounds.tire_screech = '/sounds/tire_screech.mp3';
        this.sounds.tire_dirt = '/sounds/tire_dirt.mp3';
        this.sounds.vehicle_hit = '/sounds/vehicle_hit.mp3';
        this.sounds.vehicle_explosion = '/sounds/vehicle_explosion.mp3';
        this.sounds.powerup_pickup = '/sounds/powerup_pickup.mp3';
        this.sounds.powerup_activate = '/sounds/powerup_activate.mp3';
    }
    
    initControlListeners() {
        // Music controls
        if (this.musicPlayButton) {
            this.musicPlayButton.addEventListener('click', () => this.togglePlayPause());
        }
        
        if (this.musicPrevButton) {
            this.musicPrevButton.addEventListener('click', () => this.prevTrack());
        }
        
        if (this.musicNextButton) {
            this.musicNextButton.addEventListener('click', () => this.nextTrack());
        }
        
        if (this.musicMuteButton) {
            this.musicMuteButton.addEventListener('click', () => this.toggleMusicMute());
        }
        
        if (this.musicVolumeSlider) {
            this.musicVolumeSlider.addEventListener('input', () => {
                this.musicVolume = parseInt(this.musicVolumeSlider.value) / 100;
                this.updateMusicVolume();
                this.saveSettings();
                this.updateMusicMuteButtonIcon();
            });
        }
        
        // Master controls
        if (this.masterMuteButton) {
            this.masterMuteButton.addEventListener('click', () => this.toggleMasterMute());
        }
        
        if (this.masterVolumeSlider) {
            this.masterVolumeSlider.addEventListener('input', () => {
                this.masterVolume = parseInt(this.masterVolumeSlider.value) / 100;
                this.updateAllVolumes();
                this.saveSettings();
                this.updateMasterMuteButtonIcon();
            });
        }
        
        // SFX controls
        if (this.sfxMuteButton) {
            this.sfxMuteButton.addEventListener('click', () => this.toggleSFXMute());
        }
        
        if (this.sfxVolumeSlider) {
            this.sfxVolumeSlider.addEventListener('input', () => {
                this.sfxVolume = parseInt(this.sfxVolumeSlider.value) / 100;
                this.updateSFXVolume();
                this.saveSettings();
                this.updateSFXMuteButtonIcon();
            });
        }
        
        // Panel toggle
        if (this.audioPanelToggle && this.audioPanel) {
            this.audioPanelToggle.addEventListener('click', () => {
                this.audioPanel.classList.toggle('collapsed');
                const icon = this.audioPanelToggle.querySelector('i');
                if (this.audioPanel.classList.contains('collapsed')) {
                    icon.className = 'fas fa-chevron-down';
                } else {
                    icon.className = 'fas fa-chevron-up';
                }
                this.saveSettings();
            });
        }
        
        // Audio element events
        if (this.audioElement) {
            this.audioElement.addEventListener('ended', () => this.nextTrack());
            this.audioElement.addEventListener('play', () => this.updatePlayButtonIcon(true));
            this.audioElement.addEventListener('pause', () => this.updatePlayButtonIcon(false));
            this.audioElement.addEventListener('error', (e) => {
                console.error('Audio error:', e);
                this.nextTrack();
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'M' || e.key === 'm') {
                this.toggleMasterMute();
            }
        });
    }
    
    loadSavedSettings() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem('monsterTruckAudioSettings')) || {};
            
            // Music settings
            this.musicVolume = savedSettings.musicVolume !== undefined ? savedSettings.musicVolume : 0.3;
            this.isMusicMuted = savedSettings.isMusicMuted === true;
            
            // SFX settings
            this.sfxVolume = savedSettings.sfxVolume !== undefined ? savedSettings.sfxVolume : 0.7;
            this.isSFXMuted = savedSettings.isSFXMuted === true;
            
            // Master settings
            this.masterVolume = savedSettings.masterVolume !== undefined ? savedSettings.masterVolume : 1.0;
            this.isMasterMuted = savedSettings.isMasterMuted === true;
            
            // Panel state
            const isPanelCollapsed = savedSettings.isPanelCollapsed === true;
            
            // Apply settings to UI
            if (this.musicVolumeSlider) {
                this.musicVolumeSlider.value = Math.round(this.musicVolume * 100);
            }
            
            if (this.sfxVolumeSlider) {
                this.sfxVolumeSlider.value = Math.round(this.sfxVolume * 100);
            }
            
            if (this.masterVolumeSlider) {
                this.masterVolumeSlider.value = Math.round(this.masterVolume * 100);
            }
            
            // Apply mute states
            this.updateMusicMuteButtonIcon();
            this.updateSFXMuteButtonIcon();
            this.updateMasterMuteButtonIcon();
            
            // Apply audio settings
            this.updateAllVolumes();
            
            // Apply panel state
            if (isPanelCollapsed && this.audioPanel) {
                this.audioPanel.classList.add('collapsed');
                if (this.audioPanelToggle) {
                    const icon = this.audioPanelToggle.querySelector('i');
                    if (icon) icon.className = 'fas fa-chevron-down';
                }
            }
        } catch (error) {
            console.error('Error loading audio settings:', error);
        }
    }
    
    saveSettings() {
        try {
            const settings = {
                musicVolume: this.musicVolume,
                isMusicMuted: this.isMusicMuted,
                sfxVolume: this.sfxVolume,
                isSFXMuted: this.isSFXMuted,
                masterVolume: this.masterVolume,
                isMasterMuted: this.isMasterMuted,
                isPanelCollapsed: this.audioPanel ? this.audioPanel.classList.contains('collapsed') : false
            };
            
            localStorage.setItem('monsterTruckAudioSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving audio settings:', error);
        }
    }
    
    // Music methods
    scanForMusicFiles() {
        const foundTracks = [];
        const basePath = '/music/';
        
        // Add fallback track first
        foundTracks.push(`${basePath}fallback.mp3`);
        
        // Load all music tracks from the pattern_bar_live series
        for (let i = 0; i <= 18; i++) {
            const trackNum = i.toString().padStart(2, '0');
            const trackName = `pattern_bar_live_part${trackNum}`;
            foundTracks.push(`${basePath}${trackName}.mp3`);
        }
        
        this.musicTracks = foundTracks;
        
        // Don't autoplay - wait for user interaction
        if (this.musicTracks.length > 0) {
            this.loadTrack(0);
        }
    }
    
    loadTrack(index) {
        if (!this.musicTracks.length) return;
        
        this.currentTrackIndex = ((index % this.musicTracks.length) + this.musicTracks.length) % this.musicTracks.length;
        const trackPath = this.musicTracks[this.currentTrackIndex];
        this.audioElement.src = trackPath;
        this.audioElement.load();
        this.updateTrackDisplay();
        this.updateMusicVolume();
    }
    
    updateTrackDisplay() {
        if (this.trackDisplay && this.musicTracks.length > 0) {
            const trackName = this.musicTracks[this.currentTrackIndex].split('/').pop().replace('.mp3', '');
            this.trackDisplay.textContent = trackName;
        }
    }
    
    togglePlayPause() {
        if (this.audioElement.paused) {
            this.audioElement.play().catch(e => console.error('Error playing audio:', e));
        } else {
            this.audioElement.pause();
        }
    }
    
    nextTrack() {
        this.loadTrack(this.currentTrackIndex + 1);
    }
    
    prevTrack() {
        this.loadTrack(this.currentTrackIndex - 1);
    }
    
    // Sound effects methods
    initializeSoundPools() {
        try {
            // Initialize sound pools for frequently used sounds
            const poolSizes = {
                'engine_rev': 2,
                'engine_idle': 1,
                'engine_deceleration': 2,
                'weapon_fire': 3,
                'suspension_bounce': 2,
                'tire_screech': 2,
                'tire_dirt': 2
            };
    
            // Create pools for each sound
            Object.entries(poolSizes).forEach(([soundName, size]) => {
                const pool = [];
                for (let i = 0; i < size; i++) {
                    const audio = new Audio(this.sounds[soundName]);
                    audio.volume = this.sfxVolume * this.masterVolume;
                    pool.push(audio);
                }
                this.soundPools.set(soundName, pool);
            });
            
            this.poolsInitialized = true;
        } catch (e) {
            // Silent error handling
        }
    }
    
    playSound(name) {
        if (this.isSFXMuted || this.isMasterMuted) return;
        
        // Check if sound should be throttled
        const now = performance.now();
        const throttleMs = this.throttleTime[name] || 0;
        if (throttleMs > 0) {
            const lastPlayed = this.lastSoundPlayed[name] || 0;
            if (now - lastPlayed < throttleMs) {
                return; // Skip playing, too soon since last play
            }
            this.lastSoundPlayed[name] = now;
        }
        
        try {
            // Use sound pool if available
            if (this.poolsInitialized) {
                const pool = this.soundPools.get(name);
                if (pool && pool.length > 0) {
                    const audio = pool.find(a => a.paused) || pool[0];
                    if (audio.paused) {  // Only reset and play if it's paused
                        audio.currentTime = 0;
                        audio.volume = this.sfxVolume * this.masterVolume;
                        audio.play().catch(() => {});
                    }
                    return;
                }
            }
            
            // Fallback with simpler logic
            const path = this.sounds[name];
            if (!path) return;
            
            // Limit the number of active sounds per type
            if (!this.activeSounds[name]) {
                this.activeSounds[name] = [];
            } else if (this.activeSounds[name].length >= 2) {
                // Don't create more than 2 instances of the same sound
                return;
            }
            
            const audio = new Audio(path);
            audio.volume = this.sfxVolume * this.masterVolume;
            this.activeSounds[name].push(audio);
            
            audio.addEventListener('ended', () => {
                const index = this.activeSounds[name].indexOf(audio);
                if (index !== -1) {
                    this.activeSounds[name].splice(index, 1);
                }
            });
            
            audio.play().catch(() => {});
        } catch (error) {
            // Silent error handling
        }
    }
    
    stopSound(name) {
        if (this.activeSounds[name]) {
            this.activeSounds[name].forEach(audio => {
                audio.pause();
                audio.currentTime = 0;
            });
            this.activeSounds[name] = [];
        }
    }
    
    // Volume control methods
    updateAllVolumes() {
        this.updateMusicVolume();
        this.updateSFXVolume();
    }
    
    updateMusicVolume() {
        if (!this.audioElement) return;
        
        const effectiveVolume = this.isMasterMuted || this.isMusicMuted ? 
            0 : this.musicVolume * this.masterVolume;
            
        this.audioElement.volume = effectiveVolume;
    }
    
    updateSFXVolume() {
        const effectiveVolume = this.isMasterMuted || this.isSFXMuted ? 0 : this.sfxVolume * this.masterVolume;
        
        // Update all active sounds
        Object.values(this.activeSounds).flat().forEach(audio => {
            audio.volume = effectiveVolume;
        });
    }
    
    // Mute control methods
    toggleMusicMute() {
        this.isMusicMuted = !this.isMusicMuted;
        this.updateMusicVolume();
        this.updateMusicMuteButtonIcon();
        this.saveSettings();
    }
    
    toggleSFXMute() {
        this.isSFXMuted = !this.isSFXMuted;
        this.updateSFXVolume();
        this.updateSFXMuteButtonIcon();
        this.saveSettings();
    }
    
    toggleMasterMute() {
        this.isMasterMuted = !this.isMasterMuted;
        this.updateAllVolumes();
        this.updateMasterMuteButtonIcon();
        this.saveSettings();
    }
    
    // UI update methods
    updatePlayButtonIcon(isPlaying) {
        if (!this.musicPlayButton) return;
        const icon = this.musicPlayButton.querySelector('i');
        if (icon) {
            icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }
    }
    
    updateMusicMuteButtonIcon() {
        if (!this.musicMuteButton) return;
        const icon = this.musicMuteButton.querySelector('i');
        if (icon) {
            icon.className = this.isMusicMuted ? 'fas fa-music-slash' : 'fas fa-music';
        }
        if (this.isMusicMuted) {
            this.musicMuteButton.classList.add('muted');
        } else {
            this.musicMuteButton.classList.remove('muted');
        }
    }
    
    updateSFXMuteButtonIcon() {
        if (!this.sfxMuteButton) return;
        const icon = this.sfxMuteButton.querySelector('i');
        if (icon) {
            icon.className = this.isSFXMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        }
        if (this.isSFXMuted) {
            this.sfxMuteButton.classList.add('muted');
        } else {
            this.sfxMuteButton.classList.remove('muted');
        }
    }
    
    updateMasterMuteButtonIcon() {
        if (!this.masterMuteButton) return;
        const icon = this.masterMuteButton.querySelector('i');
        if (icon) {
            if (this.isMasterMuted) {
                icon.className = 'fas fa-volume-mute';
                this.masterMuteButton.classList.add('muted');
            } else if (this.masterVolume < 0.1) {
                icon.className = 'fas fa-volume-off';
                this.masterMuteButton.classList.remove('muted');
            } else if (this.masterVolume < 0.5) {
                icon.className = 'fas fa-volume-down';
                this.masterMuteButton.classList.remove('muted');
            } else {
                icon.className = 'fas fa-volume-up';
                this.masterMuteButton.classList.remove('muted');
            }
        }
    }
    
    // Utility methods
    unlockAudio() {
        try {
            // Check if we're on a mobile device
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            console.log("Attempting to unlock audio context...");
            
            // Create audio context if it doesn't exist
            if (!this.audioContext) {
                // Use the appropriate AudioContext for the platform
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContextClass({
                    // Use low latency mode for mobile
                    latencyHint: isMobile ? 'playback' : 'interactive'
                });
                
                console.log("Audio context created successfully");
            }
            
            // Resume the audio context (needed for Chrome)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    console.log("Audio context resumed successfully");
                }).catch(err => {
                    console.warn("Failed to resume audio context:", err);
                });
            }
            
            // Create and play a silent buffer for mobile browsers
            // This is necessary to unlock audio on iOS/Safari
            const buffer = this.audioContext.createBuffer(1, 1, 22050);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
            
            // Try to play the background music if user has interacted
            if (this.audioElement) {
                console.log("Attempting to play background music...");
                this.audioElement.play().then(() => {
                    console.log("Background music started successfully");
                }).catch(err => {
                    console.warn("Could not autoplay music, waiting for user gesture:", err);
                    
                    // On mobile, we need a button for the first play action
                    if (isMobile) {
                        // Create a play button if needed and there isn't already one
                        if (!document.getElementById('audio-unlock-button')) {
                            const unlockButton = document.createElement('div');
                            unlockButton.id = 'audio-unlock-button';
                            unlockButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                            unlockButton.style.position = 'fixed';
                            unlockButton.style.bottom = '80px';
                            unlockButton.style.right = '20px';
                            unlockButton.style.width = '60px';
                            unlockButton.style.height = '60px';
                            unlockButton.style.borderRadius = '50%';
                            unlockButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                            unlockButton.style.color = '#ff00ff';
                            unlockButton.style.display = 'flex';
                            unlockButton.style.alignItems = 'center';
                            unlockButton.style.justifyContent = 'center';
                            unlockButton.style.fontSize = '24px';
                            unlockButton.style.boxShadow = '0 0 15px rgba(255, 0, 255, 0.7)';
                            unlockButton.style.zIndex = '1000';
                            unlockButton.style.cursor = 'pointer';
                            
                            unlockButton.addEventListener('click', () => {
                                // Try to play audio again on click
                                this.audioElement.play().then(() => {
                                    console.log("Audio unlocked by user interaction");
                                    // Remove the button once audio is playing
                                    document.body.removeChild(unlockButton);
                                }).catch(e => {
                                    console.error("Still couldn't play audio after click:", e);
                                });
                                
                                // Also attempt to resume the audio context
                                if (this.audioContext && this.audioContext.state === 'suspended') {
                                    this.audioContext.resume();
                                }
                            });
                            
                            document.body.appendChild(unlockButton);
                        }
                    }
                });
            }
            
            return true;
        } catch (e) {
            console.error("Error unlocking audio:", e);
            return false;
        }
    }
    
    // Public API methods
    playMusic(trackName) {
        if (!this.musicTracks.length) return;
        const trackIndex = this.musicTracks.findIndex(track => track.includes(trackName));
        if (trackIndex !== -1) {
            this.loadTrack(trackIndex);
            this.audioElement.play().catch(e => console.error('Error playing audio:', e));
        }
    }
    
    stopMusic() {
        if (this.audioElement) {
            this.audioElement.pause();
        }
    }
}

// Initialize audio manager when DOM is loaded but don't create the AudioContext yet
document.addEventListener('DOMContentLoaded', () => {
    // Will be actually initialized on first user interaction
    window.audioManagerInstance = null;
}); 