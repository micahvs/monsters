# Monster Truck Game Socket.IO Server

This is the WebSocket server for the Monster Truck multiplayer game. It handles real-time communication between players.

## Deployment to Fly.io

### Prerequisites

1. Install the Fly.io CLI:
   ```
   curl -L https://fly.io/install.sh | sh
   ```

2. Authenticate with Fly.io:
   ```
   fly auth login
   ```

### Deployment Steps

1. Navigate to the server directory:
   ```
   cd server
   ```

2. Launch the app on Fly.io:
   ```
   fly launch
   ```
   - Use the suggested app name or provide your own (it must be globally unique)
   - Choose the nearest region
   - Skip adding a Postgres database
   - Skip adding Redis
   - Don't deploy now

3. Deploy the app:
   ```
   fly deploy
   ```

4. View the app status:
   ```
   fly status
   ```

5. Check the logs:
   ```
   fly logs
   ```

### Development

To run the server locally:

```
npm install
npm run dev
```

This will start the server on http://localhost:3000.

### Configuration

The server automatically uses port 3000 by default. In production on Fly.io, it will use the PORT environment variable provided by the platform.

## Important Notes

- The client automatically connects to this server in production or to localhost in development
- Make sure to update the server URL in the client code if your Fly.io app name is different