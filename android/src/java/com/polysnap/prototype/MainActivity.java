package com.polysnap.prototype;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Insets;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Offline test shell. All game code, artwork and audio are bundled in the APK. */
public final class MainActivity extends Activity {
    private WebView game;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(8, 21, 30));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            frame.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override public WindowInsets onApplyWindowInsets(View view, WindowInsets windowInsets) {
                    Insets bars = windowInsets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                    return WindowInsets.CONSUMED;
                }
            });
        }
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(8, 21, 30));
        game.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        frame.addView(game, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        try (InputStream input = getAssets().open("game.html")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            game.loadDataWithBaseURL("https://polysnap.local/", new String(output.toByteArray(), StandardCharsets.UTF_8), "text/html", "UTF-8", null);
        } catch (Exception error) {
            game.loadData("<body style='background:#08151e;color:white;font:20px sans-serif;padding:24px'>Snapoly could not open its bundled game. Please reinstall the test APK.</body>", "text/html", "UTF-8");
        }
    }

    @Override protected void onPause() {
        if (game != null) {
            game.evaluateJavascript("window.dispatchEvent(new Event('blur'))", null);
            game.onPause();
        }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (game != null) game.onResume();
    }
    @Override protected void onDestroy() {
        if (game != null) { game.destroy(); game = null; }
        super.onDestroy();
    }
}
