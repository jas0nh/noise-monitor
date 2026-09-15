#!/bin/sh
set -eu
ROOT="/Users/jason/Developer/Web Publisher/noise-monitor"
DOMAIN="gui/$(id -u)"
mkdir -p "$ROOT/data" "$ROOT/logs" "$HOME/Library/LaunchAgents"
APP="$ROOT/build/NoiseCapture.app"
mkdir -p "$APP/Contents/MacOS"
cp "$ROOT/app/NoiseCapture/Info.plist" "$APP/Contents/Info.plist"
/usr/bin/swiftc "$ROOT/scripts/noise-capture.swift" -o "$APP/Contents/MacOS/NoiseCapture" -framework AVFoundation
chmod 755 "$APP/Contents/MacOS/NoiseCapture"
/usr/bin/codesign --force --sign - "$APP" >/dev/null
for NAME in server sampler; do
  LABEL="com.jason.noise-monitor.$NAME"
  SOURCE="$ROOT/launchctl/$LABEL.plist"
  TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
  cp "$SOURCE" "$TARGET"
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  launchctl enable "$DOMAIN/$LABEL"
  sleep 1
  launchctl bootstrap "$DOMAIN" "$TARGET"
done
launchctl kickstart -k "$DOMAIN/com.jason.noise-monitor.server"
launchctl kickstart -k "$DOMAIN/com.jason.noise-monitor.sampler"
echo "Noise Monitor: http://localhost:17302"
