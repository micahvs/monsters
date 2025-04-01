// WebSocket server for Monster Truck Game using Express and Socket.IO
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// Create express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Add healthcheck endpoint
app.get('/healthcheck', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Send a simple response
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        serverTime: new Date().toISOString()
    });
});

// Handle OPTIONS requests for healthcheck
app.options('/healthcheck', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
});

// Define allowed origins
const allowedOrigins = [
    'https://monsters-drab.vercel.app',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
];

// CORS middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    next();
});

// Handle OPTIONS requests
app.options('*', (req, res) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.sendStatus(200);
    } else {
        res.sendStatus(403);
    }
});

// Create Socket.IO server with CORS settings
const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization']
    },
    pingTimeout: 120000,
    pingInterval: 30000,
    connectTimeout: 20000,
    maxHttpBufferSize: 1e8,
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    allowUpgrades: true,
    upgradeTimeout: 30000
});

// Game state storage with optimized cleanup
const gameState = {
    players: {},
    turrets: {},
    projectiles: [],
    lastUpdate: Date.now(),
    cleanupThreshold: 60000 // 60 seconds
};

// Handle socket connections with mobile optimization
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Log client type for debugging
    const clientType = socket.handshake.query.clientType || 'unknown';
    console.log(`Client type: ${clientType}`);
    
    // Optimize settings for mobile clients
    if (clientType === 'mobile') {
        socket.emit('mobileOptimizations', {
            updateRate: 100,
            maxPlayers: 10,
            effectsEnabled: false
        });
    }

  // Send current game state to new player
  socket.emit('gameState', gameState);

  // Handle player joining the game
  socket.on('playerJoin', (player) => {
    console.log(`Player ${player.nickname} (${socket.id}) joined the game`);
    
    // Add player to game state
    gameState.players[socket.id] = {
      id: socket.id,
      nickname: player.nickname, 
      position: player.position || { x: 0, y: 0.5, z: 0 },
      rotation: player.rotation || { y: 0 },
      color: player.color,
      machineType: player.machineType,
      health: player.health || 100,
      maxHealth: player.maxHealth || 100,
      lastUpdate: Date.now()
    };
    
    // Broadcast new player to all other players
    socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
  });

  // Handle player position updates
  socket.on('playerUpdate', (update) => {
    if (gameState.players[socket.id]) {
      // Update player in game state
      gameState.players[socket.id] = {
        ...gameState.players[socket.id],
        ...update,
        lastUpdate: Date.now()
      };
      
      // Broadcast updated position to all other players immediately
      // Use volatile emit for position updates to reduce latency
      socket.volatile.broadcast.emit('playerMoved', {
        id: socket.id,
        ...update
      });
    }
  });

  // Handle player shooting
  socket.on('playerShoot', (data) => {
    const newProjectile = {
      id: `${socket.id}-${Date.now()}`,
      playerId: socket.id,
      position: data.position,
      direction: data.direction,
      speed: data.speed,
      damage: data.damage,
      createdAt: Date.now()
    };
    
    // Add projectile to game state
    gameState.projectiles.push(newProjectile);
    
    // Broadcast new projectile to all players including sender
    io.emit('projectileCreated', newProjectile);
    
    // Clean up old projectiles
    gameState.projectiles = gameState.projectiles.filter(p => 
      (Date.now() - p.createdAt) < 10000 // Remove projectiles older than 10 seconds
    );
  });

  // Handle player hit
  socket.on('playerHit', (data) => {
    // [Log 4.D.1] Log received playerHit data
    console.log(`[Server-PlayerHit] Received playerHit: Target=${data.playerId}, Source=${data.sourceId}, Damage=${data.damage}`);
    // console.log(`PLAYER HIT: ${data.playerId} damaged by ${data.sourceId} for ${data.damage || 50} damage`);
    
    // CRITICAL FIX: Add enhanced error handling
    if (!data.playerId) {
      console.error("Invalid playerHit - missing playerId", data);
      return;
    }
    
    if (gameState.players[data.playerId]) {
      // Use damage from client, default to 20 if not provided or invalid
      const damageAmount = typeof data.damage === 'number' && data.damage >= 0 ? data.damage : 20; 
      
      // Update player health
      const oldHealth = gameState.players[data.playerId].health;
      gameState.players[data.playerId].health -= damageAmount;
      const newHealth = gameState.players[data.playerId].health;
      // [Log 4.D.2] Log health change
      console.log(`[Server-PlayerHit] Player ${data.playerId} health: ${oldHealth} -> ${newHealth} (Damage: ${damageAmount})`);
      // console.log(`Player ${data.playerId} health reduced to ${gameState.players[data.playerId].health}`);
      
      // Check if player is dead
      if (gameState.players[data.playerId].health <= 0) {
        console.log(`Player ${data.playerId} died!`);
        
        // Broadcast player death to all players
        io.emit('playerDied', {
          id: data.playerId,
          killedBy: data.sourceId,
          timestamp: Date.now()
        });
        
        // Respawn after 5 seconds
        setTimeout(() => {
          if (gameState.players[data.playerId]) {
            gameState.players[data.playerId].health = 
              gameState.players[data.playerId].maxHealth;
            gameState.players[data.playerId].position = {
              x: (Math.random() - 0.5) * 300,
              y: 0.5,
              z: (Math.random() - 0.5) * 300
            };
            
            // Broadcast respawn to all players
            io.emit('playerRespawned', {
              id: data.playerId,
              position: gameState.players[data.playerId].position,
              health: gameState.players[data.playerId].health,
              timestamp: Date.now()
            });
          }
        }, 5000);
      } else {
        // Send playerDamaged event ONCE
        const damageEvent = {
          id: data.playerId,
          health: gameState.players[data.playerId].health,
          damage: damageAmount,
          sourceId: data.sourceId,
          timestamp: Date.now()
        };
        
        // [Log 4.D.3] Log damageEvent object before emit
        console.log('[Server-PlayerHit] Broadcasting playerDamaged:', damageEvent);
        // Broadcast damage update to all players
        io.emit('playerDamaged', damageEvent);
      }
      
      // CRITICAL FIX: Send acknowledgment back to the source player
      // This ensures the source player knows their hit was registered
      if (data.sourceId && data.sourceId !== socket.id) {
        const sourceSocket = io.sockets.sockets.get(data.sourceId);
        if (sourceSocket) {
          sourceSocket.emit('hitConfirmed', {
            targetId: data.playerId,
            damage: damageAmount,
            timestamp: Date.now()
          });
        }
      }
    } else {
      console.error(`Player with ID ${data.playerId} not found in gameState`);
    }
  });

  // Handle turret updates
  socket.on('turretUpdate', (turrets) => {
    // Only allow updates from the first connected player (host)
    const connectedSockets = Array.from(io.sockets.sockets.keys());
    if (connectedSockets[0] === socket.id) {
      gameState.turrets = turrets;
      socket.broadcast.emit('turretsUpdated', turrets);
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove player from game state
    if (gameState.players[socket.id]) {
      // Broadcast player left to all other players
      socket.broadcast.emit('playerLeft', { id: socket.id });
      
      // Remove player from game state
      delete gameState.players[socket.id];
    }
  });

  // Handle chat messages
  socket.on('chat', (chatData) => {
    console.log(`Chat message from ${socket.id} (${chatData.nickname}): ${chatData.message}`);
    
    // Validate chat data
    if (!chatData || !chatData.message || !chatData.nickname) {
      console.error('Invalid chat data received:', chatData);
      return;
    }
    
    // Add player ID and timestamp to the message
    const enhancedChatData = {
      ...chatData,
      playerId: socket.id,
      timestamp: Date.now()
    };
    
    // Broadcast to all clients (including sender)
    io.emit('chat', enhancedChatData);
  });
});

// Optimized cleanup interval
setInterval(() => {
    const now = Date.now();
    const threshold = gameState.cleanupThreshold;
    
    // Clean up inactive players
    Object.keys(gameState.players).forEach(playerId => {
        const player = gameState.players[playerId];
        if (now - player.lastUpdate > threshold) {
            io.emit('playerLeft', { id: playerId });
            delete gameState.players[playerId];
        }
    });
    
    // Clean up old projectiles
    gameState.projectiles = gameState.projectiles.filter(p => 
        (now - p.createdAt) < 10000
    );
}, 30000); // Run cleanup every 30 seconds instead of 60

// Basic route for healthcheck
app.get('/', (req, res) => {
  res.send('Monster Truck Game Server is running');
});

// Healthcheck endpoint for monitoring
app.get('/healthcheck', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    playersCount: Object.keys(gameState.players).length
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});