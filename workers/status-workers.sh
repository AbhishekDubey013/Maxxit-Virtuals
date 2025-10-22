#!/bin/bash

# Worker Status Script
# Checks status of all workers
# Usage: bash workers/status-workers.sh

set -e

WORKERS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$WORKERS_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"

echo "📊 Maxxit Workers Status"
echo "========================"
echo ""

# Function to check worker status
check_worker() {
  WORKER_NAME=$1
  PID_FILE="$LOG_DIR/$WORKER_NAME.pid"
  
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
      echo "✅ $WORKER_NAME: RUNNING (PID: $PID)"
      
      # Show last run from log
      if [ -f "$LOG_DIR/$WORKER_NAME.log" ]; then
        LAST_LINE=$(tail -n 1 "$LOG_DIR/$WORKER_NAME.log")
        echo "   Last activity: $LAST_LINE"
      fi
    else
      echo "❌ $WORKER_NAME: STOPPED (PID $PID not found)"
    fi
  else
    echo "⚠️  $WORKER_NAME: NOT STARTED"
  fi
  echo ""
}

# Check all workers
check_worker "tweet-ingestion"
check_worker "signal-generator"
check_worker "trade-executor"
check_worker "position-monitor"

echo "========================"
echo ""
echo "Commands:"
echo "  Start workers:  bash workers/start-workers.sh"
echo "  Stop workers:   bash workers/stop-workers.sh"
echo "  View logs:      tail -f $LOG_DIR/*.log"

