import * as THREE from 'three';

export class SoundManager {
    constructor(camera) {
        this.camera = camera;
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        
        // Sound pools for frequently used sounds
        this.soundPools = new Map();
        
        // Currently playing sounds
        this.activeSounds = new Map();
        
        // Music tracks
        this.musicTracks = new Map();
        this.currentMusic = null;
        
        // Volume settings
        this.masterVolume = 0.7;
        this.sfxVolume = 0.5;
        this.musicVolume = 0.3;
        
        // Initialize sound pools
        this.initializeSoundPools();
        this.initializeMusicTracks();
    }
    
    initializeSoundPools() {
        // Vehicle sounds
        this.createSoundPool('engine_idle', 'sounds/engine_idle.mp3', 1);
        this.createSoundPool('engine_rev', 'sounds/engine_rev.mp3', 1);
        this.createSoundPool('tire_screech', 'sounds/tire_screech.mp3', 3);
        this.createSoundPool('suspension_bounce', 'sounds/suspension_bounce.mp3', 3);
        
        // Weapon sounds
        this.createSoundPool('weapon_fire', 'sounds/weapon_fire.mp3', 5);
        this.createSoundPool('projectile_hit', 'sounds/projectile_hit.mp3', 5);
        this.createSoundPool('turret_fire', 'sounds/weapon_fire.mp3', 5, { pitch: 0.5 }); // Pitched down version
        
        // Damage sounds
        this.createSoundPool('vehicle_hit', 'sounds/vehicle_hit.mp3', 3);
        this.createSoundPool('vehicle_explosion', 'sounds/vehicle_explosion.mp3', 3);
        this.createSoundPool('metal_impact', 'sounds/metal_impact.mp3', 3);
        this.createSoundPool('damage_warning', 'sounds/damage_warning.mp3', 1);
        this.createSoundPool('shield_hit', 'sounds/shield_hit.mp3', 3);
        
        // Powerup sounds
        this.createSoundPool('powerup_pickup', 'sounds/powerup_pickup.mp3', 3);
        this.createSoundPool('powerup_speed', 'sounds/powerup_speed.mp3', 2);
        this.createSoundPool('powerup_shield', 'sounds/powerup_shield.mp3', 2);
        this.createSoundPool('powerup_health', 'sounds/powerup_health.mp3', 2);
        this.createSoundPool('powerup_damage', 'sounds/powerup_damage.mp3', 2);
        this.createSoundPool('powerup_ammo', 'sounds/powerup_ammo.mp3', 2);
        
        // UI sounds
        this.createSoundPool('menu_select', 'sounds/menu_select.mp3', 1);
        this.createSoundPool('menu_confirm', 'sounds/menu_confirm.mp3', 1);
        this.createSoundPool('menu_back', 'sounds/menu_back.mp3', 1);
        this.createSoundPool('chat_message', 'sounds/chat_message.mp3', 1);
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
        const pool = [];
        for (let i = 0; i < poolSize; i++) {
            const sound = new THREE.Audio(this.listener);
            const loader = new THREE.AudioLoader();
            
            loader.load(path, (buffer) => {
                sound.setBuffer(buffer);
                sound.setVolume(this.sfxVolume * this.masterVolume);
                if (options.pitch) {
                    sound.setPlaybackRate(options.pitch);
                }
            });
            
            pool.push(sound);
        }
        this.soundPools.set(name, pool);
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
        const pool = this.soundPools.get(name);
        if (!pool) {
            console.warn(`Sound not found: ${name}`);
            return null;
        }
        
        // Find an available sound from the pool
        const sound = pool.find(s => !s.isPlaying);
        if (!sound) {
            console.warn(`No available sounds in pool: ${name}`);
            return null;
        }
        
        // If position is provided, make it positional
        if (position) {
            const posSound = new THREE.PositionalAudio(this.listener);
            posSound.setBuffer(sound.buffer);
            posSound.setVolume(sound.volume);
            posSound.setRefDistance(20);
            posSound.setRolloffFactor(1);
            posSound.position.copy(position);
            posSound.play();
            return posSound;
        }
        
        sound.play();
        return sound;
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
        this.camera.remove(this.listener);
    }
} 