package app.sohbeto.mobile;

import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * FCM köprüsü (JS ↔ native).
 *
 *  getToken()   → FCM kayıt token'ı (google-services.json yoksa reject eder;
 *                 bu durumda JS eski yoklama akışına döner, hiçbir şey bozulmaz)
 *  configure()  → uyanınca bilet çekilecek adres + cihaz sırrı + anon key
 *  setNames()   → rehber adları (numara → ad) — bildirim başlığı için
 *  getSeen()    → servisin gösterdiği biletlerin kimlikleri (çift bildirim önleme)
 */
@CapacitorPlugin(name = "Fcm")
public class FcmPlugin extends Plugin {

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    if (token == null || token.isEmpty()) {
                        call.reject("token boş");
                        return;
                    }
                    SohbetoNotifier.prefs(getContext()).edit().putString("token", token).apply();
                    JSObject ret = new JSObject();
                    ret.put("value", token);
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> call.reject("FCM token alınamadı: " + e.getMessage()));
        } catch (Throwable t) {
            // Firebase başlatılamadı (google-services.json yok) → JS yedek akışa döner.
            call.reject("Firebase yok: " + t.getMessage());
        }
    }

    @PluginMethod
    public void configure(PluginCall call) {
        SharedPreferences.Editor ed = SohbetoNotifier.prefs(getContext()).edit();
        String peekUrl = call.getString("peekUrl", "");
        String anonKey = call.getString("anonKey", "");
        String secret = call.getString("secret", "");
        if (peekUrl != null && !peekUrl.isEmpty()) ed.putString("peekUrl", peekUrl);
        if (anonKey != null && !anonKey.isEmpty()) ed.putString("anonKey", anonKey);
        if (secret != null && !secret.isEmpty()) ed.putString("secret", secret);
        ed.apply();
        call.resolve();
    }

    @PluginMethod
    public void setNames(PluginCall call) {
        JSObject names = call.getObject("names");
        if (names != null) {
            SohbetoNotifier.prefs(getContext()).edit().putString("names", names.toString()).apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void getSeen(PluginCall call) {
        String raw = SohbetoNotifier.prefs(getContext()).getString("seen", "[]");
        JSObject ret = new JSObject();
        ret.put("value", raw);
        call.resolve(ret);
    }
}
