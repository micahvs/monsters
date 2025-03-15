/**
 * Dynamic Music Player for Monster Truck Stadium
 * 
 * This module handles loading and playing music files from the /music/ directory.
 * It automatically detects available music files and plays them in alphabetical order.
 */

class MusicPlayer {
    constructor() {
        this.audioElement = document.getElementById('backgroundMusic');
        this.playPauseButton = document.getElementById('playPauseButton');
        this.audioToggle = document.getElementById('audioToggle');
        
        this.playPauseIcon = this.playPauseButton.querySelector('i');
        this.audioIcon = this.audioToggle.querySelector('i');
        
        this.musicTracks = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.supportedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
        
        // Initialize the player
        this.init();
    }
    
    init() {
        // Set up event listeners
        this.setupEventListeners();
        
        // Check if audio was previously muted
        const audioMuted = localStorage.getItem('monsterTruckAudioMuted') === 'true';
        this.audioElement.muted = audioMuted;
        
        // Update UI to reflect muted state
        if (audioMuted) {
            this.audioToggle.classList.add('muted');
            this.audioIcon.className = 'fas fa-volume-mute';
        } else {
            this.audioToggle.classList.remove('muted');
            this.audioIcon.className = 'fas fa-volume-up';
        }
        
        // Scan for music files
        this.scanForMusicFiles();
    }
    
    setupEventListeners() {
        // When one track ends, play the next one
        this.audioElement.addEventListener('ended', () => {
            console.log('Audio ended, playing next track');
            this.playNextTrack();
        });
        
        // Handle audio errors
        this.audioElement.addEventListener('error', (e) => {
            console.error('Audio error:', e);
            // Try the next track if this one fails
            setTimeout(() => this.playNextTrack(), 1000);
        });
        
        // Update play/pause button when audio plays or pauses
        this.audioElement.addEventListener('play', () => {
            this.isPlaying = true;
            this.playPauseIcon.className = 'fas fa-pause';
        });
        
        this.audioElement.addEventListener('pause', () => {
            this.isPlaying = false;
            this.playPauseIcon.className = 'fas fa-play';
        });
        
        // Toggle audio on button click
        this.audioToggle.addEventListener('click', () => this.toggleMute());
        
        // Play/Pause button functionality
        this.playPauseButton.addEventListener('click', () => this.togglePlay());
    }
    
    scanForMusicFiles() {
        const basePath = '/music/';
        const foundTracks = new Set(); // Use a Set to avoid duplicates
        const scanPromises = [];
        
        // 1. Try common music file patterns
        const filePatterns = [
            // Pattern files with numbered sequence
            { prefix: 'pattern_bar_live_part', maxIndex: 20, padLength: 2 },
            { prefix: 'track', maxIndex: 20, padLength: 2 },
            { prefix: 'music', maxIndex: 20, padLength: 2 },
            { prefix: 'song', maxIndex: 20, padLength: 2 },
            { prefix: 'bgm', maxIndex: 20, padLength: 2 }
        ];
        
        // Try each pattern with each supported extension
        filePatterns.forEach(pattern => {
            for (let i = 0; i < pattern.maxIndex; i++) {
                const paddedIndex = i.toString().padStart(pattern.padLength, '0');
                
                this.supportedExtensions.forEach(ext => {
                    const filename = `${pattern.prefix}${paddedIndex}${ext}`;
                    scanPromises.push(
                        this.tryLoadTrack(basePath + filename)
                            .then(success => {
                                if (success) {
                                    foundTracks.add(basePath + filename);
                                }
                                return success;
                            })
                    );
                });
            }
        });
        
        // 2. Try common standalone music files
        const commonFiles = [
            'fallback.mp3',
            'background.mp3',
            'theme.mp3',
            'main.mp3',
            'menu.mp3',
            'game.mp3',
            'action.mp3',
            'battle.mp3',
            'intro.mp3',
            'outro.mp3'
        ];
        
        commonFiles.forEach(file => {
            scanPromises.push(
                this.tryLoadTrack(basePath + file)
                    .then(success => {
                        if (success) {
                            foundTracks.add(basePath + file);
                        }
                        return success;
                    })
            );
        });
        
        // 3. Try to scan for any music file with common extensions
        // This is a more aggressive approach that tries to find any music file
        const commonPrefixes = ['', 'music_', 'track_', 'song_', 'bgm_', 'audio_'];
        const commonNames = ['01', '02', '03', '1', '2', '3', 'a', 'b', 'c', 'main', 'theme', 'background'];
        
        commonPrefixes.forEach(prefix => {
            commonNames.forEach(name => {
                this.supportedExtensions.forEach(ext => {
                    const filename = `${prefix}${name}${ext}`;
                    scanPromises.push(
                        this.tryLoadTrack(basePath + filename)
                            .then(success => {
                                if (success) {
                                    foundTracks.add(basePath + filename);
                                }
                                return success;
                            })
                    );
                });
            });
        });
        
        // When all scan attempts are done
        Promise.all(scanPromises).then(() => {
            // Convert Set to Array and sort
            this.musicTracks = Array.from(foundTracks).sort();
            console.log(`Found ${this.musicTracks.length} music tracks:`, this.musicTracks);
            
            if (this.musicTracks.length > 0) {
                this.audioElement.src = this.musicTracks[0];
                this.audioElement.load();
                console.log(`Loaded first track: ${this.musicTracks[0]}`);
            } else {
                console.warn('No music tracks found. Please add MP3 files to the /music/ directory.');
            }
        });
    }
    
    tryLoadTrack(url) {
        return new Promise(resolve => {
            const tempAudio = new Audio();
            
            // Set a timeout in case the file doesn't exist
            const timeout = setTimeout(() => {
                tempAudio.removeEventListener('canplaythrough', handleCanPlay);
                tempAudio.removeEventListener('error', handleError);
                resolve(false);
            }, 500); // Shorter timeout for faster scanning
            
            const handleCanPlay = () => {
                clearTimeout(timeout);
                tempAudio.removeEventListener('canplaythrough', handleCanPlay);
                tempAudio.removeEventListener('error', handleError);
                console.log(`Track found: ${url}`);
                resolve(true);
            };
            
            const handleError = () => {
                clearTimeout(timeout);
                tempAudio.removeEventListener('canplaythrough', handleCanPlay);
                tempAudio.removeEventListener('error', handleError);
                resolve(false);
            };
            
            tempAudio.addEventListener('canplaythrough', handleCanPlay);
            tempAudio.addEventListener('error', handleError);
            tempAudio.src = url;
            tempAudio.load();
        });
    }
    
    playNextTrack() {
        if (this.musicTracks.length === 0) return;
        
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.musicTracks.length;
        const nextFile = this.musicTracks[this.currentTrackIndex];
        console.log(`Loading next track (${this.currentTrackIndex + 1}/${this.musicTracks.length}): ${nextFile}`);
        
        this.audioElement.src = nextFile;
        this.audioElement.load();
        
        if (this.isPlaying) {
            this.audioElement.play().catch(error => {
                console.error(`Error playing next track: ${error.message}`);
                // If a track fails, try the next one
                setTimeout(() => this.playNextTrack(), 1000);
            });
        }
    }
    
    togglePlay() {
        if (this.isPlaying) {
            this.audioElement.pause();
        } else {
            // If no tracks are loaded yet, wait for them to load
            if (this.musicTracks.length === 0) {
                // Wait a bit for tracks to be found
                setTimeout(() => {
                    if (this.musicTracks.length > 0) {
                        this.audioElement.play().catch(e => {
                            console.error('Cannot play audio:', e);
                            alert('Click again to enable audio. Your browser may be blocking autoplay.');
                        });
                    }
                }, 2000);
            } else {
                this.audioElement.play().catch(e => {
                    console.error('Cannot play audio:', e);
                    alert('Click again to enable audio. Your browser may be blocking autoplay.');
                });
            }
        }
    }
    
    toggleMute() {
        if (this.audioElement.muted) {
            this.audioElement.muted = false;
            this.audioToggle.classList.remove('muted');
            this.audioIcon.className = 'fas fa-volume-up';
            localStorage.setItem('monsterTruckAudioMuted', 'false');
        } else {
            this.audioElement.muted = true;
            this.audioToggle.classList.add('muted');
            this.audioIcon.className = 'fas fa-volume-mute';
            localStorage.setItem('monsterTruckAudioMuted', 'true');
        }
    }
    
    // Method to manually add a track (can be called from console for testing)
    addTrack(url) {
        if (!this.musicTracks.includes(url)) {
            this.musicTracks.push(url);
            this.musicTracks.sort();
            console.log(`Added track: ${url}`);
            console.log(`Total tracks: ${this.musicTracks.length}`);
            
            // If this is the first track, load it
            if (this.musicTracks.length === 1) {
                this.audioElement.src = url;
                this.audioElement.load();
            }
        }
    }
}

// Initialize the music player when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.musicPlayer = new MusicPlayer();
    
    // Add a global method to manually trigger a rescan (can be called from console)
    window.rescanMusicFiles = () => {
        if (window.musicPlayer) {
            window.musicPlayer.scanForMusicFiles();
        }
    };
}); 