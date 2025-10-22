#!/bin/bash

# Worker Scheduler Script
# Starts background workers that run on schedule
# Usage: bash workers/start-workers.sh

set -e

WORKERS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$WORKERS_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"

mkdir -p "$LOG_DIR"

echo "🚀 Starting Maxxit Workers..."
echo "Project Root: $PROJECT_ROOT"
echo "Logs: $LOG_DIR"

cd "$PROJECT_ROOT"

# Load environment variables from .env
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
  echo "✅ Loaded environment variables from .env"
  if [ -n "$GAME_API_KEY" ]; then
    echo "   GAME_API_KEY: ${GAME_API_KEY:0:10}..."
  else
    echo "   ⚠️ GAME_API_KEY not found!"
  fi
else
  echo "⚠️  No .env file found"
fi
echo ""

# Function to run worker in loop
run_worker_loop() {
  WORKER_NAME=$1
  WORKER_FILE=$2
  INTERVAL_SECONDS=$3
  
  while true; do
    echo "[$(date)] Running $WORKER_NAME..." | tee -a "$LOG_DIR/$WORKER_NAME.log"
    npx tsx "$WORKER_FILE" >> "$LOG_DIR/$WORKER_NAME.log" 2>&1 || echo "[ERROR] $WORKER_NAME failed" | tee -a "$LOG_DIR/$WORKER_NAME.log"
    echo "[$(date)] $WORKER_NAME complete. Sleeping for $INTERVAL_SECONDS seconds..." | tee -a "$LOG_DIR/$WORKER_NAME.log"
    sleep "$INTERVAL_SECONDS"
  done
}

# Start Tweet Ingestion Worker (every 5 minutes = 300 seconds) - TESTING MODE
run_worker_loop "tweet-ingestion" "$WORKERS_DIR/tweet-ingestion-worker.ts" 300 &
INGEST_PID=$!
echo "✅ Tweet Ingestion started (PID: $INGEST_PID, runs every 5 minutes) ⚡ TESTING MODE"

# Start Signal Generation Worker (every 5 minutes = 300 seconds) - TESTING MODE
run_worker_loop "signal-generator" "$WORKERS_DIR/signal-generator.ts" 300 &
SIGNAL_PID=$!
echo "✅ Signal Generator started (PID: $SIGNAL_PID, runs every 5 minutes) ⚡ TESTING MODE"

# Start Trade Execution Worker (every 5 minutes = 300 seconds - sync with signal generation)
run_worker_loop "trade-executor" "$WORKERS_DIR/trade-executor-worker.ts" 300 &
TRADE_PID=$!
echo "✅ Trade Executor started (PID: $TRADE_PID, runs every 5 minutes) ⚡ REAL-TIME MODE"

# Start Position Monitor Worker (every 5 minutes = 300 seconds)
run_worker_loop "position-monitor" "$WORKERS_DIR/position-monitor-v2.ts" 300 &
POSITION_PID=$!
echo "✅ Position Monitor started (PID: $POSITION_PID, runs every 5 minutes)"

# Save PIDs to file for stopping later
echo "$INGEST_PID" > "$LOG_DIR/tweet-ingestion.pid"
echo "$SIGNAL_PID" > "$LOG_DIR/signal-generator.pid"
echo "$TRADE_PID" > "$LOG_DIR/trade-executor.pid"
echo "$POSITION_PID" > "$LOG_DIR/position-monitor.pid"

echo ""
echo "🎉 All workers started successfully!"
echo ""
echo "PIDs saved to $LOG_DIR/*.pid"
echo "Logs available at $LOG_DIR/*.log"
echo ""
echo "To stop workers: bash workers/stop-workers.sh"
echo "To view logs: tail -f $LOG_DIR/*.log"
echo ""

# Keep script running (workers are in background)
wait

