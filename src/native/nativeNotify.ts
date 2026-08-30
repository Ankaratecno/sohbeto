/**
 * APK (Capacitor) tarafı bildirim katmanı — FCM YOK.
 *
 * Mantık: Supabase'deki "asılı veri" kuyruğu düzenli aralıklarla yoklanır.
 * Yeni bir kayıt görülürse cihazda YEREL bildirim (LocalNotifications) gösterilir:
 *  - kind = "call"  → "Cevapla / Reddet" butonlu, sesli-arama görünümlü bildirim
 *  - diğerleri      → normal mesaj bildirimi
 *
 * Web/PWA (GitHub Pages) tarafındaki Web Push (VAPID + service worker) aynen
 * kalır; bu modül yalnızca native platformda çalışır.
 */
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { isNativeApp } from "./native";
import { fetchQueue } from "@/pwa/asiliveri";
import { ensureBackgroundPermissions } from "./batteryOptimization";
import { CallNotification } from "./callNotification";

const SEEN_KEY = "sohbeto:native:seen";
const POLL_FOREGROUND_MS = 5000;
const POLL_BACKGROUND_MS = 15000;

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;
let seen = new Set<string>();

function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    seen = new Set<string>();
  }
}

function saveSeen() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500)));
  } catch {
    /* yok say */
  }
}

async function registerChannelsAndActions() {
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: "SOHBETO_CALL",
        actions: [
          { id: "answer", title: "Cevapla" },
          { id: "decline", title: "Reddet", destructive: true },
        ],
      },
      {
        id: "SOHBETO_MSG",
        actions: [{ id: "open", title: "Aç" }],
      },
    ],
  });

  // Aramalar için yüksek öncelikli, zil sesli kanal.
  await LocalNotifications.createChannel?.({
    id: "sohbeto_calls",
    name: "Aramalar",
    description: "Gelen sesli aramalar",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
  await LocalNotifications.createChannel?.({
    id: "sohbeto_messages",
    name: "Mesajlar",
    description: "Yeni mesaj bildirimleri",
    importance: 4,
    visibility: 1,
    vibration: true,
  });
}

function notifId(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000;
}

async function pollOnce() {
  let rows: Awaited<ReturnType<typeof fetchQueue>> = [];
  try {
    rows = await fetchQueue(50);
  } catch {
    return;
  }
  const fresh = rows.filter((r) => r.code && !seen.has(r.code));
  if (!fresh.length) return;

  const calls = fresh.filter((r) => String(r.kind || "").toLowerCase().includes("call"));
  const messages = fresh.filter((r) => !String(r.kind || "").toLowerCase().includes("call"));

  // Aramalar: native tam ekran bildirim (Android 8+). Başarısız olursa yerel bildirime düşer.
  for (const r of calls) {
    const from = r.from_phone || "Bilinmeyen";
    try {
      await CallNotification.showIncomingCall({
        from,
        name: from,
        subtitle: "Sohbeto sesli arama",
      });
      continue;
    } catch {
      /* aşağıdaki yerel bildirime düş */
    }
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId(r.code),
            title: "Sohbeto",
            body: `Sesli arama - ${from} seni arıyor`,
            channelId: "sohbeto_calls",
            actionTypeId: "SOHBETO_CALL",
            ongoing: true,
            smallIcon: "ic_stat_icon_config_sample",
            extra: { from, kind: "call", code: r.code },
          },
        ],
      });
    } catch {
      /* izin yoksa sessizce geç */
    }
  }

  // Mesajlar: kendi sesimizle native bildirim, olmazsa yerel bildirim.
  for (const r of messages) {
    const from = r.from_phone || "Bilinmeyen";
    try {
      await CallNotification.showMessage({
        from,
        title: "Sohbeto",
        body: `${from}: yeni mesaj`,
        id: notifId(r.code),
      });
      continue;
    } catch {
      /* aşağıdaki yerel bildirime düş */
    }
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId(r.code),
            title: "Sohbeto",
            body: `${from}: yeni mesaj`,
            channelId: "sohbeto_messages",
            actionTypeId: "SOHBETO_MSG",
            smallIcon: "ic_stat_icon_config_sample",
            extra: { from, kind: "message", code: r.code },
          },
        ],
      });
    } catch {
      /* izin yoksa sessizce geç */
    }
  }

  fresh.forEach((r) => seen.add(r.code));
  saveSeen();
}


function setPolling(ms: number) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => void pollOnce(), ms);
}

/** Native platformda bildirim döngüsünü başlatır. Web'de hiçbir şey yapmaz. */
export async function initNativeNotifications(
  onAction?: (payload: { from?: string | undefined; kind?: string | undefined; act?: string | undefined }) => void,
): Promise<void> {
  if (!isNativeApp() || started) return;
  started = true;
  loadSeen();

  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;
  } catch {
    return;
  }

  // Pil optimizasyonu muafiyeti + tam ekran gelen arama izni (Android)
  void ensureBackgroundPermissions();

  await registerChannelsAndActions();

  await LocalNotifications.addListener("localNotificationActionPerformed", (ev) => {
    const extra = (ev.notification.extra || {}) as { from?: string; kind?: string };
    const act = ev.actionId === "tap" ? "open" : ev.actionId;
    const payload = { from: extra.from, kind: extra.kind, act };
    onAction?.(payload);
    window.dispatchEvent(new CustomEvent("sohbeto:native-notification", { detail: payload }));
  });

  App.addListener("appStateChange", ({ isActive }) => {
    setPolling(isActive ? POLL_FOREGROUND_MS : POLL_BACKGROUND_MS);
    if (isActive) void pollOnce();
  });

  setPolling(POLL_FOREGROUND_MS);
  void pollOnce();
}
