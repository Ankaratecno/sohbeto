package app.sohbeto.mobile;

import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BatteryOptimizationPlugin.class);
        registerPlugin(CallNotificationPlugin.class);
        super.onCreate(savedInstanceState);
        allowOverLockScreen();
        handleCallIntent(getIntent());
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

        final String js =
            "window.dispatchEvent(new CustomEvent('sohbeto:native-notification',{detail:{"
                + "kind:'call',"
                + "act:'" + jsEscape(action) + "',"
                + "from:'" + jsEscape(from == null ? "" : from) + "'}}));";

        getWindow().getDecorView().postDelayed(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        }, 600);
    }

    private String jsEscape(String v) {
        return v.replace("\\", "\\\\").replace("'", "\\'");
    }
}
