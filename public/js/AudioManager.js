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
        
        // Add global audio unlock with proper binding
        const boundHandleInteraction = this.handleUserInteraction.bind(this);
        document.addEventListener('click', boundHandleInteraction, { passive: true, once: true });
        document.addEventListener('touchstart', boundHandleInteraction, { passive: true, once: true });
        document.addEventListener('keydown', boundHandleInteraction, { passive: true, once: true });
        
        // Store the bound function for cleanup if needed
        this.boundHandleInteraction = boundHandleInteraction;
    }
    
    handleUserInteraction() {
        console.log("User interaction detected - initializing audio");
        if (!this.poolsInitialized) {
            try {
                // Create audio context first
                if (!this.audioContext) {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    this.audioContext = new AudioContextClass();
                }
                
                // Resume audio context (needed for Safari/iOS)
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                
                this.scanForMusicFiles();
                this.unlockAudio();
                this.initializeSoundPools();
                this.poolsInitialized = true;
                
                // Try to play music after initialization
                if (this.audioElement && this.musicTracks.length > 0) {
                    this.audioElement.play().catch(e => {
                        console.warn("Auto-play still prevented after interaction:", e);
                    });
                }
                
                console.log("Audio initialization complete");
                
                // Remove event listeners after successful initialization
                document.removeEventListener('click', this.boundHandleInteraction);
                document.removeEventListener('touchstart', this.boundHandleInteraction);
                document.removeEventListener('keydown', this.boundHandleInteraction);
            } catch (error) {
                console.error("Error during audio initialization:", error);
            }
        }
    }
    
    initializeSoundPaths() {
        // Set up sound paths with real audio files
        this.sounds = {
            'engine_rev': '/sounds/engine_rev.mp3',
            'engine_deceleration': '/sounds/engine_deceleration.mp3',
            'engine_idle': '/sounds/engine_idle.mp3',
            'weapon_fire': '/sounds/weapon_fire.mp3',
            'suspension_bounce': '/sounds/suspension_bounce.mp3',
            'tire_screech': '/sounds/tire_screech.mp3',
            'tire_dirt': '/sounds/tire_dirt.mp3',
            'vehicle_hit': '/sounds/vehicle_hit.mp3',
            'vehicle_explosion': '/sounds/vehicle_explosion.mp3',
            'powerup_pickup': '/sounds/powerup_pickup.mp3',
            'powerup_activate': '/sounds/powerup_activate.mp3'
        };
        
        console.log("Sound paths initialized");
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
        // Use real music files instead of silent tracks
        const tracks = [
            { name: 'Ambient Background', url: '/music/fallback.mp3' },
            { name: 'Battle Theme', url: '/music/pattern_bar_live_part00.mp3' },
            { name: 'Menu Music', url: '/music/pattern_bar_live_part01.mp3' }
        ];
        
        // Store track data
        this.musicTrackInfo = tracks;
        
        // Extract just the URLs for the audio element
        this.musicTracks = tracks.map(track => track.url);
        
        // Update the track display
        if (this.trackDisplay) {
            this.trackDisplay.textContent = tracks[0].name;
        }
        
        console.log("Music tracks loaded");
        
        // Load the first track
        if (this.musicTracks.length > 0) {
            this.loadTrack(0);
        }
    }
    
    loadTrack(index) {
        if (!this.musicTracks.length) return;
        
        this.currentTrackIndex = ((index % this.musicTracks.length) + this.musicTracks.length) % this.musicTracks.length;
        
        try {
            // Set the new source
            this.audioElement.src = this.musicTracks[this.currentTrackIndex];
            this.audioElement.load();
            
            // Update volume
            this.updateMusicVolume();
            
            // If we're on desktop, try to play automatically
            if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                this.audioElement.play().catch(e => {
                    console.warn("Auto-play prevented, waiting for user interaction:", e);
                });
            }
            
            console.log(`Loaded audio track: ${this.musicTrackInfo[this.currentTrackIndex].name}`);
        } catch (e) {
            console.warn("Could not load audio track:", e);
        }
        
        this.updateTrackDisplay();
    }
    
    updateTrackDisplay() {
        if (this.trackDisplay && this.musicTrackInfo && this.musicTrackInfo.length > 0) {
            // Use track name from our stored track info
            const trackInfo = this.musicTrackInfo[this.currentTrackIndex];
            this.trackDisplay.textContent = trackInfo ? trackInfo.name : "Game Music";
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
            // Make sure audio context exists
            if (!this.audioContext) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) {
                    console.warn("AudioContext not supported in this browser");
                    return false;
                }
                
                try {
                    this.audioContext = new AudioContextClass();
                } catch (ctxErr) {
                    console.error("Failed to create audio context:", ctxErr);
                    return false;
                }
            }
            
            // Resume the audio context
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(e => {
                    console.warn("Could not resume audio context:", e);
                });
            }
            
            // Create a short silent buffer to unlock mobile audio
            const buffer = this.audioContext.createBuffer(1, 1, 22050);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
            
            return true;
        } catch (e) {
            console.error("Error in audio initialization:", e);
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
    
    // Debug helper method
    debugAudio() {
        console.log('AudioManager Debug Info:');
        console.log('Audio Context State:', this.audioContext?.state);
        console.log('Music Element:', this.audioElement);
        console.log('Music Tracks:', this.musicTracks);
        console.log('Sound Effects Paths:', this.sounds);
        console.log('Pools Initialized:', this.poolsInitialized);
        
        // Test sound
        try {
            console.log('Attempting to play a test sound...');
            this.playSound('powerup_pickup');
        } catch (e) {
            console.error('Test sound failed:', e);
        }
        
        // Test audio element
        try {
            if (this.audioElement && this.musicTracks.length > 0) {
                console.log('Attempting to play music...');
                this.audioElement.src = this.musicTracks[0];
                this.audioElement.play().catch(e => console.error('Music play failed:', e));
            }
        } catch (e) {
            console.error('Test music failed:', e);
        }
    }
} 