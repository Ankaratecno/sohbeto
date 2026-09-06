/**
 * Pil optimizasyonu muafiyeti + tam ekran gelen arama izni köprüsü.
 * Sadece APK (Capacitor) tarafında çalışır; web/PWA'da hiçbir şey yapmaz.
 */
import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native";

export interface BatteryOptimizationPlugin {
  isIgnoring(): Promise<{ value: boolean }>;
  requestIgnore(): Promise<{ value: boolean }>;
  openSettings(): Promise<void>;
  canUseFullScreenIntent(): Promise<{ value: boolean }>;
  openFullScreenIntentSettings(): Promise<void>;
}

const BatteryOptimization = registerPlugin<BatteryOptimizationPlugin>("BatteryOptimization", {
  web: {
    isIgnoring: async () => ({ value: true }),
    requestIgnore: async () => ({ value: true }),
    openSettings: async () => {},
    canUseFullScreenIntent: async () => ({ value: true }),
    openFullScreenIntentSettings: async () => {},
  },
});

export { BatteryOptimization };

const ASKED_KEY = "sohbeto:native:battery-asked";

/**
 * Uygulama açılışında bir kez sorar:
 *  - pil optimizasyonu muafiyeti (arka planda öldürülmemek için)
 *  - Android 14+ tam ekran gelen arama izni
 */
export async function ensureBackgroundPermissions(force = false): Promise<void> {
  if (!isNativeApp()) return;

  let asked = false;
  try {
    asked = localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    /* yok say */
  }
  if (asked && !force) return;

  try {
    const { value: ignoring } = await BatteryOptimization.isIgnoring();
    if (!ignoring) await BatteryOptimization.requestIgnore();
  } catch {
    /* yok say */
  }

  try {
    const { value: fullScreen } = await BatteryOptimization.canUseFullScreenIntent();
    if (!fullScreen) await BatteryOptimization.openFullScreenIntentSettings();
  } catch {
    /* yok say */
  }

  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* yok say */
  }
}
