#!/bin/bash

# Script to deploy the Monster Truck Game server to fly.dev

echo "Monster Truck Game Server Deployment"
echo "===================================="

# Change to server directory if running from project root
if [ -d "server" ]; then
  cd server
fi

# Check if fly CLI is installed
if ! command -v flyctl &> /dev/null; then
  echo "Error: fly CLI is not installed."
  echo "Please install it using the instructions at: https://fly.io/docs/hands-on/install-flyctl/"
  exit 1
fi

# Check if user is authenticated
if ! flyctl auth whoami &> /dev/null; then
  echo "You need to log in to fly.io first."
  flyctl auth login
fi

echo "Deploying server to fly.dev..."

# Deploy to fly.io
flyctl deploy

if [ $? -eq 0 ]; then
  echo "✅ Deployment successful!"
  echo "Server is now running at: https://monster-truck-stadium.fly.dev"
  echo "You can check the status with: flyctl status"
  echo "And view logs with: flyctl logs"
else
  echo "❌ Deployment failed. Check the error messages above."
fi 