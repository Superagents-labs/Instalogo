#!/bin/bash

echo "🚀 Starting BrandForge Bot - All Services"
echo "========================================"

# Load environment variables from development.env
if [ -f "development.env" ]; then
    echo "📋 Loading environment variables from development.env..."
    export $(cat development.env | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded"
else
    echo "❌ development.env file not found!"
    exit 1
fi

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -ti:$port >/dev/null 2>&1; then
        echo "⚠️  Port $port is already in use"
        return 0
    else
        return 1
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    echo "🔧 Killing processes on port $port..."
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
    sleep 2
}

echo ""
echo "🧹 Cleaning up existing processes..."

# Kill existing processes
echo "🔧 Stopping existing services..."
pkill -f "mongod" 2>/dev/null || true
pkill -f "node dist/src/index.js" 2>/dev/null || true

# Kill processes on specific ports
kill_port 27017 # MongoDB (if needed)

echo "✅ Cleanup complete"
echo ""

echo "🗄️  Starting MongoDB..."
# Create data directory if it doesn't exist
mkdir -p ~/data/db

# Start MongoDB in background
mongod --dbpath ~/data/db --fork --logpath ~/data/db/mongod.log 2>/dev/null || {
    echo "⚠️  MongoDB may already be running or failed to start"
}

# Wait for MongoDB to be ready
echo "⏳ Waiting for MongoDB to be ready..."
for i in {1..15}; do
    # Try multiple ways to check MongoDB
    if mongosh --eval "db.stats()" >/dev/null 2>&1; then
        echo "✅ MongoDB is ready (via mongosh)"
        break
    elif nc -z localhost 27017 2>/dev/null; then
        echo "✅ MongoDB is ready (port accessible)"
        break
    elif curl -s http://localhost:27017 >/dev/null 2>&1; then
        echo "✅ MongoDB is ready (HTTP check)"
        break
    fi
    
    sleep 3
    if [ $i -eq 15 ]; then
        echo "⚠️  MongoDB may not be fully ready, but continuing..."
        echo "📄 Checking MongoDB process..."
        ps aux | grep mongod | grep -v grep || echo "No mongod process found"
        break
    fi
done

echo ""
echo "🐳 Starting LocalStack (S3)..."
# Check if LocalStack container exists and remove it
docker rm -f localstack 2>/dev/null || true

# Start LocalStack
docker run -d --name localstack -p 4566:4566 -e SERVICES=s3 localstack/localstack

# Wait for LocalStack to be ready
echo "⏳ Waiting for LocalStack to be ready..."
for i in {1..15}; do
    if curl -s http://localhost:4566/health >/dev/null 2>&1; then
        echo "✅ LocalStack is ready"
        break
    fi
    sleep 2
    if [ $i -eq 15 ]; then
        echo "❌ LocalStack failed to start"
        exit 1
    fi
done

echo ""
echo "🤖 Starting Telegram Bot..."

# Build the bot if needed
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo "🔨 Building TypeScript project..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ Build failed"
        exit 1
    fi
fi

# Start the Telegram bot
echo "🚀 Launching Telegram bot..."
nohup node dist/src/index.js > telegram-bot.log 2>&1 &
BOT_PID=$!

echo "🔄 Telegram bot started with PID: $BOT_PID"

# Wait a moment for the bot to initialize
sleep 5

# Check if bot is running
if ps -p $BOT_PID > /dev/null; then
    echo "✅ Telegram bot is running successfully"
else
    echo "❌ Telegram bot failed to start"
    echo "📄 Bot logs:"
    tail -10 telegram-bot.log
    exit 1
fi

echo ""
echo "🎉 All services started successfully!"
echo "========================================"
echo "🗄️  MongoDB: Running on port 27017"
echo "🐳 LocalStack: Running on port 4566"
echo "🤖 Telegram Bot: Running (PID: $BOT_PID)"
echo ""
echo "📊 Service Status:"
echo "• MongoDB: $(nc -z localhost 27017 2>/dev/null && echo 'Connected' || echo 'Not responding')"
echo "• LocalStack: $(curl -s http://localhost:4566/health 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo 'Not responding')"
echo "• Telegram Bot: $(ps -p $BOT_PID > /dev/null && echo 'Running' || echo 'Not running')"
echo ""
echo "📝 Logs:"
echo "• Telegram Bot: tail -f telegram-bot.log"
echo ""
echo "🛑 To stop all services: ./stop-all-services.sh"
echo ""

# Wait for user input to keep script running
echo "Press Ctrl+C to stop all services..."
trap 'echo "🛑 Stopping all services..."; kill $BOT_PID 2>/dev/null; pkill -f "mongod"; docker rm -f localstack; exit 0' INT

# Keep script running
wait 