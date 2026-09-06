package app.sohbeto.mobile;

import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** FCM servisi "uygulama açık mı?" diye buraya bakar (açıksa sistem bildirimi göstermez). */
    private static volatile MainActivity current;
    private static volatile boolean foreground;

    static boolean isForeground() {
        return foreground && current != null;
    }

    /** FCM uyandırdığında açık uygulamaya "kuyruğu hemen çek" der. */
    static void notifyJsWake() {
        final MainActivity a = current;
        if (a == null) return;
        try {
            a.runOnUiThread(() -> {
                if (a.getBridge() != null && a.getBridge().getWebView() != null) {
                    a.getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('sohbeto:fcm-wake'));", null);
                }
            });
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BatteryOptimizationPlugin.class);
        registerPlugin(CallNotificationPlugin.class);
        registerPlugin(FcmPlugin.class);
        super.onCreate(savedInstanceState);
        current = this;
        allowOverLockScreen();
        grantWebRtcPermissions();
        handleCallIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        current = this;
        foreground = true;

        // Bildirimden (uygulama açılmadan) reddedilen arama varsa reddi şimdi gönder.
        try {
            android.content.SharedPreferences sp =
                getSharedPreferences(CallActionReceiver.PREFS, MODE_PRIVATE);
            String pending = sp.getString(CallActionReceiver.KEY_PENDING_DECLINE, null);
            if (pending != null) {
                sp.edit().remove(CallActionReceiver.KEY_PENDING_DECLINE).apply();
                Intent i = new Intent();
                i.putExtra("sohbeto_action", "SOHBETO_DECLINE");
                i.putExtra("sohbeto_from", pending);
                handleCallIntent(i);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        foreground = false;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (current == this) current = null;
    }

    /** WebView içindeki getUserMedia (mikrofon/kamera) isteklerini onayla. */
    private void grantWebRtcPermissions() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().setWebChromeClient(
                new com.getcapacitor.BridgeWebChromeClient(getBridge()) {
                    @Override
                    public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                        runOnUiThread(() -> request.grant(request.getResources()));
                    }
                });
        } catch (Throwable ignored) {
        }
    }

    /** Kilit ekranının üzerinde açılabilsin + ekranı uyandırsın (Android 8 dahil). */
    private void allowOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallIntent(intent);
    }

    /** Bildirim/aksiyon bilgisini web tarafına iletir. */
    private void handleCallIntent(Intent intent) {
        if (intent == null) return;
        final String action = intent.getStringExtra("sohbeto_action");
        if (action == null) return;
        final String from = intent.getStringExtra("sohbeto_from");

        if ("SOHBETO_DECLINE".equals(action) || "SOHBETO_ANSWER".equals(action)) {
            androidx.core.app.NotificationManagerCompat.from(this).cancel(424242);
        }

        // Soğuk açılışta web tarafı henüz dinlemiyor olabilir; aynı olayı
        // birkaç kez gönderiyoruz. JS tarafı "nid" ile tekilleştirir.
        final String nid = action + "|" + (from == null ? "" : from) + "|" + System.currentTimeMillis();
        final String js =
            "window.dispatchEvent(new CustomEvent('sohbeto:native-notification',{detail:{"
                + "kind:'call',"
                + "nid:'" + jsEscape(nid) + "',"
                + "act:'" + jsEscape(action) + "',"
                + "from:'" + jsEscape(from == null ? "" : from) + "'}}));";

        final int[] delays = new int[] { 300, 1200, 3000, 6000 };
        for (int d : delays) {
            getWindow().getDecorView().postDelayed(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            }, d);
        }
    }

    private String jsEscape(String v) {
        return v.replace("\\", "\\\\").replace("'", "\\'");
    }
}
