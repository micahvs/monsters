/**
 * Dynamic Music Player for Monster Truck Stadium
 * 
 * This module handles loading and playing music files from the /music/ directory.
 * It integrates with the unified audio control panel.
 */
class MusicPlayer {
    constructor() {
        // Audio element
        this.audioElement = document.getElementById('backgroundMusic');
        
        // Track management
        this.musicTracks = [];
        this.currentTrackIndex = 0;
        
        // UI elements
        this.trackDisplay = document.getElementById('current-track-name');
        
        // Control buttons
        this.musicPlayButton = document.getElementById('music-play');
        this.musicPrevButton = document.getElementById('music-prev');
        this.musicNextButton = document.getElementById('music-next');
        this.musicMuteButton = document.getElementById('music-mute');
        this.musicVolumeSlider = document.getElementById('music-volume');
        
        // Master controls that affect music
        this.masterMuteButton = document.getElementById('master-mute');
        this.masterVolumeSlider = document.getElementById('master-volume');
        
        // Panel toggle
        this.audioPanelToggle = document.getElementById('audio-panel-toggle');
        this.audioPanel = document.getElementById('audio-panel');
        
        // State
        this.isMusicMuted = false;
        this.isMasterMuted = false;
        this.musicVolume = 0.3; // 0 to 1
        this.masterVolume = 1.0; // 0 to 1
        
        // Initialize
        this.initControlListeners();
        this.loadSavedSettings();
        this.scanForMusicFiles();
        
        // Make player globally available
        window.musicPlayer = this;
    }
    
    initControlListeners() {
        // Play/Pause button
        if (this.musicPlayButton) {
            this.musicPlayButton.addEventListener('click', () => this.togglePlayPause());
        }
        
        // Previous track button
        if (this.musicPrevButton) {
            this.musicPrevButton.addEventListener('click', () => this.prevTrack());
        }
        
        // Next track button
        if (this.musicNextButton) {
            this.musicNextButton.addEventListener('click', () => this.nextTrack());
        }
        
        // Music mute button
        if (this.musicMuteButton) {
            this.musicMuteButton.addEventListener('click', () => this.toggleMusicMute());
        }
        
        // Music volume slider
        if (this.musicVolumeSlider) {
            this.musicVolumeSlider.addEventListener('input', () => {
                this.musicVolume = parseInt(this.musicVolumeSlider.value) / 100;
                this.updateMusicVolume();
                this.saveSettings();
                this.updateMusicMuteButtonIcon();
            });
        }
        
        // Master mute button
        if (this.masterMuteButton) {
            this.masterMuteButton.addEventListener('click', () => this.toggleMasterMute());
        }
        
        // Master volume slider
        if (this.masterVolumeSlider) {
            this.masterVolumeSlider.addEventListener('input', () => {
                this.masterVolume = parseInt(this.masterVolumeSlider.value) / 100;
                this.updateMusicVolume();
                if (window.soundManager) {
                    window.soundManager.setMasterVolume(this.masterVolume);
                }
                this.saveSettings();
                this.updateMasterMuteButtonIcon();
            });
        }
        
        // Panel toggle
        if (this.audioPanelToggle && this.audioPanel) {
            this.audioPanelToggle.addEventListener('click', () => {
                this.audioPanel.classList.toggle('collapsed');
                // Update icon
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
                this.nextTrack(); // Try next track if there's an error
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // M key for master mute
            if (e.key === 'M' || e.key === 'm') {
                this.toggleMasterMute();
            }
        });
    }
    
    loadSavedSettings() {
        // Load saved settings from localStorage
        try {
            const savedSettings = JSON.parse(localStorage.getItem('monsterTruckAudioSettings')) || {};
            
            // Music settings
            this.musicVolume = savedSettings.musicVolume !== undefined ? savedSettings.musicVolume : 0.3;
            this.isMusicMuted = savedSettings.isMusicMuted === true;
            
            // Master settings
            this.masterVolume = savedSettings.masterVolume !== undefined ? savedSettings.masterVolume : 1.0;
            this.isMasterMuted = savedSettings.isMasterMuted === true;
            
            // Panel state
            const isPanelCollapsed = savedSettings.isPanelCollapsed === true;
            
            // Apply settings to UI
            if (this.musicVolumeSlider) {
                this.musicVolumeSlider.value = Math.round(this.musicVolume * 100);
            }
            
            if (this.masterVolumeSlider) {
                this.masterVolumeSlider.value = Math.round(this.masterVolume * 100);
            }
            
            // Apply mute states
            this.updateMusicMuteButtonIcon();
            this.updateMasterMuteButtonIcon();
            
            // Apply audio settings
            this.updateMusicVolume();
            
            // Apply panel state
            if (isPanelCollapsed && this.audioPanel) {
                this.audioPanel.classList.add('collapsed');
                if (this.audioPanelToggle) {
                    const icon = this.audioPanelToggle.querySelector('i');
                    if (icon) icon.className = 'fas fa-chevron-down';
                }
            }
            
            console.log('Loaded audio settings:', {
                musicVolume: this.musicVolume,
                isMusicMuted: this.isMusicMuted,
                masterVolume: this.masterVolume,
                isMasterMuted: this.isMasterMuted,
                isPanelCollapsed
            });
        } catch (error) {
            console.error('Error loading audio settings:', error);
        }
    }
    
    saveSettings() {
        // Save settings to localStorage
        try {
            const settings = {
                musicVolume: this.musicVolume,
                isMusicMuted: this.isMusicMuted,
                masterVolume: this.masterVolume,
                isMasterMuted: this.isMasterMuted,
                isPanelCollapsed: this.audioPanel ? this.audioPanel.classList.contains('collapsed') : false
            };
            
            localStorage.setItem('monsterTruckAudioSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving audio settings:', error);
        }
    }
    
    scanForMusicFiles() {
        const foundTracks = new Set();
        
        // Add the standard tracks that we know exist
        const basePath = '/music/';
        
        // Load all music tracks from the pattern_bar_live series
        for (let i = 0; i <= 18; i++) {
            const trackNum = i.toString().padStart(2, '0');
            const trackName = `pattern_bar_live_part${trackNum}`;
            foundTracks.add(`${basePath}${trackName}.mp3`);
        }
        
        // Add any custom tracks you might have
        const customTracks = [
            'cyber_cruiser.mp3',
            'neon_chase.mp3',
            'retro_sunset.mp3'
        ];
        
        customTracks.forEach(track => {
            this.checkFileExists(`${basePath}${track}`, (exists) => {
                if (exists) {
                    foundTracks.add(`${basePath}${track}`);
                    console.log(`Found custom track: ${track}`);
                }
            });
        });
        
        // Convert to array and sort
        this.musicTracks = Array.from(foundTracks).sort();
        console.log(`Found ${this.musicTracks.length} music tracks:`, this.musicTracks);
        
        // Set initial track
        if (this.musicTracks.length > 0) {
            // Choose a random track to start with
            this.currentTrackIndex = Math.floor(Math.random() * this.musicTracks.length);
            this.loadTrack(this.currentTrackIndex);
            console.log(`Loaded initial track: ${this.musicTracks[this.currentTrackIndex]}`);
        } else {
            console.warn('No music tracks found. Please add MP3 files to the /music/ directory.');
        }
    }
    
    checkFileExists(url, callback) {
        const tempAudio = new Audio();
        
        const handleCanPlay = () => {
            tempAudio.removeEventListener('canplaythrough', handleCanPlay);
            callback(true);
        };
        
        const handleError = () => {
            tempAudio.removeEventListener('error', handleError);
            callback(false);
        };
        
        tempAudio.addEventListener('canplaythrough', handleCanPlay);
        tempAudio.addEventListener('error', handleError);
        
        tempAudio.src = url;
        tempAudio.load();
    }
    
    loadTrack(index) {
        if (!this.musicTracks.length) return;
        
        // Ensure index is valid
        this.currentTrackIndex = ((index % this.musicTracks.length) + this.musicTracks.length) % this.musicTracks.length;
        
        // Update audio element
        const trackPath = this.musicTracks[this.currentTrackIndex];
        this.audioElement.src = trackPath;
        this.audioElement.load();
        
        // Update display
        this.updateTrackDisplay();
        
        // Apply volume settings
        this.updateMusicVolume();
    }
    
    updateTrackDisplay() {
        if (!this.trackDisplay || !this.musicTracks.length) return;
        
        // Get current track name from path
        const trackPath = this.musicTracks[this.currentTrackIndex];
        const trackName = trackPath.split('/').pop().replace('.mp3', '');
        
        // Format track name for display
        let displayName = trackName
            .replace(/pattern_bar_live_part(\d+)/, 'Synthwave Track $1')
            .replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        
        this.trackDisplay.textContent = displayName;
    }
    
    togglePlayPause() {
        if (!this.audioElement) return;
        
        if (this.audioElement.paused) {
            this.audioElement.play().catch(e => console.error('Error playing audio:', e));
        } else {
            this.audioElement.pause();
        }
    }
    
    nextTrack() {
        this.loadTrack(this.currentTrackIndex + 1);
        if (!this.audioElement.paused) {
            this.audioElement.play().catch(e => console.error('Error playing audio:', e));
        }
    }
    
    prevTrack() {
        this.loadTrack(this.currentTrackIndex - 1);
        if (!this.audioElement.paused) {
            this.audioElement.play().catch(e => console.error('Error playing audio:', e));
        }
    }
    
    toggleMusicMute() {
        this.isMusicMuted = !this.isMusicMuted;
        this.updateMusicVolume();
        this.updateMusicMuteButtonIcon();
        this.saveSettings();
    }
    
    toggleMasterMute() {
        this.isMasterMuted = !this.isMasterMuted;
        
        // Update music volume
        this.updateMusicVolume();
        
        // Update SFX volume via SoundManager
        if (window.soundManager) {
            window.soundManager.setMuted(this.isMasterMuted);
        }
        
        this.updateMasterMuteButtonIcon();
        this.saveSettings();
    }
    
    updateMusicVolume() {
        if (!this.audioElement) return;
        
        // Calculate effective volume
        const effectiveVolume = this.isMasterMuted || this.isMusicMuted ? 
            0 : this.musicVolume * this.masterVolume;
            
        this.audioElement.volume = effectiveVolume;
        
        // Also update the SoundManager's music volume if available
        if (window.soundManager) {
            window.soundManager.setMusicVolume(this.musicVolume);
        }
    }
    
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
        
        // Update button style
        if (this.isMusicMuted) {
            this.musicMuteButton.classList.add('muted');
        } else {
            this.musicMuteButton.classList.remove('muted');
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
    
    // API methods for SoundManager integration
    playMusic(trackName) {
        // Find track by name in the musicTracks array
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

// Initialize music player when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.musicPlayerInstance = new MusicPlayer();
}); 