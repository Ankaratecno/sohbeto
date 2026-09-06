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
cp "$ROOT/android-patch/SohbetoNotifier.java" "$PKG_DIR/SohbetoNotifier.java"
cp "$ROOT/android-patch/FcmPlugin.java" "$PKG_DIR/FcmPlugin.java"
cp "$ROOT/android-patch/SohbetoMessagingService.java" "$PKG_DIR/SohbetoMessagingService.java"

# ---------------------------------------------------------------- FCM (Firebase)
# google-services.json: android-patch/google-services.json (yerel) ya da
# GitHub Secret GOOGLE_SERVICES_JSON (workflow yazar). Dosya yoksa FCM adımı
# atlanır; uygulama eski yoklama akışıyla çalışmaya devam eder.
APP_GRADLE="$ROOT/android/app/build.gradle"
ROOT_GRADLE="$ROOT/android/build.gradle"
GS_SRC="$ROOT/android-patch/google-services.json"
GS_DST="$ROOT/android/app/google-services.json"
if [ -f "$GS_SRC" ]; then cp "$GS_SRC" "$GS_DST"; fi

if [ -f "$GS_DST" ]; then
  # Firebase bağımlılıkları (uygulama modülü)
  if ! grep -q "firebase-messaging" "$APP_GRADLE"; then
    sed -i "s#^dependencies {#dependencies {\n    implementation platform('com.google.firebase:firebase-bom:33.7.0')\n    implementation 'com.google.firebase:firebase-messaging'#" "$APP_GRADLE"
    echo "eklendi: firebase-messaging"
  fi
  # Google Services eklentisi
  if ! grep -q "com.google.gms.google-services" "$ROOT_GRADLE"; then
    sed -i "s#classpath 'com.android.tools.build:gradle#classpath 'com.google.gms:google-services:4.4.2'\n        classpath 'com.android.tools.build:gradle#" "$ROOT_GRADLE"
    echo "eklendi: google-services classpath"
  fi
  if ! grep -q "com.google.gms.google-services" "$APP_GRADLE"; then
    echo "apply plugin: 'com.google.gms.google-services'" >> "$APP_GRADLE"
    echo "eklendi: google-services plugin"
  fi
  # FCM servisi manifeste
  if ! grep -q "SohbetoMessagingService" "$MANIFEST"; then
    sed -i "s#</application>#    <service android:name=\".SohbetoMessagingService\" android:exported=\"false\">\n        <intent-filter>\n            <action android:name=\"com.google.firebase.MESSAGING_EVENT\" />\n        </intent-filter>\n    </service>\n</application>#" "$MANIFEST"
    echo "eklendi: SohbetoMessagingService"
  fi
  echo "FCM: etkin (google-services.json bulundu)"
else
  # Firebase sınıfları derlenebilsin diye bağımlılık yine eklenir; çalışma anında
  # FirebaseApp başlatılamaz → FcmPlugin.getToken reject eder → yedek akış.
  if ! grep -q "firebase-messaging" "$APP_GRADLE"; then
    sed -i "s#^dependencies {#dependencies {\n    implementation platform('com.google.firebase:firebase-bom:33.7.0')\n    implementation 'com.google.firebase:firebase-messaging'#" "$APP_GRADLE"
  fi
  echo "FCM: google-services.json YOK → yoklama akışı (bildirimler eskisi gibi)"
fi

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
