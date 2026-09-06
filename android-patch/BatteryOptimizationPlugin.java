package app.sohbeto.mobile;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pil optimizasyonu muafiyeti ve tam ekran bildirim izni köprüsü.
 * FCM kullanılmadığı için uygulamanın arka planda öldürülmemesi kritik.
 */
@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    @PluginMethod
    public void isIgnoring(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", isIgnoringInternal());
        call.resolve(ret);
    }

    private boolean isIgnoringInternal() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    /** Sistem diyaloğunu açar: "Uygulamanın pil optimizasyonunu kapat?" */
    @PluginMethod
    @SuppressWarnings("BatteryLife")
    public void requestIgnore(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || isIgnoringInternal()) {
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("value", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Pil optimizasyonu ekranı açılamadı", e);
        }
    }

    /** Genel pil optimizasyonu ayar listesini açar (yedek yol). */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Ayarlar açılamadı", e);
        }
    }

    /** Android 14+ tam ekran bildirim (gelen arama ekranı) izni durumu/ayarı. */
    @PluginMethod
    public void canUseFullScreenIntent(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= 34) {
            android.app.NotificationManager nm =
                (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            allowed = nm != null && nm.canUseFullScreenIntent();
        }
        ret.put("value", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Tam ekran bildirim ayarı açılamadı", e);
        }
    }
}
