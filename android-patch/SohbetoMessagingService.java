package app.sohbeto.mobile;

import android.content.SharedPreferences;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

/**
 * FCM alıcısı. Google'dan gelen paket SADECE {"t":"1"} = "uyan" sinyalidir.
 * Kim yazdı / arama mı bilgisi bu pakette YOKTUR; servis kendi Supabase'imizden
 * (send-push op=peek) cihaz sırrıyla biletleri çeker ve bildirimi cihazda kurar.
 *
 * Uygulama ön plandaysa sistem bildirimi gösterilmez; JS tarafına
 * "sohbeto:fcm-wake" olayı iletilir (kuyruk anında çekilir).
 * Uygulama kapalı/arka plandaysa: "Ayşe: yeni mesaj" / "Ayşe seni arıyor".
 */
public class SohbetoMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        SohbetoNotifier.prefs(this).edit().putString("token", token).putBoolean("tokenDirty", true).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        // Ağ işini ayrı iş parçacığında yap (servis ana iş parçacığında çalışır).
        new Thread(this::handleWake).start();
    }

    private void handleWake() {
        SharedPreferences p = SohbetoNotifier.prefs(this);
        String peekUrl = p.getString("peekUrl", "");
        String anonKey = p.getString("anonKey", "");
        String token = p.getString("token", "");
        String secret = p.getString("secret", "");
        if (peekUrl.isEmpty() || token.isEmpty() || secret.isEmpty()) return;

        JSONArray tickets = peek(peekUrl, anonKey, token, secret);
        if (tickets == null || tickets.length() == 0) {
            // Bilet yoksa yine de açık uygulamayı dürt (kuyruğu çeksin).
            MainActivity.notifyJsWake();
            return;
        }

        boolean foreground = MainActivity.isForeground();
        JSONArray seen = loadSeen(p);

        for (int i = 0; i < tickets.length(); i++) {
            JSONObject t = tickets.optJSONObject(i);
            if (t == null) continue;
            String id = t.optString("id", "");
            String kind = t.optString("kind", "message");
            String from = t.optString("from", "");
            if (!id.isEmpty()) seen.put(id);
            if (foreground) continue; // uygulama açık → JS kendisi gösterir/teslim eder

            String name = SohbetoNotifier.displayName(this, from);
            if ("call".equals(kind)) {
                SohbetoNotifier.showIncomingCall(this, from, name, "Sohbeto sesli arama");
            } else {
                SohbetoNotifier.showMessage(this, from, name, "yeni mesaj", notifId(from.isEmpty() ? id : from));
            }
        }
        saveSeen(p, seen);
        MainActivity.notifyJsWake();
    }

    private static int notifId(String s) {
        int h = 0;
        for (int i = 0; i < s.length(); i++) h = (h * 31 + s.charAt(i)) | 0;
        return Math.abs(h) % 2000000000;
    }

    private static JSONArray loadSeen(SharedPreferences p) {
        try {
            return new JSONArray(p.getString("seen", "[]"));
        } catch (Throwable t) {
            return new JSONArray();
        }
    }

    private static void saveSeen(SharedPreferences p, JSONArray seen) {
        // Son 200 kayıt yeter.
        JSONArray trimmed = seen;
        if (seen.length() > 200) {
            trimmed = new JSONArray();
            for (int i = seen.length() - 200; i < seen.length(); i++) trimmed.put(seen.opt(i));
        }
        p.edit().putString("seen", trimmed.toString()).apply();
    }

    /** send-push fonksiyonuna op=peek çağrısı. Metin yoktur; sadece kimden/tür. */
    private static JSONArray peek(String url, String anonKey, String token, String secret) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            if (!anonKey.isEmpty()) {
                c.setRequestProperty("apikey", anonKey);
                c.setRequestProperty("Authorization", "Bearer " + anonKey);
            }
            JSONObject body = new JSONObject();
            body.put("op", "peek");
            body.put("token", token);
            body.put("secret", secret);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) return null;
            String text;
            try (Scanner sc = new Scanner(c.getInputStream(), "UTF-8")) {
                text = sc.useDelimiter("\\A").hasNext() ? sc.next() : "";
            }
            JSONObject res = new JSONObject(text);
            return res.optJSONArray("tickets");
        } catch (Throwable t) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
