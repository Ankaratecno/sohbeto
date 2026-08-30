#!/usr/bin/env bash
# Capacitor "npx cap add android" ile üretilen Android projesine
# tam ekran gelen arama (USE_FULL_SCREEN_INTENT), pil optimizasyonu muafiyeti,
# özel zil/mesaj sesleri ve native eklentileri ekler.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/android/app/src/main/AndroidManifest.xml"
PKG_DIR="$ROOT/android/app/src/main/java/app/sohbeto/mobile"
RAW_DIR="$ROOT/android/app/src/main/res/raw"

if [ ! -f "$MANIFEST" ]; then
  echo "AndroidManifest.xml bulunamadı: $MANIFEST" >&2
  exit 1
fi

add_perm() {
  local perm="$1"
  if ! grep -q "$perm" "$MANIFEST"; then
    sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$perm\" />\n</manifest>#" "$MANIFEST"
    echo "eklendi: $perm"
  fi
}

add_perm USE_FULL_SCREEN_INTENT
add_perm POST_NOTIFICATIONS
add_perm REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
add_perm WAKE_LOCK
add_perm VIBRATE
add_perm FOREGROUND_SERVICE
add_perm RECEIVE_BOOT_COMPLETED
add_perm SCHEDULE_EXACT_ALARM
add_perm DISABLE_KEYGUARD
add_perm INTERNET
add_perm RECORD_AUDIO
add_perm CAMERA
add_perm MODIFY_AUDIO_SETTINGS
add_perm BLUETOOTH_CONNECT
add_perm ACCESS_NETWORK_STATE

# MainActivity kilit ekranı üzerinde açılabilsin (Android 8.1+ manifest bayrakları)
if ! grep -q "android:showWhenLocked" "$MANIFEST"; then
  sed -i 's#<activity#<activity android:showWhenLocked="true" android:turnScreenOn="true"#' "$MANIFEST"
  echo "eklendi: showWhenLocked/turnScreenOn"
fi

mkdir -p "$PKG_DIR"
cp "$ROOT/android-patch/BatteryOptimizationPlugin.java" "$PKG_DIR/BatteryOptimizationPlugin.java"
cp "$ROOT/android-patch/CallNotificationPlugin.java" "$PKG_DIR/CallNotificationPlugin.java"
cp "$ROOT/android-patch/MainActivity.java" "$PKG_DIR/MainActivity.java"

# Özel sesler: android-patch/sounds/ringtone.mp3 ve message.mp3 varsa res/raw'a kopyalanır.
mkdir -p "$RAW_DIR"
for f in ringtone message; do
  for ext in mp3 ogg wav; do
    if [ -f "$ROOT/android-patch/sounds/$f.$ext" ]; then
      cp "$ROOT/android-patch/sounds/$f.$ext" "$RAW_DIR/$f.$ext"
      echo "ses eklendi: $f.$ext"
      break
    fi
  done
done

echo "Android yaması tamam."
grep -c "uses-permission" "$MANIFEST"
