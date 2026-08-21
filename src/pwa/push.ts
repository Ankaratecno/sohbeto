/**
 * Web Push aboneliği: tarayıcı → Supabase (push_subscriptions).
 * Kimlik: anonim Supabase oturumu (auth.users satırı oluşur, RLS çalışır).
 */
import { supabase, VAPID_PUBLIC_KEY } from "@/lib/supabase";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

function deviceId(): string {
  let id = localStorage.getItem("sohbeto_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("sohbeto_device_id", id);
  }
  return id;
}

/** Uygulamanın sanal numarası (push hedefi). */
function normalizePhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return d ? `+${d}` : "";
}

function storedPhone(): string {
  return localStorage.getItem("sohbeto_push_phone") || "";
}

/** Uygulama giriş yaptığında kendi numarasını kaydeder ve aboneliği tazeler. */
export async function setPushPhone(phone: string): Promise<void> {
  const p = normalizePhone(phone);
  if (!p) return;
  localStorage.setItem("sohbeto_push_phone", p);
  // Abonelik satırındaki phone alanı boş kalmış olabilir → her girişte tazele.
  if ("Notification" in window && Notification.permission === "granted") await enablePush();
}

/** Oturum yoksa anonim oturum açar, kullanıcı id'sini döner. */
export async function ensureSupabaseUser(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("[Sohbeto] Anonim oturum açılamadı:", error.message);
    return null;
  }
  return anon.user?.id ?? null;
}

/** İzin ister (gerekirse), abone olur ve Supabase'e kaydeder. */
export async function enablePush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
  }

  const userId = await ensureSupabaseUser();
  if (!userId) return false;

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      device_id: deviceId(),
      phone: storedPhone() || null,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      platform: navigator.platform || null,
      user_agent: navigator.userAgent,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.warn("[Sohbeto] Push aboneliği kaydedilemedi:", error.message);
    return false;
  }
  return true;
}

/** Aboneliği kaldırır ve kaydı siler. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  } catch {
    /* noop */
  }
}

/** Bir kullanıcıya bildirim gönderir (send-push edge function). */
export async function sendPush(payload: {
  user_id?: string;
  phone?: string;
  title: string;
  body: string;
  kind?: "message" | "call";
  url?: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  const { error } = await supabase.functions.invoke("send-push", { body: payload });
  if (error) console.warn("[Sohbeto] send-push hatası:", error.message);
  return !error;
}

/** Numaraya bildirim gönderir (P2P mesaj/arama tetikleyicisi). */
export async function notifyPhone(
  phone: string,
  title: string,
  body: string,
  kind: "message" | "call" = "message",
): Promise<boolean> {
  const p = normalizePhone(phone);
  if (!p) return false;
  await ensureSupabaseUser();
  return sendPush({ phone: p, title, body, kind });
}

/** İzin zaten verilmişse sessizce aboneliği tazeler; ayrıca iframe için global açar. */
export function initPush(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w["sohbetoEnablePush"] = enablePush;
  w["sohbetoDisablePush"] = disablePush;
  w["sohbetoSendPush"] = sendPush;
  w["sohbetoSetPushPhone"] = setPushPhone;
  w["sohbetoNotifyPhone"] = notifyPhone;
  if ("Notification" in window && Notification.permission === "granted") {
    void enablePush();
  }
}
