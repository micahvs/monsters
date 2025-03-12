// This file implements a WebSocket server using Socket.IO
// When deployed to Vercel, Socket.IO will automatically use their WebSocket infrastructure

import { Server } from 'socket.io';

// Game state storage
const gameState = {
  players: {},
  turrets: {},
  projectiles: [],
  lastUpdate: Date.now()
};

// Function to create a new WebSocket server
export default function SocketHandler(req, res) {
  // Check if socket.io server is already initialized
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  // Set up socket.io server
  const io = new Server(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Store the io instance on the server object
  res.socket.server.io = io;

  // Handle socket connections
  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

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
        
        // Broadcast updated position to all other players
        socket.broadcast.emit('playerMoved', {
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
      if (gameState.players[data.playerId]) {
        // Update player health
        gameState.players[data.playerId].health -= data.damage;
        
        // Check if player is dead
        if (gameState.players[data.playerId].health <= 0) {
          // Broadcast player death to all players
          io.emit('playerDied', {
            id: data.playerId,
            killedBy: data.sourceId
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
                health: gameState.players[data.playerId].health
              });
            }
          }, 5000);
        } else {
          // Broadcast damage to all players
          io.emit('playerDamaged', {
            id: data.playerId,
            health: gameState.players[data.playerId].health,
            damage: data.damage,
            sourceId: data.sourceId
          });
        }
      }
    });

    // Handle turret updates
    socket.on('turretUpdate', (turrets) => {
      // Only allow updates from the first connected player (host)
      const connectedSockets = Object.keys(io.sockets.sockets);
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
    socket.on('chatMessage', (message) => {
      const player = gameState.players[socket.id];
      if (player) {
        io.emit('chatMessage', {
          playerId: socket.id,
          nickname: player.nickname,
          message: message,
          timestamp: Date.now()
        });
      }
    });
  });

  // Clean up inactive players every minute
  setInterval(() => {
    const now = Date.now();
    Object.keys(gameState.players).forEach(playerId => {
      const player = gameState.players[playerId];
      // Remove player if inactive for more than 60 seconds
      if (now - player.lastUpdate > 60000) {
        io.emit('playerLeft', { id: playerId });
        delete gameState.players[playerId];
      }
    });
  }, 60000);

  console.log('Socket.io server started');
  res.end();
}