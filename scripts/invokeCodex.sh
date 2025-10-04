#!/usr/bin/env bash

# scripts/invokeCodex.sh

# Read mode from repo config (requires jq)
MODE=$(jq -r .mode codex.config.json 2>/dev/null || echo "local")
PROMPT="$*"

if [ -z "$PROMPT" ]; then
  echo "Error: no prompt/task provided."
  exit 1
fi

# Try local mode if allowed
if [ "$MODE" = "local" ] || [ "$MODE" = "auto" ]; then
  echo "Trying local CLI..."
  # Use codex exec or quoted prompt
  codex exec "$PROMPT"
  EXIT=$?
  if [ $EXIT -eq 0 ]; then
    exit 0
  fi
  echo "Local failed (exit $EXIT)."
fi

# Fallback to cloud if mode allows
if [ "$MODE" = "cloud" ] || [ "$MODE" = "auto" ]; then
  # Only attempt fallback if the cloud CLI (or command) exists
  if command -v openai >/dev/null 2>&1; then
    echo "Using cloud agent mode..."
    openai codex-agent submit --task "$PROMPT"
    EXIT2=$?
    if [ $EXIT2 -eq 0 ]; then
      exit 0
    else
      echo "Cloud fallback failed (exit $EXIT2)."
      exit $EXIT2
    fi
  else
    echo "Cloud fallback tool not found. Cannot delegate to cloud."
    exit 2
  fi
fi

echo "No mode succeeded."
exit 3