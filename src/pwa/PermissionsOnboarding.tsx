import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, MapPin, Camera, HardDrive, Users, FolderOpen, Shield, Check } from "lucide-react";

const ONBOARD_KEY = "sohbeto_onboarding_done_v1";
const PERM_PREFIX = "sohbeto_perm_";

type PermId = "notifications" | "location" | "camera" | "storage" | "contacts" | "files";

interface PermDef {
  id: PermId;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  color: string;
  request: () => Promise<"granted" | "denied" | "unsupported">;
}

const PERMS: PermDef[] = [
  {
    id: "notifications",
    icon: Bell,
    title: "Bildirimler",
    desc: "Sohbeto mesajları, namaz vakti ve hatırlatıcılar için.",
    color: "from-amber-400 to-orange-500",
    request: async () => {
      if (!("Notification" in window)) return "unsupported";
      const r = await Notification.requestPermission();
      return r === "granted" ? "granted" : "denied";
    },
  },
  {
    id: "location",
    icon: MapPin,
    title: "Konum",
    desc: "Hava durumu, namaz vakitleri ve yakındaki yerler için.",
    color: "from-emerald-400 to-teal-500",
    request: () =>
      new Promise((resolve) => {
        if (!("geolocation" in navigator)) return resolve("unsupported");
        navigator.geolocation.getCurrentPosition(
          () => resolve("granted"),
          () => resolve("denied"),
          { timeout: 10000 },
        );
      }),
  },
  {
    id: "camera",
    icon: Camera,
    title: "Kamera & Mikrofon",
    desc: "Sohbeto görüntülü arama ve profil fotoğrafı çekmek için.",
    color: "from-rose-400 to-pink-600",
    request: async () => {
      if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        s.getTracks().forEach((t) => t.stop());
        return "granted";
      } catch {
        return "denied";
      }
    },
  },
  {
    id: "storage",
    icon: HardDrive,
    title: "Kalıcı Depolama",
    desc: "Verilerin tarayıcı temizliğinde silinmesin diye.",
    color: "from-sky-400 to-blue-600",
    request: async () => {
      // @ts-ignore
      if (!navigator.storage?.persist) return "unsupported";
      // @ts-ignore
      const ok = await navigator.storage.persist();
      return ok ? "granted" : "denied";
    },
  },
  {
    id: "contacts",
    icon: Users,
    title: "Rehber",
    desc: "Telefon rehberinden kişi seçerek Sohbeto'ya ekle.",
    color: "from-violet-400 to-purple-600",
    request: async () => {
      // @ts-ignore — Contact Picker API (Chrome Android)
      if (!("contacts" in navigator) || !navigator.contacts?.select) return "unsupported";
      try {
        // @ts-ignore
        const c = await navigator.contacts.select(["name", "tel"], { multiple: true });
        return c ? "granted" : "denied";
      } catch {
        return "denied";
      }
    },
  },
  {
    id: "files",
    icon: FolderOpen,
    title: "Dosya Sistemi",
    desc: "Cihazından dosya açıp kaydedebilmek için.",
    color: "from-yellow-400 to-amber-600",
    request: async () => {
      // @ts-ignore
      if (!window.showOpenFilePicker) return "unsupported";
      // Sadece desteği işaretle, gerçek seçimi kullanıcı tetikleyince iste
      return "granted";
    },
  },
];

export const PermissionsOnboarding: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0 = welcome, 1..N = perms, N+1 = done
  const total = PERMS.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(ONBOARD_KEY);
    if (done) return;
    // Hem PWA'da hem tarayıcıda göster — kullanıcı izinleri her ortamda verebilsin
    const t = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  // Permissions API ile zaten verilmiş izinleri tespit edip atla
  useEffect(() => {
    if (!open || step !== 0) return;
    if (!navigator.permissions?.query) return;
    (async () => {
      for (const p of PERMS) {
        const name =
          p.id === "notifications" ? "notifications"
          : p.id === "location" ? "geolocation"
          : p.id === "camera" ? "camera"
          : null;
        if (!name) continue;
        try {
          // @ts-ignore
          const r = await navigator.permissions.query({ name });
          if (r.state === "granted") {
            localStorage.setItem(PERM_PREFIX + p.id, "granted");
          }
        } catch {
          /* noop */
        }
      }
    })();
  }, [open, step]);

  const finish = () => {
    localStorage.setItem(ONBOARD_KEY, String(Date.now()));
    setOpen(false);
  };

  const current = useMemo(() => (step >= 1 && step <= total ? PERMS[step - 1] : null), [step]);

  const decide = async (grant: boolean) => {
    if (!current) return;
    if (grant) {
      const r = await current.request();
      localStorage.setItem(PERM_PREFIX + current.id, r);
    } else {
      localStorage.setItem(PERM_PREFIX + current.id, "skipped");
    }
    setStep((s) => s + 1);
  };

  const skipAll = () => finish();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && finish()}>
      <DialogContent className="bg-gradient-to-b from-[#1a2f5a] to-[#0b1d3a] text-white border-amber-500/30 max-w-md">
        {step === 0 && (
          <>
            <DialogHeader className="items-center text-center">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-300 via-amber-500 to-orange-700 shadow-[0_0_80px_rgba(245,158,11,0.5)] flex items-center justify-center text-5xl mb-2">
                ☀️
              </div>
              <DialogTitle className="text-2xl text-white">Sohbeto'a hoş geldin</DialogTitle>
              <DialogDescription className="text-amber-100/80">
                Birkaç izinle uygulamanın tüm özelliklerini açalım. İstediğin zaman <b>Ayarlar</b>'dan değiştirebilirsin.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex gap-2 text-xs text-amber-50/80 mt-2">
              <Shield className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
              <div>
                Verilerin yalnızca <b>cihazında</b> saklanır. Sunucuya hiçbir şey gönderilmez.
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={() => setStep(1)} className="bg-amber-500 hover:bg-amber-400 text-[#0b1d3a] font-semibold h-11">
                Başla
              </Button>
              <Button onClick={skipAll} variant="ghost" className="text-amber-200 hover:text-white hover:bg-white/10">
                Daha sonra
              </Button>
            </div>
          </>
        )}

        {current && (
          <>
            <DialogHeader className="items-center text-center">
              <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${current.color} shadow-lg flex items-center justify-center mb-2`}>
                <current.icon className="w-10 h-10 text-white" />
              </div>
              <DialogTitle className="text-xl text-white">{current.title}</DialogTitle>
              <DialogDescription className="text-amber-100/80">{current.desc}</DialogDescription>
            </DialogHeader>
            <div className="text-center text-xs text-amber-200/60 mt-1">
              {step} / {total}
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={() => decide(true)} className="bg-amber-500 hover:bg-amber-400 text-[#0b1d3a] font-semibold h-11">
                İzin ver
              </Button>
              <Button onClick={() => decide(false)} variant="ghost" className="text-amber-200 hover:text-white hover:bg-white/10">
                Şimdi değil
              </Button>
            </div>
          </>
        )}

        {step > total && (
          <>
            <DialogHeader className="items-center text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-2">
                <Check className="w-12 h-12 text-white" />
              </div>
              <DialogTitle className="text-2xl text-white">Hazırsın</DialogTitle>
              <DialogDescription className="text-amber-100/80">
                Sohbeto artık tam kapasite. İyi eğlenceler ☀️
              </DialogDescription>
            </DialogHeader>
            <Button onClick={finish} className="mt-4 bg-amber-500 hover:bg-amber-400 text-[#0b1d3a] font-semibold h-11">
              Masaüstüne geç
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
