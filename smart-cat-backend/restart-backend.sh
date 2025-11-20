#!/bin/bash

# Script to properly restart the backend with latest code

echo "🔴 Killing existing backend processes..."
lsof -ti:4000 | xargs kill -9 2>/dev/null
sleep 1

echo "🔨 Rebuilding backend..."
npm run build

if [ $? -eq 0 ]; then
  echo "✅ Build successful"
  echo "🚀 Starting backend..."
  npm run dev
else
  echo "❌ Build failed!"
  exit 1
fi
