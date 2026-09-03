#!/bin/sh
set -eu

ROOT="/Users/jason/Developer/Web Publisher/noise-monitor"
DOMAIN="gui/$(id -u)"
LABEL="com.jason.noise-monitor.server"
SOURCE="$ROOT/launchctl/$LABEL.plist"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$ROOT/data" "$ROOT/logs" "$HOME/Library/LaunchAgents"
cp "$SOURCE" "$TARGET"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl enable "$DOMAIN/$LABEL"
launchctl bootstrap "$DOMAIN" "$TARGET"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "Noise Monitor web service: http://localhost:17302"
echo "Hourly microphone sampling remains disabled."
