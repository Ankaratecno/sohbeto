/**
 * Tam ekran gelen arama + kendi sesli mesaj bildirimi köprüsü (APK / Android 8+).
 * Web/PWA tarafında hiçbir şey yapmaz.
 */
import { registerPlugin } from "@capacitor/core";

export interface CallNotificationPlugin {
  showIncomingCall(options: { from: string; name?: string; subtitle?: string }): Promise<{ value: boolean }>;
  cancelIncomingCall(): Promise<void>;
  showMessage(options: { from?: string; title?: string; body?: string; id?: number }): Promise<void>;
}

export const CallNotification = registerPlugin<CallNotificationPlugin>("CallNotification", {
  web: {
    showIncomingCall: async () => ({ value: false }),
    cancelIncomingCall: async () => {},
    showMessage: async () => {},
  },
});
