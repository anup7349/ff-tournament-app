package com.battlehub.fftournament;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;

import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView webView;
    private AdView bannerAdView;
    private RewardedAd rewardedAd;
    private boolean rewardedAdLoading;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.rgb(12, 15, 18));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(12, 15, 18));
        layout.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        bannerAdView = new AdView(this);
        bannerAdView.setAdUnitId(getString(R.string.admob_banner_ad_unit_id));
        bannerAdView.setAdSize(AdSize.BANNER);
        layout.addView(bannerAdView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        setContentView(layout);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.addJavascriptInterface(new AdsBridge(), "BattleHubAds");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternalUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(Uri.parse(url));
            }
        });

        MobileAds.initialize(this);
        bannerAdView.loadAd(new AdRequest.Builder().build());
        loadRewardedAd();
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private void loadRewardedAd() {
        if (rewardedAdLoading || rewardedAd != null) {
            return;
        }
        rewardedAdLoading = true;
        AdRequest adRequest = new AdRequest.Builder().build();
        RewardedAd.load(
                this,
                getString(R.string.admob_rewarded_ad_unit_id),
                adRequest,
                new RewardedAdLoadCallback() {
                    @Override
                    public void onAdFailedToLoad(LoadAdError loadAdError) {
                        rewardedAd = null;
                        rewardedAdLoading = false;
                        if (webView != null) {
                            webView.postDelayed(MainActivity.this::loadRewardedAd, 10000);
                        }
                    }

                    @Override
                    public void onAdLoaded(RewardedAd ad) {
                        rewardedAd = ad;
                        rewardedAdLoading = false;
                        notifyAdReady();
                    }
                }
        );
    }

    private void showRewardedAd() {
        if (rewardedAd == null) {
            loadRewardedAd();
            notifyRewardResult(false, "Ad is still loading. Try again in a few seconds.");
            return;
        }

        RewardedAd ad = rewardedAd;
        rewardedAd = null;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                loadRewardedAd();
            }
        });
        ad.show(this, rewardItem -> notifyRewardResult(true, "Reward earned."));
    }

    private void notifyRewardResult(boolean success, String message) {
        if (webView == null) {
            return;
        }
        String script = "window.onRewardedAdResult && window.onRewardedAdResult("
                + success + ", " + JSONObject.quote(message) + ")";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void notifyAdReady() {
        if (webView == null) {
            return;
        }
        webView.post(() -> webView.evaluateJavascript(
                "window.onRewardedAdLoaded && window.onRewardedAdLoaded()",
                null
        ));
    }

    private class AdsBridge {
        @JavascriptInterface
        public void showRewardedAd() {
            runOnUiThread(MainActivity.this::showRewardedAd);
        }

        @JavascriptInterface
        public boolean isRewardedAdReady() {
            return rewardedAd != null;
        }

        @JavascriptInterface
        public void preloadRewardedAd() {
            runOnUiThread(MainActivity.this::loadRewardedAd);
        }
    }

    private boolean handleExternalUrl(Uri uri) {
        String scheme = uri.getScheme();
        if ("upi".equalsIgnoreCase(scheme) || "intent".equalsIgnoreCase(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            } catch (Exception ignored) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (bannerAdView != null) {
            bannerAdView.destroy();
        }
        super.onDestroy();
    }
}
