package com.moonlightneurocare.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();

        // Files the portal serves as downloads (reports, PDFs, attachments) go to the phone's Downloads
        // through Android's download manager, signed in with the same session as the app.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            download(url, userAgent, contentDisposition, mimeType)
        );

        // Back button: go back inside the portal; leave the app only from the first page.
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    WebView view = getBridge() != null ? getBridge().getWebView() : null;
                    if (view != null && view.canGoBack()) {
                        view.goBack();
                    } else {
                        finish();
                    }
                }
            }
        );
    }

    private void download(String url, String userAgent, String contentDisposition, String mimeType) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("https") || scheme.equals("http"))) {
            Toast.makeText(this, "This file can't be saved from the app. Open it on the website instead.", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(uri);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }
            request.addRequestHeader("User-Agent", userAgent);
            request.setTitle(fileName);
            request.setDescription("Moonlight Neurocare");
            request.setMimeType(mimeType);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                // No storage permission needed: the app's own folder; the notification opens the file.
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            }
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "Downloading " + fileName, Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, "The download could not start. Please try again.", Toast.LENGTH_LONG).show();
        }
    }
}
