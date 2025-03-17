import * as THREE from 'three';

export class SoundManager {
    constructor(camera) {
        // Create audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create Three.js audio listener and attach to camera
        this.listener = new THREE.AudioListener();
        if (camera) {
            this.camera = camera;
            camera.add(this.listener);
            console.log('Audio listener attached to camera');
        } else {
            console.warn('No camera provided to SoundManager');
        }
        
        // Initialize sound pools
        this.soundPools = new Map();
        this.activeSounds = new Map();
        
        // Music tracks
        this.musicTracks = new Map();
        this.currentMusic = null;
        
        // Volume settings
        this.masterVolume = 1.0;
        this.sfxVolume = 0.5;
        this.musicVolume = 0.3;
        
        console.log('Initializing sound pools...');
        this.initializeSoundPools();
        
        // Load music tracks
        console.log('Loading music tracks...');
        this.initializeMusicTracks();
        
        // Check audio context state
        this.checkAudioContext();
    }
    
    checkAudioContext() {
        if (this.listener.context.state === 'suspended') {
            console.log('Audio context is suspended. Waiting for user interaction...');
            const resumeAudio = () => {
                console.log('Attempting to resume audio context...');
                this.listener.context.resume().then(() => {
                    console.log('Audio context resumed successfully');
                    // Retry loading sounds after context is resumed
                    this.initializeSoundPools();
                }).catch(error => {
                    console.error('Error resuming audio context:', error);
                });
                document.removeEventListener('click', resumeAudio);
                document.removeEventListener('keydown', resumeAudio);
                document.removeEventListener('touchstart', resumeAudio);
            };
            
            document.addEventListener('click', resumeAudio);
            document.addEventListener('keydown', resumeAudio);
            document.addEventListener('touchstart', resumeAudio);
        } else {
            console.log('Audio context is ready:', this.listener.context.state);
        }
    }
    
    initializeSoundPools() {
        // Vehicle sounds
        this.createSoundPool('engine_idle', 'sounds/engine_idle.mp3', 1);
        this.createSoundPool('engine_rev', 'sounds/engine_rev.mp3', 1);
        this.createSoundPool('tire_screech', 'sounds/tire_screech.mp3', 3);
        
        // Weapon sounds
        this.createSoundPool('shoot', 'sounds/shoot.mp3', 5);
        this.createSoundPool('explosion', 'sounds/explosion.mp3', 3);
        this.createSoundPool('hit', 'sounds/hit.mp3', 3);
        this.createSoundPool('turret_shoot', 'sounds/turret_shoot.mp3', 5);
        
        // Damage sounds
        this.createSoundPool('wall_hit', 'sounds/wall_hit.mp3', 3);
        this.createSoundPool('vehicle_hit', 'sounds/vehicle_hit.mp3', 3);
        this.createSoundPool('metal_impact', 'sounds/metal_impact.mp3', 3);
        
        // Powerup sounds
        this.createSoundPool('powerup_pickup', 'sounds/powerup.mp3', 3);
        this.createSoundPool('powerup_speed', 'sounds/powerup_speed.mp3', 2);
        this.createSoundPool('powerup_shield', 'sounds/powerup_shield.mp3', 2);
        this.createSoundPool('powerup_health', 'sounds/powerup_health.mp3', 2);
        
        // UI sounds
        this.createSoundPool('menu_select', 'sounds/menu_select.mp3', 1);
        this.createSoundPool('menu_confirm', 'sounds/menu_confirm.mp3', 1);
    }
    
    initializeMusicTracks() {
        // Load all music tracks from the pattern_bar_live series
        for (let i = 0; i <= 18; i++) {
            const trackNum = i.toString().padStart(2, '0');
            const trackName = `pattern_bar_live_part${trackNum}`;
            this.loadMusicTrack(trackName, `music/${trackName}.mp3`);
        }
        
        // Load fallback track
        this.loadMusicTrack('fallback', 'music/fallback.mp3');
    }
    
    createSoundPool(name, path, poolSize, options = {}) {
        console.log(`Creating sound pool for ${name} with path ${path}`);
        
        // Check if pool already exists
        if (this.soundPools.has(name)) {
            console.log(`Sound pool ${name} already exists, skipping creation`);
            return;
        }
        
        const pool = [];
        for (let i = 0; i < poolSize; i++) {
            try {
                const sound = new THREE.Audio(this.listener);
                const loader = new THREE.AudioLoader();
                
                loader.load(
                    path, 
                    (buffer) => {
                        console.log(`Successfully loaded sound: ${name} (instance ${i + 1}/${poolSize})`);
                        sound.setBuffer(buffer);
                        sound.setVolume(this.sfxVolume * this.masterVolume);
                        if (options.pitch) {
                            sound.setPlaybackRate(options.pitch);
                        }
                    },
                    (progress) => {
                        const percent = (progress.loaded / progress.total * 100).toFixed(2);
                        console.log(`Loading sound ${name} (instance ${i + 1}/${poolSize}): ${percent}%`);
                    },
                    (error) => {
                        console.error(`Error loading sound ${name} from ${path} (instance ${i + 1}/${poolSize}):`, error);
                    }
                );
                
                pool.push(sound);
            } catch (error) {
                console.error(`Error creating sound instance for ${name}:`, error);
            }
        }
        
        if (pool.length > 0) {
            this.soundPools.set(name, pool);
            console.log(`Created sound pool for ${name} with ${pool.length} instances`);
        } else {
            console.error(`Failed to create any sound instances for ${name}`);
        }
    }
    
    loadMusicTrack(name, path) {
        const music = new THREE.Audio(this.listener);
        const loader = new THREE.AudioLoader();
        
        loader.load(path, (buffer) => {
            music.setBuffer(buffer);
            music.setVolume(this.musicVolume * this.masterVolume);
            music.setLoop(true);
        });
        
        this.musicTracks.set(name, music);
    }
    
    playSound(name, position = null) {
        console.log(`Attempting to play sound: ${name}`);
        
        // Check audio context state
        if (this.listener.context.state === 'suspended') {
            console.warn('Audio context is suspended, attempting to resume...');
            this.listener.context.resume().then(() => {
                console.log('Audio context resumed, retrying sound playback');
                this.playSound(name, position);
            });
            return null;
        }
        
        const pool = this.soundPools.get(name);
        if (!pool) {
            console.warn(`Sound pool not found: ${name}`);
            console.log('Available sound pools:', Array.from(this.soundPools.keys()));
            return null;
        }
        
        // Find an available sound from the pool
        const sound = pool.find(s => !s.isPlaying);
        if (!sound) {
            console.warn(`No available sounds in pool: ${name} (all ${pool.length} instances are playing)`);
            return null;
        }
        
        // Check if sound is ready to play
        if (!sound.buffer) {
            console.warn(`Sound ${name} not loaded yet (buffer not ready)`);
            return null;
        }
        
        try {
            // If position is provided, make it positional
            if (position) {
                console.log(`Creating positional sound at (${position.x}, ${position.y}, ${position.z})`);
                const posSound = new THREE.PositionalAudio(this.listener);
                posSound.setBuffer(sound.buffer);
                posSound.setVolume(this.sfxVolume * this.masterVolume);
                posSound.setRefDistance(20);
                posSound.setRolloffFactor(1);
                posSound.position.copy(position);
                
                try {
                    posSound.play();
                    console.log(`Successfully started playing positional sound: ${name}`);
                    return posSound;
                } catch (error) {
                    console.error(`Error playing positional sound ${name}:`, error);
                    return null;
                }
            }
            
            // Set the volume before playing
            sound.setVolume(this.sfxVolume * this.masterVolume);
            sound.play();
            console.log(`Successfully started playing non-positional sound: ${name}`);
            return sound;
        } catch (error) {
            console.error(`Error playing sound ${name}:`, error);
            return null;
        }
    }
    
    playMusic(name) {
        // Stop current music if playing
        if (this.currentMusic && this.currentMusic.isPlaying) {
            this.currentMusic.stop();
        }
        
        const music = this.musicTracks.get(name);
        if (!music) {
            console.warn(`Music track not found: ${name}`);
            return;
        }
        
        music.play();
        this.currentMusic = music;
    }
    
    stopMusic() {
        if (this.currentMusic && this.currentMusic.isPlaying) {
            this.currentMusic.stop();
        }
    }
    
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }
    
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }
    
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }
    
    updateAllVolumes() {
        // Update sound pools
        for (const pool of this.soundPools.values()) {
            for (const sound of pool) {
                sound.setVolume(this.sfxVolume * this.masterVolume);
            }
        }
        
        // Update music tracks
        for (const music of this.musicTracks.values()) {
            music.setVolume(this.musicVolume * this.masterVolume);
        }
    }
    
    dispose() {
        // Stop and dispose all sounds
        for (const pool of this.soundPools.values()) {
            for (const sound of pool) {
                if (sound.isPlaying) sound.stop();
                sound.disconnect();
            }
        }
        
        // Stop and dispose all music
        for (const music of this.musicTracks.values()) {
            if (music.isPlaying) music.stop();
            music.disconnect();
        }
        
        this.soundPools.clear();
        this.musicTracks.clear();
        if (this.camera && this.listener) {
            this.camera.remove(this.listener);
        }
    }
} 