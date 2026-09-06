/**
 * Native (Capacitor / APK) ortam tespiti.
 * Web (GitHub Pages / PWA) tarafı bu dosyadan etkilenmez.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}
