/**
 * FCM (APK) kayıt katmanı. Web/PWA'da hiçbir şey yapmaz.
 *
 * Google'a giden tek şey cihaz token'ı ve "uyan" sinyalidir. Mesaj metni,
 * gönderen numarası, başlık — hiçbiri FCM'den geçmez. Uyanınca cihaz kendi
 * Supabase'inden (send-push op=peek) bileti çeker, bildirimi cihazda kurar.
 */
import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import { ensureSupabaseUser } from "@/pwa/push";

interface FcmPluginApi {
  getToken(): Promise<{ value: string }>;
  configure(o: { peekUrl?: string; anonKey?: string; secret?: string }): Promise<void>;
  setNames(o: { names: Record<string, string> }): Promise<void>;
  getSeen(): Promise<{ value: string }>;
}

export const Fcm = registerPlugin<FcmPluginApi>("Fcm", {
  web: {
    getToken: async () => {
      throw new Error("web");
    },
    configure: async () => {},
    setNames: async () => {},
    getSeen: async () => ({ value: "[]" }),
  },
});

const SECRET_KEY = "sohbeto_fcm_secret";
const TOKEN_KEY = "sohbeto_fcm_token";
let active = false;
let cachedToken = "";

/** FCM bu cihazda gerçekten çalışıyor mu? (token alındı + Supabase'e yazıldı) */
export function isFcmActive(): boolean {
  return active;
}

function deviceSecret(): string {
  let s = localStorage.getItem(SECRET_KEY);
  if (!s) {
    s = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(SECRET_KEY, s);
  }
  return s;
}

function deviceId(): string {
  let id = localStorage.getItem("sohbeto_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("sohbeto_device_id", id);
  }
  return id;
}

function normalizePhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return d ? `+${d}` : "";
}

/** Token'ı alır ve Supabase fcm_tokens'a yazar. Başarısızsa false (yedek akış). */
export async function registerFcm(phone?: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { value: token } = await Fcm.getToken();
    if (!token) return false;
    cachedToken = token;
    const secret = deviceSecret();
    await Fcm.configure({
      peekUrl: `${SUPABASE_URL}/functions/v1/send-push`,
      anonKey: SUPABASE_PUBLISHABLE_KEY,
      secret,
    });
    const userId = await ensureSupabaseUser();
    if (!userId) return false;
    const p = normalizePhone(phone || localStorage.getItem("sohbeto_push_phone") || "");
    const { data, error } = await supabase.rpc("upsert_fcm_token", {
      p_token: token,
      p_secret: secret,
      p_phone: p || null,
      p_device_id: deviceId(),
      p_platform: "android",
    });
    if (error || data !== true) {
      console.warn("[Sohbeto] FCM token kaydedilemedi:", error?.message);
      return false;
    }
    localStorage.setItem(TOKEN_KEY, token);
    active = true;
    console.info("[Sohbeto] FCM aktif (yalnızca uyandırma sinyali).");
    return true;
  } catch (e) {
    // google-services.json yok / Firebase yok → sessizce eski akış.
    console.info("[Sohbeto] FCM yok, yoklama akışı kullanılıyor:", (e as Error).message);
    active = false;
    return false;
  }
}

/** Numara değişince kaydı tazele (FCM aktifse). */
export async function refreshFcmPhone(phone: string): Promise<void> {
  if (!isNativeApp()) return;
  if (!active && !cachedToken) return;
  await registerFcm(phone);
}

/** Rehber adlarını native tarafa yaz (bildirim başlığı: "Ayşe: yeni mesaj"). */
export async function syncFcmNames(names: Record<string, string>): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(names || {})) {
      const p = normalizePhone(k);
      const n = String(v || "").trim();
      if (p && n) clean[p] = n.slice(0, 60);
    }
    await Fcm.setNames({ names: clean });
  } catch {
    /* native yoksa yok say */
  }
}

/** Native servisin zaten gösterdiği bilet kimlikleri. */
export async function fcmSeenIds(): Promise<string[]> {
  try {
    const { value } = await Fcm.getSeen();
    const arr = JSON.parse(value || "[]") as unknown;
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
