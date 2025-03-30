import * as THREE from 'three';
import { MonsterTruck } from './MonsterTruck.js';

export default class Multiplayer {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.players = new Map();
        this.remoteProjectiles = new Map();
        this.localPlayerId = null;
        this.serverUrl = 'https://monster-truck-stadium.fly.dev';
        this.fallbackUrl = 'http://localhost:3000';
        this.isConnecting = false;
        this.isConnected = false;
        this.isOfflineMode = false;
        this.lastUpdateTime = 0;
        this.throttleRate = 50; // ms between updates
        this.playerColors = ['#ff00ff', '#00ffff', '#ffff00', '#00ff00', '#ff0000', '#0000ff'];
        
        // Connect to the server
        this.connect();
    }
    
    connect() {
        try {
            console.log('🎮 [Multiplayer] Connecting to multiplayer server...');
            
            // Verify io is available (double-check)
            if (typeof io === 'undefined') {
                throw new Error('Socket.io not found when attempting to connect');
            }
            
            // Initialize socket with better error handling
            console.log('🎮 [Multiplayer] Creating socket with options');
            
            // Use the primary server URL
            this.socket = io(this.serverUrl, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5,
                autoConnect: true,
                forceNew: true // Force a new connection to avoid sharing issues
            });

            console.log('🎮 [Multiplayer] Socket created:', !!this.socket);
            
            // Add connection error handler with fallback logic
            this.socket.on('connect_error', (error) => {
                console.error('🎮 [Multiplayer] Connection error:', error);
                window.isMultiplayerInitialized = false;
                
                if (window.addChatMessage && typeof window.addChatMessage === 'function') {
                    window.addChatMessage('System', 'Error connecting to primary server: ' + error.message);
                    window.addChatMessage('System', 'Attempting to connect to fallback server...');
                }
                
                // Disconnect from the primary server
                this.socket.disconnect();
                
                // Try fallback server
                console.log('🎮 [Multiplayer] Trying fallback server...');
                this.socket = io(this.fallbackUrl, {
                    withCredentials: true,
                    transports: ['websocket', 'polling'],
                    timeout: 10000,
                    reconnection: true,
                    reconnectionAttempts: 5,
                    autoConnect: true,
                    forceNew: true
                });
                
                // Set up events for the fallback server
                this.setupSocketEvents();
                
                // Add a specific error handler for the fallback
                this.socket.on('connect_error', (fallbackError) => {
                    console.error('🎮 [Multiplayer] Fallback connection error:', fallbackError);
                    if (window.addChatMessage && typeof window.addChatMessage === 'function') {
                        window.addChatMessage('System', 'Error connecting to fallback server. Switching to offline mode.');
                    }
                    
                    // Enable offline mode - create a mock socket that doesn't throw errors
                    this.enableOfflineMode();
                });
            });

            // Handle disconnection
            this.socket.on('disconnect', (reason) => {
                console.warn('🎮 [Multiplayer] Disconnected from server:', reason);
                window.isMultiplayerInitialized = false;
                
                if (window.addChatMessage && typeof window.addChatMessage === 'function') {
                    window.addChatMessage('System', 'Disconnected from server: ' + reason);
                    window.addChatMessage('System', 'Attempting to reconnect...');
                }
            });

            // Set up all event handlers
            this.setupSocketEvents();
            
            // Start sending updates and listening for chat toggle
            this.startUpdates();
            
            console.log('🎮 [Multiplayer] Connection setup completed');
            
        } catch (error) {
            console.error('🎮 [Multiplayer] Socket initialization error:', error);
            window.isMultiplayerInitialized = false;
            if (this.game && this.game.showMessage) {
                this.game.showMessage('Multiplayer initialization failed - playing in single player mode');
            }
            if (window.addChatMessage && typeof window.addChatMessage === 'function') {
                window.addChatMessage('System', 'Error: Multiplayer initialization failed: ' + error.message);
            }
            
            // Enable offline mode
            this.enableOfflineMode();
        }
    }
    
    // Create an offline mode with a mock socket
    enableOfflineMode() {
        console.log('🎮 [Multiplayer] Enabling offline mode');
        
        // Create a mock socket object that won't throw errors
        this.socket = {
            connected: false,
            id: 'offline-' + Math.random().toString(36).substr(2, 9),
            on: (event, callback) => {
                console.log(`🎮 [Multiplayer] Offline mode: event ${event} would be registered`);
                return this;
            },
            emit: (event, data) => {
                console.log(`🎮 [Multiplayer] Offline mode: event ${event} would be emitted`);
                return this;
            },
            disconnect: () => {
                console.log('🎮 [Multiplayer] Offline mode: would disconnect');
                return this;
            },
            connect: () => {
                console.log('🎮 [Multiplayer] Offline mode: would connect');
                return this;
            },
            // Add any other socket methods that might be called
            removeAllListeners: () => {
                return this;
            }
        };
        
        // Set a flag to indicate offline mode
        this.isOfflineMode = true;
        
        if (window.addChatMessage && typeof window.addChatMessage === 'function') {
            window.addChatMessage('System', 'Switched to offline mode. Multiplayer features disabled.');
        }
        
        if (this.game && this.game.showMessage) {
            this.game.showMessage('Switched to offline mode - multiplayer disabled');
        }
    }
    
    setupSocketEvents() {
        if (!this.socket) {
            console.error('🎮 [Multiplayer] Cannot set up socket events: socket is null');
            return;
        }
        
        console.log('🎮 [Multiplayer] Setting up socket events');
        
        // When connected to the server
        this.socket.on('connect', () => {
            console.log('🎮 [Multiplayer] Connected to multiplayer server');
            this.isConnected = true;
            this.localPlayerId = this.socket.id;
            
            // Set global multiplayer initialization status
            window.isMultiplayerInitialized = true;
            
            // Update chat status indicator
            const chatStatus = document.getElementById('chat-status');
            if (chatStatus) chatStatus.classList.add('online');
            
            // Clear existing players when reconnecting to prevent duplicates
            this.players.forEach((player, id) => {
                if (id !== this.localPlayerId) {
                    this.removeRemotePlayer(id);
                }
            });
            
            // Send initial player data
            this.sendPlayerInfo();
            
            // Show connected message
            this.showNotification(`Connected to multiplayer server`);
        });
        
        // When a connection error occurs
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            console.log('Connection error details:', {
                errorMessage: error.message,
                errorType: error.type,
                errorDescription: error.description
            });
            this.showNotification('Connection error, retrying...', 'error');
        });
        
        // When receiving full game state
        this.socket.on('gameState', (gameState) => {
            console.log('Received game state:', gameState);
            
            // Clear existing players before adding new ones to prevent duplicates
            this.players.forEach((player, id) => {
                if (id !== this.localPlayerId) {
                    this.removeRemotePlayer(id);
                }
            });
            
            // Create other players
            Object.values(gameState.players).forEach(playerData => {
                if (playerData.id !== this.localPlayerId) {
                    this.addRemotePlayer(playerData);
                }
            });
        });
        
        // When a new player joins
        this.socket.on('playerJoined', (playerData) => {
            if (playerData.id !== this.localPlayerId) {
                console.log('New player joined:', playerData);
                
                // Remove any existing player with this ID first to prevent duplicates
                if (this.players.has(playerData.id)) {
                    console.log('Removing existing player before adding new one:', playerData.id);
                    this.removeRemotePlayer(playerData.id);
                }
                
                this.addRemotePlayer(playerData);
                this.showNotification(`${playerData.nickname} joined the arena`);
            }
        });
        
        // When a player moves
        this.socket.on('playerMoved', (playerData) => {
            this.updateRemotePlayer(playerData);
        });
        
        // When a player leaves
        this.socket.on('playerLeft', (playerData) => {
            console.log('Player left:', playerData.id);
            
            // Store nickname before removing
            const nickname = this.players.get(playerData.id)?.nickname || 'Player';
            
            // Remove the player
            this.removeRemotePlayer(playerData.id);
            
            // Show notification after removal
            this.showNotification(`${nickname} left the arena`);
        });
        
        // When a player shoots
        this.socket.on('projectileCreated', (projectileData) => {
            // Don't create projectiles for the local player (they already did that)
            if (projectileData.playerId !== this.localPlayerId) {
                this.createRemoteProjectile(projectileData);
            }
        });
        
        // When a player takes damage
        this.socket.on('playerDamaged', (damageData) => {
            console.log('💥 GOT DAMAGE EVENT FROM SERVER:', damageData);
            
            // If it's the local player
            if (damageData.id === this.localPlayerId) {
                // Only apply damage if it came from someone else
                if (damageData.sourceId !== this.localPlayerId) {
                    console.log('🩸 TAKING DAMAGE FROM REMOTE PLAYER:', damageData.damage, 'New health:', damageData.health);
                    
                    // Force health update with server value (MISSION CRITICAL)
                    if (this.game) {
                        // Immediately apply the health update for consistency
                        const oldHealth = this.game.health;
                        
                        // Update game health
                        this.game.health = Math.max(0, damageData.health);
                        console.log('Game health set to:', this.game.health);
                        
                        // Update monster truck health
                        if (this.game.monsterTruck) {
                            this.game.monsterTruck.health = Math.max(0, damageData.health);
                            console.log('MonsterTruck health set to:', this.game.monsterTruck.health);
                            
                            // Force visual damage effect
                            if (typeof this.game.monsterTruck.showDamageEffect === 'function') {
                                this.game.monsterTruck.showDamageEffect();
                            }
                        }
                        
                        // Try all possible ways to update HUD
                        try {
                            if (typeof this.game.updateHUD === 'function') {
                                this.game.updateHUD();
                            }
                            
                            const healthDisplay = document.getElementById('health');
                            if (healthDisplay) {
                                healthDisplay.textContent = `HEALTH: ${this.game.health}`;
                                
                                // Add visual flash effect to health display
                                healthDisplay.style.backgroundColor = 'rgba(255,0,0,0.5)';
                                setTimeout(() => {
                                    healthDisplay.style.backgroundColor = 'transparent';
                                }, 300);
                            }
                            
                            // Update health bar if it exists
                            const healthBar = document.getElementById('health-bar');
                            if (healthBar) {
                                healthBar.style.width = `${(this.game.health / 100) * 100}%`;
                                healthBar.style.backgroundColor = 'red';
                                setTimeout(() => {
                                    healthBar.style.backgroundColor = '';
                                }, 300);
                            }
                        } catch (e) {
                            console.error('Error updating HUD:', e);
                        }
                        
                        // Ensure visual feedback - add to damage value in case health delta is too small
                        const visualDamage = Math.max(damageData.damage, oldHealth - this.game.health, 10);
                        
                        // Call multiple visual effect methods for redundancy
                        try {
                            // Method 1: Use handleRemoteProjectileHit but don't let it do server updates
                            // to avoid duplicating the damage
                            if (typeof this.game.handleRemoteProjectileHit === 'function') {
                                // Create a special version of the function that doesn't send updates back to server
                                const localHandler = this.game.handleRemoteProjectileHit;
                                this.game.handleRemoteProjectileHit = function(sourceId, damage) {
                                    console.log(`Visual-only hit effect from ${sourceId}`);
                                    // Play hit sound
                                    if (window.audioManager) {
                                        window.audioManager.playSound('vehicle_hit', this.truck?.position);
                                    } else if (window.SoundFX) {
                                        window.SoundFX.play('vehicle_hit');
                                    }
                                    
                                    // Create hit effect
                                    if (this.truck && typeof this.createProjectileImpactOnVehicle === 'function') {
                                        this.createProjectileImpactOnVehicle(this.truck.position.clone());
                                    }
                                    
                                    // Shake camera
                                    if (typeof this.shakeCamera === 'function') {
                                        this.shakeCamera(damage * 0.15);
                                    }
                                    
                                    // Add screen effect
                                    if (typeof this.addDamageScreenEffect === 'function') {
                                        this.addDamageScreenEffect(damage);
                                    }
                                };
                                
                                // Call modified handler
                                this.game.handleRemoteProjectileHit(damageData.sourceId, visualDamage);
                                
                                // Restore original function
                                this.game.handleRemoteProjectileHit = localHandler;
                            } else {
                                // Fallback methods if handleRemoteProjectileHit doesn't exist
                                
                                // Method 2: Use addDamageScreenEffect
                                if (typeof this.game.addDamageScreenEffect === 'function') {
                                    this.game.addDamageScreenEffect(visualDamage);
                                }
                                
                                // Method 3: Create direct impact effect at player position
                                if (this.game.truck && typeof this.game.createProjectileImpactOnVehicle === 'function') {
                                    this.game.createProjectileImpactOnVehicle(this.game.truck.position.clone());
                                }
                                
                                // Method 4: Shake camera
                                if (typeof this.game.shakeCamera === 'function') {
                                    this.game.shakeCamera(visualDamage * 0.15);
                                }
                                
                                // Sound effects
                                if (window.audioManager) {
                                    window.audioManager.playSound('vehicle_hit', this.game.truck?.position);
                                } else if (window.SoundFX) {
                                    window.SoundFX.play('vehicle_hit');
                                }
                            }
                        } catch (e) {
                            console.error('Error showing damage effects:', e);
                            
                            // Fallback to basic effects if an error occurs
                            try {
                                if (typeof this.game.addDamageScreenEffect === 'function') {
                                    this.game.addDamageScreenEffect(visualDamage);
                                }
                                
                                if (window.SoundFX) {
                                    window.SoundFX.play('vehicle_hit');
                                }
                            } catch (innerError) {
                                console.error('Critical error in fallback damage effects:', innerError);
                            }
                        }
                    }
                    
                    // Show notification
                    try {
                        const attacker = this.players.get(damageData.sourceId)?.nickname || 'Another player';
                        this.showNotification(`${attacker} hit you for ${damageData.damage} damage!`, 'error');
                    } catch (e) {
                        console.error('Error showing notification:', e);
                    }
                    
                    console.log('HEALTH AFTER SERVER DAMAGE:', this.game ? this.game.health : 'Unknown');
                }
            } else {
                // Show damage effect on remote player
                if (this.players.get(damageData.id) && this.players.get(damageData.id).truckMesh) {
                    this.showDamageEffect(this.players.get(damageData.id).truckMesh.position);
                    
                    // If we were the source, show a hit confirmation
                    if (damageData.sourceId === this.localPlayerId) {
                        const targetName = this.players.get(damageData.id)?.nickname || 'another player';
                        this.showNotification(`Hit on ${targetName} confirmed!`, 'success');
                    }
                }
            }
        });
        
        // When a player dies
        this.socket.on('playerDied', (deathData) => {
            if (deathData.id === this.localPlayerId) {
                // Local player died
                this.game.health = 0;
                this.game.monsterTruck.health = 0;
                
                if (this.players.get(deathData.killedBy)) {
                    this.showNotification(`You were destroyed by ${this.players.get(deathData.killedBy).nickname}!`, 'error');
                }
                
                // Wait for respawn from server
            } else if (this.players.get(deathData.id)) {
                // Remote player died
                this.showExplosion(this.players.get(deathData.id).truckMesh.position);
                
                if (deathData.killedBy === this.localPlayerId) {
                    this.game.score += 100;
                    this.showNotification(`You destroyed ${this.players.get(deathData.id).nickname}!`, 'success');
                } else {
                    this.showNotification(`${this.players.get(deathData.id).nickname} was destroyed!`);
                }
            }
        });
        
        // When a player respawns
        this.socket.on('playerRespawned', (respawnData) => {
            if (respawnData.id === this.localPlayerId) {
                // Local player respawned
                this.game.health = respawnData.health;
                this.game.monsterTruck.health = respawnData.health;
                
                // Move to respawn position
                if (this.game.truck && respawnData.position) {
                    this.game.truck.position.copy(new THREE.Vector3(
                        respawnData.position.x,
                        respawnData.position.y,
                        respawnData.position.z
                    ));
                }
                
                this.showNotification('You have respawned!', 'success');
            } else if (this.players.get(respawnData.id)) {
                // Remote player respawned - update their position
                const player = this.players.get(respawnData.id);
                if (player.truckMesh && respawnData.position) {
                    player.truckMesh.position.copy(new THREE.Vector3(
                        respawnData.position.x,
                        respawnData.position.y,
                        respawnData.position.z
                    ));
                }
            }
        });
        
        // When turrets are updated
        this.socket.on('turretsUpdated', (turrets) => {
            // Update turret states from host
            if (this.game.turrets) {
                this.updateTurrets(turrets);
            }
        });
        
        // When receiving a chat message
        this.socket.on('chat', (chatData) => {
            console.log('Received chat message in Multiplayer.js socket event:', chatData);
            
            // Validate the chat data
            if (!chatData || !chatData.message) {
                console.error('Invalid chat data received in socket event:', chatData);
                return;
            }
            
            // Always process the message, regardless of who sent it
            this.receiveChatMessage(chatData);
            
            // Also try the global chat function as a fallback
            if (window.addChatMessage && typeof window.addChatMessage === 'function') {
                const sender = chatData.playerId === this.localPlayerId ? 'You' : chatData.nickname;
                window.addChatMessage(sender, chatData.message);
            }
        });
    }
    
    startUpdates() {
        // Increase update rate for more responsive gameplay
        this.throttleRate = 30; // ms between updates (reduced from 50ms)
        
        // Start sending regular position updates
        this.updateInterval = setInterval(() => {
            if (this.isConnected && this.game.truck) {
                this.sendLocalPlayerUpdate();
            }
        }, this.throttleRate);
    }
    
    sendPlayerInfo() {
        if (!this.isConnected || !this.socket) return;
        
        const nickname = localStorage.getItem('monsterTruckNickname') || 'Player';
        const machineType = localStorage.getItem('monsterTruckType') || 'neonCrusher';
        const color = localStorage.getItem('monsterTruckColor') || '#ff00ff';
        
        this.socket.emit('playerJoin', {
            nickname: nickname,
            position: {
                x: this.game.truck.position.x,
                y: this.game.truck.position.y,
                z: this.game.truck.position.z
            },
            rotation: {
                y: this.game.truck.rotation.y
            },
            color: color,
            machineType: machineType,
            health: this.game.health,
            maxHealth: this.game.maxHealth || 100
        });
    }
    
    sendLocalPlayerUpdate() {
        if (!this.socket || !this.game.truck) return;
        
        const now = Date.now();
        
        // Calculate velocity for better prediction
        const velocity = {
            x: 0,
            y: 0,
            z: 0
        };
        
        if (this.game.truck.userData && this.game.truck.userData.lastPosition) {
            const timeDelta = (now - (this.game.truck.userData.lastUpdateTime || now - 100)) / 1000;
            if (timeDelta > 0) {
                velocity.x = (this.game.truck.position.x - this.game.truck.userData.lastPosition.x) / timeDelta;
                velocity.y = (this.game.truck.position.y - this.game.truck.userData.lastPosition.y) / timeDelta;
                velocity.z = (this.game.truck.position.z - this.game.truck.userData.lastPosition.z) / timeDelta;
            }
        }
        
        // Store current position for next velocity calculation
        if (!this.game.truck.userData) this.game.truck.userData = {};
        this.game.truck.userData.lastPosition = this.game.truck.position.clone();
        this.game.truck.userData.lastUpdateTime = now;
        
        // Only send updates if enough time has passed or there's significant change
        if (now - this.lastUpdateTime > this.throttleRate) {
            this.lastUpdateTime = now;
            
            this.socket.emit('playerUpdate', {
                position: {
                    x: this.game.truck.position.x,
                    y: this.game.truck.position.y,
                    z: this.game.truck.position.z
                },
                rotation: {
                    y: this.game.truck.rotation.y
                },
                velocity: velocity,
                health: this.game.monsterTruck ? this.game.monsterTruck.health : this.game.health
            });
        }
    }
    
    sendProjectileCreated(projectile) {
        if (!this.isConnected || !this.socket) return;
        
        this.socket.emit('playerShoot', {
            position: {
                x: projectile.mesh.position.x,
                y: projectile.mesh.position.y,
                z: projectile.mesh.position.z
            },
            direction: {
                x: projectile.direction.x,
                y: projectile.direction.y,
                z: projectile.direction.z
            },
            speed: projectile.speed,
            damage: projectile.damage
        });
    }
    
    sendPlayerHit(playerId, damage, sourceId) {
        if (!this.isConnected || !this.socket) return;
        
        this.socket.emit('playerHit', {
            playerId: playerId,
            damage: damage,
            sourceId: sourceId || this.localPlayerId
        });
    }
    
    sendTurretUpdate() {
        if (!this.isConnected || !this.socket || !this.game.turrets) return;
        
        // Serialize turret data
        const turretData = this.game.turrets.map(turret => ({
            position: {
                x: turret.mesh.position.x,
                y: turret.mesh.position.y,
                z: turret.mesh.position.z
            },
            rotation: {
                y: turret.body ? turret.body.rotation.y : 0
            },
            health: turret.health,
            destroyed: turret.destroyed
        }));
        
        this.socket.emit('turretUpdate', turretData);
    }
    
    sendChatMessage(message) {
        if (!message || !this.socket) {
            console.error('Cannot send chat message: message is empty or socket is not available');
            return;
        }
        
        console.log('Sending chat message to server:', message);
        
        // Get the player name from the game or localStorage
        const nickname = this.game.playerName || 
                         localStorage.getItem('monsterTruckNickname') || 
                         'Player';
        
        // Send message to server with additional debugging
        try {
            const chatData = {
                message: message,
                nickname: nickname
            };
            
            console.log('Emitting chat event with data:', chatData);
            this.socket.emit('chat', chatData);
            
            // Verify socket connection
            if (!this.socket.connected) {
                console.error('Socket is not connected when trying to send chat message');
            }
        } catch (error) {
            console.error('Error sending chat message:', error);
        }
    }
    
    // REMOTE PLAYER MANAGEMENT
    
    addRemotePlayer(playerData) {
        if (!this.game.scene) return;
        
        // Skip if it's the local player or player already exists
        if (playerData.id === this.localPlayerId || this.players.has(playerData.id)) {
            // If player exists, just update their data
            if (this.players.has(playerData.id)) {
                this.updateRemotePlayer(playerData);
            }
            return;
        }
        
        console.log('Adding remote player:', playerData);
        
        // Create a monster truck for the remote player
        const remoteTruck = new MonsterTruck(this.game.scene, new THREE.Vector3(
            playerData.position.x || 0,
            playerData.position.y || 0.5,
            playerData.position.z || 0
        ), {
            machineType: this.mapMachineType(playerData.machineType),
            color: playerData.color || '#ff00ff',
            isRemotePlayer: true
        });
        
        // Set initial rotation
        if (playerData.rotation && remoteTruck.body) {
            remoteTruck.body.rotation.y = playerData.rotation.y || 0;
        }
        
        // Create a nickname display
        const nickname = this.createNicknameDisplay(playerData.nickname, playerData.color);
        this.game.scene.add(nickname);
        
        // Store player data
        this.players.set(playerData.id, {
            id: playerData.id,
            nickname: playerData.nickname,
            truckMesh: remoteTruck.body,
            monsterTruck: remoteTruck,
            nicknameDisplay: nickname,
            color: playerData.color,
            machineType: playerData.machineType,
            health: playerData.health || 100,
            maxHealth: playerData.maxHealth || 100,
            lastPosition: new THREE.Vector3(
                playerData.position.x || 0,
                playerData.position.y || 0.5,
                playerData.position.z || 0
            ),
            targetPosition: new THREE.Vector3(
                playerData.position.x || 0,
                playerData.position.y || 0.5,
                playerData.position.z || 0
            ),
            lastRotation: new THREE.Euler(0, playerData.rotation?.y || 0, 0),
            targetRotation: new THREE.Euler(0, playerData.rotation?.y || 0, 0),
            lastUpdateTime: Date.now(),
            isRespawning: false
        });
    }
    
    updateRemotePlayer(playerData) {
        if (!this.players.has(playerData.id)) return;
        
        const player = this.players.get(playerData.id);
        
        // Update position and rotation targets for interpolation
        if (playerData.position) {
            player.lastPosition.copy(player.targetPosition);
            player.targetPosition.set(
                playerData.position.x,
                playerData.position.y,
                playerData.position.z
            );
        }
        
        if (playerData.rotation) {
            player.lastRotation.copy(player.targetRotation);
            player.targetRotation.set(
                0,
                playerData.rotation.y,
                0
            );
        }
        
        // Update health
        if (playerData.health !== undefined) {
            player.health = playerData.health;
            if (player.monsterTruck) {
                player.monsterTruck.health = playerData.health;
            }
        }
        
        player.lastUpdateTime = Date.now();
    }
    
    removeRemotePlayer(playerId) {
        if (!this.players.has(playerId)) {
            console.log(`Player ${playerId} not found for removal`);
            return;
        }
        
        console.log(`Removing remote player: ${playerId}`);
        const player = this.players.get(playerId);
        
        try {
            // Remove truck from scene
            if (player.monsterTruck) {
                // MonsterTruck doesn't have a dispose method, so we need to remove its components
                if (player.monsterTruck.body && this.game.scene) {
                    this.game.scene.remove(player.monsterTruck.body);
                }
                
                // Remove wheels if they exist
                if (player.monsterTruck.wheels) {
                    player.monsterTruck.wheels.forEach(wheel => {
                        if (wheel && this.game.scene) {
                            this.game.scene.remove(wheel);
                        }
                    });
                }
                
                // Dispose of any geometries and materials
                if (player.monsterTruck.body) {
                    if (player.monsterTruck.body.geometry) {
                        player.monsterTruck.body.geometry.dispose();
                    }
                    
                    if (player.monsterTruck.body.material) {
                        if (Array.isArray(player.monsterTruck.body.material)) {
                            player.monsterTruck.body.material.forEach(mat => mat.dispose());
                        } else {
                            player.monsterTruck.body.material.dispose();
                        }
                    }
                }
            } else if (player.truckMesh && this.game.scene) {
                this.game.scene.remove(player.truckMesh);
            }
            
            // Remove nickname display
            if (player.nicknameDisplay && this.game.scene) {
                this.game.scene.remove(player.nicknameDisplay);
                
                // Dispose of nickname texture and material
                if (player.nicknameDisplay.material) {
                    if (player.nicknameDisplay.material.map) {
                        player.nicknameDisplay.material.map.dispose();
                    }
                    player.nicknameDisplay.material.dispose();
                }
            }
            
            // Remove from players list
            this.players.delete(playerId);
            
            console.log(`Successfully removed player ${playerId}`);
        } catch (error) {
            console.error(`Error removing player ${playerId}:`, error);
        }
    }
    
    updatePlayerPositions() {
        if (!this.game.scene) return;
        
        const now = Date.now();
        
        // Update each remote player's position with improved interpolation
        this.players.forEach((player, playerId) => {
            if (!player.truckMesh || playerId === this.localPlayerId) return;
            
            // Calculate how far we are between updates (0-1)
            const timeSinceUpdate = now - player.lastUpdateTime;
            
            // Use a more responsive interpolation factor
            // This will make movement smoother and more responsive
            const interpolationFactor = Math.min(1.0, timeSinceUpdate / (this.throttleRate * 0.8));
            
            // Apply some prediction for smoother movement
            let predictedPosition = player.targetPosition.clone();
            if (player.velocity) {
                // If we have velocity data, use it for prediction
                predictedPosition.x += player.velocity.x * (timeSinceUpdate / 1000);
                predictedPosition.z += player.velocity.z * (timeSinceUpdate / 1000);
            }
            
            // Interpolate position with prediction
            player.truckMesh.position.lerpVectors(
                player.lastPosition,
                predictedPosition,
                interpolationFactor
            );
            
            // Interpolate rotation with improved smoothing
            // Use a slightly faster rotation interpolation for more responsive turning
            const rotationFactor = Math.min(1.0, timeSinceUpdate / (this.throttleRate * 0.6));
            player.truckMesh.rotation.y = player.lastRotation.y + 
                (player.targetRotation.y - player.lastRotation.y) * rotationFactor;
            
            // Update nickname position
            if (player.nicknameDisplay) {
                player.nicknameDisplay.position.set(
                    player.truckMesh.position.x,
                    player.truckMesh.position.y + 3, // Above truck
                    player.truckMesh.position.z
                );
                
                // Make nickname face camera
                if (this.game.camera) {
                    player.nicknameDisplay.lookAt(this.game.camera.position);
                }
            }
            
            // Update monster truck (handles damage visual effects, etc.)
            if (player.monsterTruck) {
                player.monsterTruck.update();
            }
        });
    }
    
    createRemoteProjectile(projectileData) {
        if (!this.game.scene) return;
        
        // Create a new projectile based on the remote data
        const direction = new THREE.Vector3(
            projectileData.direction.x,
            projectileData.direction.y,
            projectileData.direction.z
        ).normalize();
        
        const position = new THREE.Vector3(
            projectileData.position.x,
            projectileData.position.y,
            projectileData.position.z
        );
        
        // Use the game's existing projectile system
        if (this.game.projectiles) {
            // Use a bigger, more visible projectile for better testing
            const projectileGeometry = new THREE.SphereGeometry(0.3, 8, 8);
            
            // Use player color or default to bright color for visibility
            const playerColor = this.players.get(projectileData.playerId)?.color || '#ff0000';
            const color = new THREE.Color(playerColor);
            
            // Make projectile slightly emissive for better visibility
            const projectileMaterial = new THREE.MeshPhongMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 1.0,
                shininess: 30
            });
            
            const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
            projectileMesh.position.copy(position);
            
            // Set rotation to match direction
            projectileMesh.lookAt(position.clone().add(direction));
            
            // Add to scene
            this.game.scene.add(projectileMesh);
            
            // Add light to projectile for better visibility
            const projectileLight = new THREE.PointLight(color, 1.0, 3);
            projectileMesh.add(projectileLight);
            
            // CRITICAL FIX: Add to game's projectiles array with correct source and playerId
            const remoteProjectile = {
                mesh: projectileMesh,
                direction: direction,
                speed: projectileData.speed || 2.0,
                damage: projectileData.damage || 20,
                lifetime: 90,
                source: 'remote',  // Always use 'remote' for remote players' projectiles
                playerId: projectileData.playerId,  // Store the original player ID
                update: function() { // Add update method for consistency with other projectiles
                    // Update position based on direction and speed
                    this.mesh.position.x += this.direction.x * this.speed;
                    this.mesh.position.y += this.direction.y * this.speed;
                    this.mesh.position.z += this.direction.z * this.speed;
                    
                    // Decrease lifetime
                    this.lifetime--;
                }
            };
            
            // Add to the game's projectiles array
            this.game.projectiles.push(remoteProjectile);
            
            // Create muzzle flash effect
            if (this.game.createMuzzleFlash) {
                this.game.createMuzzleFlash(position, direction);
            }
            
            console.log(`Created remote projectile from player ${projectileData.playerId} with source='remote'`);
        }
    }
    
    updateTurrets(turretsData) {
        if (!this.game.turrets || !turretsData) return;
        
        // Update each turret with data from server
        turretsData.forEach((turretData, index) => {
            if (index < this.game.turrets.length) {
                const turret = this.game.turrets[index];
                
                // Only update from server if this turret state has changed
                if (turret.destroyed !== turretData.destroyed || 
                    turret.health !== turretData.health) {
                    
                    turret.health = turretData.health;
                    turret.destroyed = turretData.destroyed;
                    
                    // Update visual state if destroyed
                    if (turretData.destroyed && !turret.destroyedVisual) {
                        turret.destroyedVisual = true;
                        
                        // Update appearance
                        if (turret.mesh) {
                            turret.mesh.material = new THREE.MeshPhongMaterial({
                                color: 0x000000,
                                emissive: 0xff0000,
                                emissiveIntensity: 0.2,
                                transparent: true,
                                opacity: 0.8
                            });
                            
                            // Tilt to show destruction
                            turret.mesh.rotation.x = Math.random() * 0.5 - 0.25;
                            turret.mesh.rotation.z = Math.random() * 0.5 - 0.25;
                        }
                    }
                }
            }
        });
    }
    
    // CHAT SYSTEM
    
    initChatUI() {
        // Check if game.html chat UI exists
        if (document.getElementById('chat-container')) {
            console.log('Using existing chat UI from game.html');
            this.chatMessages = document.getElementById('chat-messages');
            return;
        }
        
        // Create chat container
        const chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 280px;
            background: rgba(0, 0, 0, 0.7);
            border-left: 3px solid #ff00ff;
            display: none;
            flex-direction: column;
            max-height: 200px;
            overflow: hidden;
            z-index: 100;
            box-shadow: 0 0 15px rgba(0, 0, 0, 0.7);
        `;
        
        // Create chat messages area
        const chatMessages = document.createElement('div');
        chatMessages.id = 'chatMessages';
        chatMessages.style.cssText = `
            overflow-y: auto;
            max-height: 150px;
            padding: 12px;
            color: #fff;
            font-size: 14px;
            font-family: 'Orbitron', sans-serif;
        `;
        
        // Create chat input area
        const chatInputContainer = document.createElement('div');
        chatInputContainer.style.cssText = `
            display: flex;
            padding: 8px;
            border-top: 1px solid #ff00ff;
            background: rgba(0, 0, 0, 0.5);
        `;
        
        const chatInput = document.createElement('input');
        chatInput.id = 'chatInput';
        chatInput.type = 'text';
        chatInput.placeholder = 'Type message and press Enter';
        chatInput.style.cssText = `
            flex: 1;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid #ff00ff;
            color: #fff;
            padding: 8px;
            font-size: 14px;
            font-family: 'Orbitron', sans-serif;
        `;
        
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const message = chatInput.value.trim();
                if (message) {
                    this.sendChatMessage(message);
                    chatInput.value = '';
                }
            } else if (e.key === 'Escape') {
                this.toggleChat();
            }
        });
        
        // Assemble chat UI
        chatInputContainer.appendChild(chatInput);
        chatContainer.appendChild(chatMessages);
        chatContainer.appendChild(chatInputContainer);
        document.body.appendChild(chatContainer);
        
        // Store references
        this.chatContainer = chatContainer;
        this.chatMessages = chatMessages;
        this.chatInput = chatInput;
    }
    
    toggleChat() {
        // If using game.html chat UI
        const gameChatContainer = document.getElementById('chat-container');
        if (gameChatContainer) {
            this.isChatVisible = !this.isChatVisible;
            
            // Toggle visibility
            if (this.isChatVisible) {
                gameChatContainer.style.display = 'flex';
                document.getElementById('chatInput').focus();
                
                // Disable game controls temporarily
                if (this.game.controls) {
                    this.game.controls.enabled = false;
                }
            } else {
                gameChatContainer.style.display = 'none';
                
                // Re-enable game controls
                if (this.game.controls) {
                    this.game.controls.enabled = true;
                }
            }
            return;
        }
        
        // If using our own chat UI
        if (!this.chatContainer) return;
        
        this.isChatVisible = !this.isChatVisible;
        this.chatContainer.style.display = this.isChatVisible ? 'flex' : 'none';
        
        if (this.isChatVisible) {
            this.chatInput.focus();
            
            // Disable game controls temporarily
            if (this.game.controls) {
                this.game.controls.enabled = false;
            }
        } else {
            // Re-enable game controls
            if (this.game.controls) {
                this.game.controls.enabled = true;
            }
        }
    }
    
    receiveChatMessage(chatData) {
        console.log('Processing chat message in Multiplayer.js:', chatData);
        
        if (!chatData || !chatData.message) {
            console.error('Invalid chat data received:', chatData);
            return;
        }
        
        // If we have the global chat function from game.html, use it
        if (window.addChatMessage && typeof window.addChatMessage === 'function') {
            console.log('Using window.addChatMessage to display chat message');
            const sender = chatData.playerId === this.localPlayerId ? 'You' : chatData.nickname;
            window.addChatMessage(sender, chatData.message);
            return;
        }
        
        // Otherwise use our own chat UI
        if (!this.chatMessages) {
            console.error('Chat messages container not found');
            return;
        }
        
        console.log('Using internal chat UI to display message');
        
        // Add message to chat history if it's an array
        if (Array.isArray(this.chatMessages)) {
            this.chatMessages.push(chatData);
            return; // If it's an array, we can't append DOM elements to it
        }
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.style.marginBottom = '5px';
        
        // Format timestamp
        const timestamp = new Date(chatData.timestamp).toLocaleTimeString();
        
        // Determine player color
        let playerColor = '#ff00ff'; // Default color
        if (chatData.playerId === this.localPlayerId) {
            playerColor = this.game.playerColor || '#ff00ff';
        } else if (this.players.has(chatData.playerId)) {
            playerColor = this.players.get(chatData.playerId).color;
        }
        
        // Format message with timestamp, nickname, and message
        messageElement.innerHTML = `
            <span style="color: #888;">[${timestamp}]</span> 
            <span style="color: ${playerColor}; font-weight: bold;">${chatData.nickname}</span>: 
            <span>${this.escapeHTML(chatData.message)}</span>
        `;
        
        // Add to chat container and scroll to bottom
        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        // Show notification if chat is hidden
        if (!this.isChatVisible) {
            this.showNotification(`${chatData.nickname}: ${chatData.message}`, 'chat');
        }
    }
    
    // HELPER METHODS
    
    createNicknameDisplay(nickname, color) {
        // Create a text sprite for the nickname
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const displayColor = color || '#ff00ff';
        
        canvas.width = 256;
        canvas.height = 64;
        
        // Clear canvas
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw border
        context.strokeStyle = displayColor;
        context.lineWidth = 2;
        context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        
        // Draw text
        context.font = 'bold 24px Orbitron, Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = displayColor;
        context.fillText(nickname, canvas.width / 2, canvas.height / 2);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        
        // Create sprite material
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        
        // Create sprite
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(4, 1, 1);
        
        return sprite;
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        
        // Set style based on type
        let bgColor, borderColor;
        switch (type) {
            case 'error':
                bgColor = 'rgba(255, 0, 0, 0.7)';
                borderColor = '#ff0000';
                break;
            case 'success':
                bgColor = 'rgba(0, 255, 0, 0.7)';
                borderColor = '#00ff00';
                break;
            case 'chat':
                bgColor = 'rgba(0, 0, 255, 0.7)';
                borderColor = '#0088ff';
                break;
            default:
                bgColor = 'rgba(255, 0, 255, 0.7)';
                borderColor = '#ff00ff';
        }
        
        notification.style.cssText = `
            position: fixed;
            top: ${70 + document.querySelectorAll('.notification').length * 60}px;
            left: 50%;
            transform: translateX(-50%);
            background-color: ${bgColor};
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            border: 1px solid ${borderColor};
            box-shadow: 0 0 10px ${borderColor};
            font-family: 'Orbitron', sans-serif;
            z-index: 1000;
            pointer-events: none;
            transition: opacity 0.5s;
            opacity: 0;
        `;
        
        notification.textContent = message;
        notification.classList.add('notification');
        
        document.body.appendChild(notification);
        
        // Fade in
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);
        
        // Remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.remove();
                // Reposition remaining notifications
                document.querySelectorAll('.notification').forEach((notif, index) => {
                    notif.style.top = `${70 + index * 60}px`;
                });
            }, 500);
        }, 3000);
    }
    
    showDamageEffect(position) {
        if (!this.game.scene || !this.game.effectsEnabled) return;
        
        // Create limited particles using the game's particle system
        const particleCount = Math.min(5, this.game.maxParticles); // Reduced count
        
        for (let i = 0; i < particleCount; i++) {
            const particle = this.game.createSimpleParticle(
                new THREE.Vector3(
                    position.x + (Math.random() - 0.5) * 2,
                    position.y + Math.random() * 2,
                    position.z + (Math.random() - 0.5) * 2
                ),
                0xff0000,
                Math.random() * 0.2 + 0.1
            );
            
            if (particle) {
                // Set velocity - will be handled by central update
                particle.velocity = {
                    x: (Math.random() - 0.5) * 0.2,
                    y: Math.random() * 0.2 + 0.1,
                    z: (Math.random() - 0.5) * 0.2
                };
                particle.life = 1.0;
            }
        }
        // No more standalone animation loop - will be handled by game's update cycle
    }
    
    showExplosion(position) {
        if (!this.game.scene || !this.game.effectsEnabled) return;
        
        // Delegate to game's explosion effect if available
        if (this.game.createExplosion) {
            this.game.createExplosion(position);
        } else {
            // Create a simple light
            const explosionLight = new THREE.PointLight(0xff5500, 2, 15);
            explosionLight.position.copy(position);
            explosionLight.position.y += 2;
            this.game.scene.add(explosionLight);
            
            // Auto-remove light after 1 second
            setTimeout(() => {
                this.game.scene.remove(explosionLight);
            }, 1000);
            
            // Create particles with game's system
            const particleCount = Math.min(15, this.game.maxParticles);
            
            for (let i = 0; i < particleCount; i++) {
                const size = Math.random() * 0.4 + 0.2;
                const color = i % 2 === 0 ? 0xff5500 : 0xffff00;
                
                const particle = this.game.createSimpleParticle(
                    new THREE.Vector3(
                        position.x + (Math.random() - 0.5) * 3,
                        position.y + Math.random() * 3 + 1,
                        position.z + (Math.random() - 0.5) * 3
                    ),
                    color,
                    size,
                    0.8 + Math.random() * 0.4 // Longer lifetime
                );
                
                if (particle) {
                    // Stronger explosion velocity
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 0.25 + 0.1;
                    particle.velocity = {
                        x: Math.cos(angle) * speed,
                        y: Math.random() * 0.25 + 0.15,
                        z: Math.sin(angle) * speed
                    };
                }
            }
        }
    }
    
    mapMachineType(machineType) {
        // Map machine type to the correct identifier
        if (machineType === 'neonCrusher') {
            return 'neon-crusher';
        } else if (machineType === 'gridRipper') {
            return 'grid-ripper';
        } else if (machineType === 'laserWheel') {
            return 'cyber-beast';
        }
        return 'neon-crusher'; // Default
    }
    
    escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    update() {
        // Update remote player positions
        this.updatePlayerPositions();
    }
    
    checkProjectileHits(projectile) {
        if (!projectile || !projectile.mesh || !this.isConnected) return false;
        
        // MISSION CRITICAL DEBUG LOGGING
        console.log(`CHECKING PROJECTILE HITS: source=${projectile.source}, playerId=${projectile.playerId}, localId=${this.localPlayerId}`);
        
        // Add additional logging for players
        console.log(`Total remote players to check: ${this.players.size}`);
        
        // CRITICAL FIX: We must properly iterate the Map object
        let hitDetected = false;
        
        // Debug the players Map to ensure it's populated
        this.players.forEach((player, id) => {
            console.log(`Player in map: id=${id}, has mesh=${!!player.truckMesh}`);
        });
        
        this.players.forEach((player, playerId) => {
            // Skip the local player and the player who fired the projectile
            if (playerId === this.localPlayerId || 
                (projectile.playerId && playerId === projectile.playerId)) {
                return;
            }
            
            // Skip if player doesn't have a truck mesh
            if (!player.truckMesh) {
                console.log(`Skipping player ${playerId} - no truck mesh`);
                return;
            }
            
            console.log(`⚾ Checking collision with player ${playerId}`);
            
            // ULTRA-WIDE hitbox for maximum reliability
            const truckDimensions = {
                width: 10.0,   // MASSIVELY increased for hit detection
                length: 14.0,  // MASSIVELY increased for hit detection
                height: 8.0    // MASSIVELY increased for hit detection
            };
            
            // Create a larger bounding box to ensure hits register
            const truckBounds = {
                minX: player.truckMesh.position.x - (truckDimensions.width / 2),
                maxX: player.truckMesh.position.x + (truckDimensions.width / 2),
                minY: player.truckMesh.position.y - 3.0, // Extended down more
                maxY: player.truckMesh.position.y + truckDimensions.height,
                minZ: player.truckMesh.position.z - (truckDimensions.length / 2),
                maxZ: player.truckMesh.position.z + (truckDimensions.length / 2)
            };
            
            // Detailed position logging
            console.log(`🚀 Projectile: ${projectile.mesh.position.x.toFixed(1)}, ${projectile.mesh.position.y.toFixed(1)}, ${projectile.mesh.position.z.toFixed(1)}`);
            console.log(`🚗 Player ${playerId}: ${player.truckMesh.position.x.toFixed(1)}, ${player.truckMesh.position.y.toFixed(1)}, ${player.truckMesh.position.z.toFixed(1)}`);
            console.log(`📦 Bounds: X(${truckBounds.minX.toFixed(1)}-${truckBounds.maxX.toFixed(1)}), Y(${truckBounds.minY.toFixed(1)}-${truckBounds.maxY.toFixed(1)}), Z(${truckBounds.minZ.toFixed(1)}-${truckBounds.maxZ.toFixed(1)})`);
            
            // Get projectile position
            const pos = projectile.mesh.position;
            
            // Check if inside bounds - use simpler check for better performance
            let isHit = 
                pos.x >= truckBounds.minX && 
                pos.x <= truckBounds.maxX &&
                pos.z >= truckBounds.minZ && 
                pos.z <= truckBounds.maxZ &&
                pos.y >= truckBounds.minY &&
                pos.y <= truckBounds.maxY;
                
            // RELIABILITY FIX: If not a direct hit, also check proximity for near misses
            if (!isHit) {
                // Calculate distance to player's truck
                const distance = Math.sqrt(
                    Math.pow(player.truckMesh.position.x - pos.x, 2) +
                    Math.pow(player.truckMesh.position.y - pos.y, 2) +
                    Math.pow(player.truckMesh.position.z - pos.z, 2)
                );
                
                // If very close, count as a hit anyway (5 units is very generous)
                if (distance < 5) {
                    console.log(`Near miss converted to hit! Distance: ${distance.toFixed(2)}`);
                    isHit = true;
                } else if (distance < 20) {
                    console.log(`Near miss! Distance: ${distance.toFixed(2)}`);
                }
            }
            
            if (isHit) {
                console.log(`💥 DIRECT HIT on player ${playerId}!`);
                
                // Calculate damage - ensure at least 20 damage for reliability
                const damage = projectile.damage || 20;
                
                // CRITICAL FIX: Use multiple ways to send hit
                // 1. Direct socket emission (most important)
                console.log(`⚡ DIRECTLY sending hit: target=${playerId}, damage=${damage}`);
                this.socket.emit('playerHit', {
                    playerId: playerId,
                    damage: damage,
                    sourceId: this.localPlayerId
                });
                
                // 2. Also try the method approach as backup
                try {
                    this.sendPlayerHit(playerId, damage, this.localPlayerId);
                } catch (err) {
                    console.error("Error using sendPlayerHit method:", err);
                }
                
                // 3. Try sending a direct message to the specific player
                try {
                    this.socket.emit('directHit', {
                        targetId: playerId,
                        damage: damage,
                        sourceId: this.localPlayerId,
                        timestamp: Date.now()
                    });
                } catch (err) {
                    console.error("Error sending direct hit message:", err);
                }
                
                // Create impact effect at hit position
                const impactPoint = new THREE.Vector3(pos.x, pos.y, pos.z);
                this.showDamageEffect(impactPoint);
                
                // Play hit sound
                if (window.audioManager) {
                    window.audioManager.playSound('vehicle_hit', this.game.truck?.position);
                } else if (window.SoundFX) {
                    window.SoundFX.play('vehicle_hit');
                }
                
                // Show notification
                this.showNotification(`You hit ${player.nickname || 'another player'}!`, 'success');
                
                // Mark that we detected a hit
                hitDetected = true;
            }
        });
        
        return hitDetected;
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.isConnected = false;
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        // Remove remote players
        this.players.forEach((player, playerId) => {
            if (playerId !== this.localPlayerId) {
                this.removeRemotePlayer(playerId);
            }
        });
        
        // Remove UI elements
        if (this.chatContainer) {
            this.chatContainer.remove();
        }
    }
}