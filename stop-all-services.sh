#!/bin/bash

echo "🛑 Stopping BrandForge Bot - All Services"
echo "========================================="

echo "🔧 Stopping Telegram Bot..."
pkill -f "node dist/src/index.js" 2>/dev/null || true

echo "🔧 Stopping MongoDB..."
pkill -f "mongod" 2>/dev/null || true

echo "🔧 Stopping LocalStack..."
docker rm -f localstack 2>/dev/null || true

echo "🧹 Cleaning up ports..."
# Kill any remaining processes on our ports
for port in 27017 4566; do
    if lsof -ti:$port >/dev/null 2>&1; then
        echo "🔧 Killing processes on port $port..."
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    fi
done

echo "🗑️  Cleaning up log files..."
rm -f telegram-bot.log

echo "✅ All services stopped successfully!"
echo "" 