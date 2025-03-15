import * as THREE from 'three';
import { MonsterTruck } from './MonsterTruck.js';

export default class Multiplayer {
    constructor(game) {
        this.game = game;
        this.isConnected = false;
        this.socket = null;
        this.players = new Map();
        this.localPlayerId = null;
        this.updateInterval = null;
        this.lastUpdateTime = 0;
        this.pendingProjectiles = [];
        this.chatMessages = [];
        this.isChatVisible = false;
        this.updateRate = 50; // ms between updates
        this.radarBlips = new Map(); // Store radar blips for each player
        this.radarRange = 200; // Radar range in game units
        
        // Initialize chat UI
        this.initChatUI();
        
        // Initialize radar UI
        this.initRadarUI();
        
        // Bind methods
        this.setupSocketEvents = this.setupSocketEvents.bind(this);
        this.updatePlayerPositions = this.updatePlayerPositions.bind(this);
        this.sendLocalPlayerUpdate = this.sendLocalPlayerUpdate.bind(this);
        this.disconnect = this.disconnect.bind(this);
        
        this.connect();
    }
    
    connect() {
        try {
            // Initialize socket without Promise
            this.socket = io('https://monster-truck-game-server.fly.dev', {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                timeout: 10000,
                reconnection: true,
                reconnectionAttempts: 5
            });

            // Set up event handlers
            this.socket.on('connect', () => {
                console.log('Connected to game server');
                this.isConnected = true;
                this.localPlayerId = this.socket.id;
                this.sendPlayerInfo();
            });

            this.socket.on('connect_error', (error) => {
                console.log('Connection error:', error);
                console.log('Connection error details:', error);
                if (this.game && this.game.showMessage) {
                    this.game.showMessage('Multiplayer connection failed - playing in single player mode');
                }
            });

            this.socket.on('player_joined', (data) => {
                this.handlePlayerJoined(data);
            });

            this.socket.on('player_left', (data) => {
                this.handlePlayerLeft(data);
            });

            this.socket.on('player_update', (data) => {
                this.handlePlayerUpdate(data);
            });
        } catch (error) {
            console.log('Socket initialization error:', error);
            if (this.game && this.game.showMessage) {
                this.game.showMessage('Multiplayer initialization failed - playing in single player mode');
            }
        }
    }
    
    setupSocketEvents() {
        if (!this.socket) return;
        
        // When connected to the server
        this.socket.on('connect', () => {
            console.log('Connected to multiplayer server');
            this.isConnected = true;
            this.localPlayerId = this.socket.id;
            
            // Send initial player data
            this.sendPlayerJoin();
            
            // Show connected message
            this.showNotification(`Connected to multiplayer server`);
        });
        
        // When disconnected from the server
        this.socket.on('disconnect', () => {
            console.log('Disconnected from multiplayer server');
            this.isConnected = false;
            this.showNotification('Disconnected from server', 'error');
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
            this.removeRemotePlayer(playerData.id);
            
            if (this.players.get(playerData.id)) {
                this.showNotification(`${this.players.get(playerData.id).nickname} left the arena`);
            }
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
            // If it's the local player
            if (damageData.id === this.localPlayerId) {
                // Only apply damage if it came from someone else
                if (damageData.sourceId !== this.localPlayerId) {
                    this.game.health = damageData.health;
                    this.game.monsterTruck.health = damageData.health;
                    
                    // Visual feedback
                    this.game.addDamageScreenEffect(damageData.damage);
                }
            } else {
                // Show damage effect on remote player
                if (this.players.get(damageData.id) && this.players.get(damageData.id).truckMesh) {
                    this.showDamageEffect(this.players.get(damageData.id).truckMesh.position);
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
            this.receiveChatMessage(chatData);
        });
    }
    
    startUpdates() {
        // Start sending regular position updates
        this.updateInterval = setInterval(() => {
            if (this.isConnected && this.game.truck) {
                this.sendLocalPlayerUpdate();
            }
        }, this.updateRate);
        
        // Add keydown event listener for chat
        window.addEventListener('keydown', (e) => {
            if (e.key === 'c' || e.key === 'C') {
                this.toggleChat();
            }
        });
    }
    
    sendPlayerInfo() {
        if (!this.socket || !this.game.truck) return;
        
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
        
        // Only send updates if enough time has passed or there's significant change
        if (now - this.lastUpdateTime > this.updateRate) {
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
                velocity: this.game.truck.velocity,
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
        if (!message || !this.socket) return;
        
        // Send message to server
        this.socket.emit('chat', {
            message: message,
            nickname: this.game.playerName || 'Player'
        });
    }
    
    // REMOTE PLAYER MANAGEMENT
    
    addRemotePlayer(playerData) {
        if (!this.game.scene) return;
        
        // Skip if it's the local player or player already exists
        if (playerData.id === this.localPlayerId || this.players.has(playerData.id)) {
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
        if (!this.players.has(playerId) || !this.game.scene) return;
        
        const player = this.players.get(playerId);
        
        // Remove truck from scene
        if (player.monsterTruck) {
            player.monsterTruck.dispose();
        }
        
        // Remove nickname display
        if (player.nicknameDisplay) {
            this.game.scene.remove(player.nicknameDisplay);
        }
        
        // Remove from players list
        this.players.delete(playerId);
    }
    
    updatePlayerPositions() {
        if (!this.game.scene) return;
        
        const now = Date.now();
        
        // Update each remote player's position with interpolation
        this.players.forEach((player, playerId) => {
            if (!player.truckMesh || playerId === this.localPlayerId) return;
            
            // Calculate how far we are between updates (0-1)
            const timeSinceUpdate = now - player.lastUpdateTime;
            const interpolationFactor = Math.min(1.0, timeSinceUpdate / this.updateRate);
            
            // Interpolate position
            player.truckMesh.position.lerpVectors(
                player.lastPosition,
                player.targetPosition,
                interpolationFactor
            );
            
            // Interpolate rotation
            player.truckMesh.rotation.y = player.lastRotation.y + 
                (player.targetRotation.y - player.lastRotation.y) * interpolationFactor;
            
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
            const projectileGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);
            projectileGeometry.rotateX(Math.PI / 2); // Rotate to point forward
            
            const playerColor = this.players.get(projectileData.playerId)?.color || '#ff0000';
            const color = new THREE.Color(playerColor);
            
            const projectileMaterial = new THREE.MeshPhongMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 1,
                shininess: 30
            });
            
            const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
            projectile.position.copy(position);
            
            // Set rotation to match direction
            projectile.lookAt(position.clone().add(direction));
            
            // Add to scene
            this.game.scene.add(projectile);
            
            // Add light to projectile
            const projectileLight = new THREE.PointLight(color, 0.7, 3);
            projectile.add(projectileLight);
            
            // Add to game's projectiles array
            this.game.projectiles.push({
                mesh: projectile,
                direction: direction,
                speed: projectileData.speed || 2.0,
                damage: projectileData.damage || 20,
                lifetime: 90,
                source: 'remote',
                playerId: projectileData.playerId
            });
            
            // Create muzzle flash effect
            if (this.game.createMuzzleFlash) {
                this.game.createMuzzleFlash(position, direction);
            }
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
        if (!this.chatMessages) return;
        
        // Add message to chat history
        this.chatMessages.push(chatData);
        
        // If we have the global chat function from game.html, use it
        if (window.addChatMessage && typeof window.addChatMessage === 'function') {
            const sender = chatData.playerId === this.localPlayerId ? 'You' : chatData.nickname;
            window.addChatMessage(sender, chatData.message);
            return;
        }
        
        // Otherwise use our own chat UI
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
        if (!this.game.scene) return;
        
        // Create a burst of red particles at the damage point
        const particleCount = 10;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            // Create particle
            const size = Math.random() * 0.2 + 0.1;
            const particleGeometry = new THREE.SphereGeometry(size, 8, 8);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0.8
            });
            
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            
            // Position at hit point, slightly offset
            particle.position.set(
                position.x + (Math.random() - 0.5) * 2,
                position.y + Math.random() * 2,
                position.z + (Math.random() - 0.5) * 2
            );
            
            // Random velocity
            const velocity = {
                x: (Math.random() - 0.5) * 0.2,
                y: Math.random() * 0.2 + 0.1,
                z: (Math.random() - 0.5) * 0.2
            };
            
            particle.userData = {
                velocity: velocity,
                life: 1.0
            };
            
            this.game.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate and remove particles
        const animateParticles = () => {
            let allDead = true;
            
            for (let i = 0; i < particles.length; i++) {
                const particle = particles[i];
                
                if (particle.userData.life > 0) {
                    // Update position
                    particle.position.x += particle.userData.velocity.x;
                    particle.position.y += particle.userData.velocity.y;
                    particle.position.z += particle.userData.velocity.z;
                    
                    // Apply gravity
                    particle.userData.velocity.y -= 0.01;
                    
                    // Reduce life
                    particle.userData.life -= 0.05;
                    particle.material.opacity = particle.userData.life;
                    
                    allDead = false;
                } else if (particle.parent) {
                    // Remove dead particles
                    this.game.scene.remove(particle);
                }
            }
            
            if (!allDead) {
                requestAnimationFrame(animateParticles);
            }
        };
        
        animateParticles();
    }
    
    showExplosion(position) {
        if (!this.game.scene) return;
        
        // Delegate to game's explosion effect if available
        if (this.game.createExplosion) {
            this.game.createExplosion(position);
        } else {
            // Create a larger explosion effect
            const explosionLight = new THREE.PointLight(0xff5500, 3, 20);
            explosionLight.position.copy(position);
            explosionLight.position.y += 2;
            this.game.scene.add(explosionLight);
            
            // Create explosion particles
            const particleCount = 30;
            const particles = [];
            
            for (let i = 0; i < particleCount; i++) {
                const size = Math.random() * 0.5 + 0.2;
                const particleGeometry = new THREE.SphereGeometry(size, 8, 8);
                const particleMaterial = new THREE.MeshBasicMaterial({
                    color: i % 2 === 0 ? 0xff5500 : 0xffff00,
                    transparent: true,
                    opacity: 1
                });
                
                const particle = new THREE.Mesh(particleGeometry, particleMaterial);
                particle.position.copy(position);
                particle.position.y += 2;
                
                // Random velocity
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 0.3 + 0.1;
                particle.userData = {
                    velocity: {
                        x: Math.cos(angle) * speed,
                        y: Math.random() * 0.3 + 0.2,
                        z: Math.sin(angle) * speed
                    },
                    life: 1.0
                };
                
                this.game.scene.add(particle);
                particles.push(particle);
            }
            
            // Animate explosion
            let explosionLife = 60;
            const animateExplosion = () => {
                explosionLife--;
                
                if (explosionLife > 0) {
                    // Update light
                    explosionLight.intensity = explosionLife / 20;
                    
                    // Update particles
                    for (const particle of particles) {
                        particle.position.x += particle.userData.velocity.x;
                        particle.position.y += particle.userData.velocity.y;
                        particle.position.z += particle.userData.velocity.z;
                        
                        // Apply gravity
                        particle.userData.velocity.y -= 0.01;
                        
                        // Fade out
                        particle.material.opacity = explosionLife / 60;
                    }
                    
                    requestAnimationFrame(animateExplosion);
                } else {
                    // Remove light and particles
                    this.game.scene.remove(explosionLight);
                    for (const particle of particles) {
                        this.game.scene.remove(particle);
                    }
                }
            };
            
            animateExplosion();
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
        this.updatePlayerPositions();
        this.updateRadar();
    }
    
    checkProjectileHits(projectile) {
        if (!projectile || !projectile.mesh || !this.isConnected) return false;
        
        // Check if projectile hits any remote player
        for (const playerId in this.players) {
            // Skip the local player and the player who fired the projectile
            if (playerId === this.localPlayerId || 
                (projectile.playerId && playerId === projectile.playerId)) {
                continue;
            }
            
            const player = this.players.get(playerId);
            if (!player.truckMesh) continue;
            
            // Get vehicle dimensions
            const truckDimensions = {
                width: 3,
                length: 5,
                height: 2
            };
            
            // Get bounding box for truck
            const truckBounds = {
                minX: player.truckMesh.position.x - (truckDimensions.width / 2) - 0.5,
                maxX: player.truckMesh.position.x + (truckDimensions.width / 2) + 0.5,
                minY: player.truckMesh.position.y - 0.2,
                maxY: player.truckMesh.position.y + truckDimensions.height + 0.5,
                minZ: player.truckMesh.position.z - (truckDimensions.length / 2) - 0.5,
                maxZ: player.truckMesh.position.z + (truckDimensions.length / 2) + 0.5
            };
            
            // Check if projectile is inside bounding box
            const pos = projectile.mesh.position;
            if (
                pos.x >= truckBounds.minX && 
                pos.x <= truckBounds.maxX &&
                pos.z >= truckBounds.minZ && 
                pos.z <= truckBounds.maxZ &&
                pos.y >= truckBounds.minY &&
                pos.y <= truckBounds.maxY
            ) {
                // Impact point for visuals
                const impactPoint = new THREE.Vector3(pos.x, pos.y, pos.z);
                
                // Send hit to server
                this.sendPlayerHit(playerId, projectile.damage, this.localPlayerId);
                
                // Show impact effect
                this.showDamageEffect(impactPoint);
                
                return true;
            }
        }
        
        return false;
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
        
        // Clean up radar blips
        this.radarBlips.forEach(blip => blip.remove());
        this.radarBlips.clear();
    }
    
    // Initialize radar UI
    initRadarUI() {
        this.radarContainer = document.getElementById('radar-container');
        this.radar = document.getElementById('radar');
        this.radarPlayer = document.getElementById('radar-player');
        
        if (!this.radarContainer || !this.radar || !this.radarPlayer) {
            console.error('Radar UI elements not found');
            return;
        }
        
        // Set radar styles
        this.radar.style.position = 'relative';
        this.radar.style.borderRadius = '50%';
        this.radar.style.border = '2px solid rgba(255, 0, 255, 0.5)';
        
        // Add radar grid lines
        const gridLine1 = document.createElement('div');
        gridLine1.style.cssText = `
            position: absolute;
            top: 50%;
            left: 0;
            width: 100%;
            height: 1px;
            background: rgba(255, 0, 255, 0.3);
            transform: translateY(-50%);
        `;
        
        const gridLine2 = document.createElement('div');
        gridLine2.style.cssText = `
            position: absolute;
            top: 0;
            left: 50%;
            width: 1px;
            height: 100%;
            background: rgba(255, 0, 255, 0.3);
            transform: translateX(-50%);
        `;
        
        const gridCircle = document.createElement('div');
        gridCircle.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 50%;
            height: 50%;
            border-radius: 50%;
            border: 1px solid rgba(255, 0, 255, 0.3);
            transform: translate(-50%, -50%);
        `;
        
        this.radar.appendChild(gridLine1);
        this.radar.appendChild(gridLine2);
        this.radar.appendChild(gridCircle);
    }
    
    // Update radar with player positions
    updateRadar() {
        if (!this.radar || !this.game.truck) return;
        
        const localPlayerPos = this.game.truck.position;
        const localPlayerRotation = this.game.truck.rotation.y;
        
        // Update each remote player on radar
        this.players.forEach((player, playerId) => {
            if (playerId === this.localPlayerId) return;
            
            // Get or create blip for this player
            let blip = this.radarBlips.get(playerId);
            if (!blip) {
                blip = document.createElement('div');
                blip.className = 'radar-blip';
                blip.style.cssText = `
                    position: absolute;
                    width: 6px;
                    height: 6px;
                    background-color: ${player.color || '#00ffff'};
                    border-radius: 50%;
                    box-shadow: 0 0 5px ${player.color || '#00ffff'};
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                    z-index: 2;
                `;
                this.radar.appendChild(blip);
                this.radarBlips.set(playerId, blip);
            }
            
            // Calculate relative position (accounting for player rotation)
            const dx = player.truckMesh.position.x - localPlayerPos.x;
            const dz = player.truckMesh.position.z - localPlayerPos.z;
            
            // Rotate coordinates based on player's facing direction
            const rotatedX = dx * Math.cos(-localPlayerRotation) - dz * Math.sin(-localPlayerRotation);
            const rotatedZ = dx * Math.sin(-localPlayerRotation) + dz * Math.cos(-localPlayerRotation);
            
            // Scale to radar size
            const radarRadius = this.radar.clientWidth / 2;
            const radarX = (rotatedX / this.radarRange) * radarRadius;
            const radarZ = (rotatedZ / this.radarRange) * radarRadius;
            
            // Calculate distance for scaling blip size (closer = larger)
            const distance = Math.sqrt(dx * dx + dz * dz);
            const isInRange = distance <= this.radarRange;
            
            // Position blip on radar (center is 50%, 50%)
            if (isInRange) {
                blip.style.display = 'block';
                blip.style.left = `${50 + radarX / radarRadius * 100}%`;
                blip.style.top = `${50 + radarZ / radarRadius * 100}%`;
                
                // Scale blip size based on distance (closer = larger)
                const scaleFactor = Math.max(0.6, 1 - (distance / this.radarRange));
                blip.style.transform = `translate(-50%, -50%) scale(${scaleFactor})`;
                
                // Add player name tooltip
                blip.title = player.nickname;
            } else {
                // If player is out of radar range, position at edge of radar in correct direction
                const angle = Math.atan2(rotatedZ, rotatedX);
                const edgeX = Math.cos(angle) * radarRadius;
                const edgeZ = Math.sin(angle) * radarRadius;
                
                blip.style.display = 'block';
                blip.style.left = `${50 + edgeX / radarRadius * 100}%`;
                blip.style.top = `${50 + edgeZ / radarRadius * 100}%`;
                blip.style.transform = 'translate(-50%, -50%) scale(0.6)';
                
                // Add distance to tooltip
                blip.title = `${player.nickname} (${Math.round(distance)}m)`;
            }
        });
        
        // Remove blips for players who have left
        this.radarBlips.forEach((blip, playerId) => {
            if (!this.players.has(playerId)) {
                blip.remove();
                this.radarBlips.delete(playerId);
            }
        });
    }
}