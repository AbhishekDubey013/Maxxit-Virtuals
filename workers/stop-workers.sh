#!/bin/bash

# Stop Worker Script
# Stops all running workers
# Usage: bash workers/stop-workers.sh

set -e

WORKERS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$WORKERS_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"

echo "🛑 Stopping Maxxit Workers..."

# Function to stop worker
stop_worker() {
  WORKER_NAME=$1
  PID_FILE="$LOG_DIR/$WORKER_NAME.pid"
  
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "Stopping $WORKER_NAME (PID: $PID)..."
      kill "$PID" 2>/dev/null || echo "Failed to kill $PID"
      sleep 1
      
      # Force kill if still running
      if ps -p "$PID" > /dev/null 2>&1; then
        echo "Force stopping $WORKER_NAME..."
        kill -9 "$PID" 2>/dev/null || true
      fi
      
      echo "✅ $WORKER_NAME stopped"
    else
      echo "⚠️  $WORKER_NAME not running (PID $PID not found)"
    fi
    rm -f "$PID_FILE"
  else
    echo "⚠️  No PID file for $WORKER_NAME"
  fi
}

# Stop all workers
stop_worker "tweet-ingestion"
stop_worker "signal-generator"
stop_worker "trade-executor"
stop_worker "position-monitor"

echo ""
echo "🎉 All workers stopped!"

