#!/bin/sh
set -eu
ROOT="/Users/jason/Developer/Web Publisher/noise-monitor"
DOMAIN="gui/$(id -u)"
mkdir -p "$ROOT/data" "$ROOT/logs" "$HOME/Library/LaunchAgents"
/usr/bin/swiftc "$ROOT/scripts/noise-capture.swift" -o "$ROOT/scripts/.noise-capture" -framework AVFoundation
chmod 755 "$ROOT/scripts/.noise-capture"
for NAME in server sampler; do
  LABEL="com.jason.noise-monitor.$NAME"
  SOURCE="$ROOT/launchctl/$LABEL.plist"
  TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
  cp "$SOURCE" "$TARGET"
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "$DOMAIN" "$TARGET"
  launchctl enable "$DOMAIN/$LABEL"
done
launchctl kickstart -k "$DOMAIN/com.jason.noise-monitor.server"
echo "Noise Monitor: http://localhost:17302"
