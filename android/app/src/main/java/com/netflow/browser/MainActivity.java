package com.netflow.browser;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private NetflowWebViewEngine browserEngine;
    private FrameLayout overlayHost;
    private FrameLayout contentWebViewContainer;
    private FrameLayout fullscreenContainer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NetflowBrowserPlugin.class);
        super.onCreate(savedInstanceState);

        browserEngine = new NetflowWebViewEngine(this, (eventType, payload) -> {
            WebView shellWebView = getBridge() != null ? getBridge().getWebView() : null;
            NetflowBrowserPlugin.dispatchEngineEventToShell(this, shellWebView, eventType, payload);
        });
        NetflowBrowserPlugin.setSharedEngine(browserEngine);

        setupNativeBrowserContainers();
        handleIncomingIntent(getIntent());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (browserEngine != null && browserEngine.handleBackPressed()) {
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    /**
     * BridgeActivity.onCreate() calls setContentView(com.getcapacitor.android.R.layout.capacitor_bridge_layout_main),
     * which inflates a CoordinatorLayout containing only the CapacitorWebView (@+id/webview) and ignores
     * app/src/main/res/layout/activity_main.xml.
     *
     * Therefore, we programmatically create the overlay FrameLayout (R.id.netflow_overlay_host),
     * the content WebView container (R.id.netflow_webview_container), and the fullscreen video
     * container (R.id.netflow_fullscreen_container) around the shell WebView's parent so
     * NetflowWebViewEngine always receives non-null containers.
     */
    private void setupNativeBrowserContainers() {
        WebView shellWebView = getBridge() != null ? getBridge().getWebView() : null;
        ViewGroup rootContent = findViewById(android.R.id.content);
        ViewGroup shellParent = (shellWebView != null && shellWebView.getParent() instanceof ViewGroup)
                ? (ViewGroup) shellWebView.getParent()
                : rootContent;

        overlayHost = new FrameLayout(this);
        overlayHost.setId(R.id.netflow_overlay_host);

        if (shellParent != null) {
            if (shellWebView != null && shellWebView.getParent() == shellParent) {
                int shellIndex = shellParent.indexOfChild(shellWebView);
                ViewGroup.LayoutParams shellOriginalLp = shellWebView.getLayoutParams();
                shellParent.removeView(shellWebView);

                ViewGroup.LayoutParams overlayLp = shellOriginalLp != null
                        ? shellOriginalLp
                        : new ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                        );
                shellParent.addView(overlayHost, Math.max(0, shellIndex), overlayLp);
                overlayHost.addView(
                        shellWebView,
                        new FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                        )
                );
            } else {
                shellParent.addView(
                        overlayHost,
                        new ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                        )
                );
            }
        }

        contentWebViewContainer = new FrameLayout(this);
        contentWebViewContainer.setId(R.id.netflow_webview_container);
        contentWebViewContainer.setVisibility(View.GONE);
        overlayHost.addView(
                contentWebViewContainer,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );

        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setId(R.id.netflow_fullscreen_container);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.setVisibility(View.GONE);
        overlayHost.addView(
                fullscreenContainer,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );

        browserEngine.setShellWebView(shellWebView);
        browserEngine.attachContainers(contentWebViewContainer, fullscreenContainer);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri data = intent.getData();
        if (Intent.ACTION_VIEW.equals(action) && data != null) {
            String scheme = data.getScheme() != null ? data.getScheme().toLowerCase(Locale.ROOT) : "";
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                return;
            }
            String targetUrl = data.toString().trim();
            NetflowWebViewEngine.UrlSafetyResult safety = NetflowWebViewEngine.evaluateUrlSafety(targetUrl);
            if (safety.isSafe && !NetflowWebViewEngine.isGoogleAuthUrl(targetUrl)) {
                WebView shellWebView = getBridge() != null ? getBridge().getWebView() : null;
                NetflowBrowserPlugin.enqueueOrDeliverExternalIntentUrl(this, shellWebView, targetUrl);
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == NetflowWebViewEngine.FILE_CHOOSER_REQUEST_CODE) {
            if (browserEngine != null) {
                browserEngine.onFileChooserActivityResult(resultCode, data);
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode >= NetflowWebViewEngine.OS_PERMISSION_REQUEST_CODE_BASE
                && requestCode <= NetflowWebViewEngine.OS_PERMISSION_REQUEST_CODE_MAX) {
            if (browserEngine != null) {
                browserEngine.onRequestPermissionsResult(requestCode, permissions, grantResults);
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (browserEngine != null) {
            browserEngine.onHostResume();
        }
    }

    @Override
    public void onPause() {
        if (browserEngine != null) {
            browserEngine.onHostPause();
        }
        super.onPause();
    }

    @Override
    public void onDestroy() {
        if (browserEngine != null) {
            browserEngine.onHostDestroy();
            NetflowBrowserPlugin.clearStaticReferences(browserEngine);
            browserEngine = null;
        } else {
            NetflowBrowserPlugin.clearStaticReferences(null);
        }
        overlayHost = null;
        contentWebViewContainer = null;
        fullscreenContainer = null;
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (browserEngine != null && browserEngine.handleBackPressed()) {
            return;
        }
        super.onBackPressed();
    }
}
