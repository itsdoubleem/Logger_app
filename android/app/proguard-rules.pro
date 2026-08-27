# R8 keep rules — currently unused (release sets minifyEnabled false).
# Written ahead of time so that turning R8 on is a two-line change in
# app/build.gradle rather than a debugging session. Read the comment on the
# release buildType before you flip it.

# ── 지문 · 파일 다리 · the JavaScript bridge ────────────────────────────
# WebView resolves @JavascriptInterface methods by NAME, at runtime, from a
# string. R8 cannot see those call sites, so without this it will rename or
# strip them and the punch pad silently falls back to press-and-hold.
-keepclasseswithmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class app.worklog.punch.MainActivity$BioBridge { *; }

# BioShim.SOURCE / FileShim.SOURCE are JavaScript held in static String fields
# and injected with addDocumentStartJavaScript. The strings must survive.
-keep class app.worklog.punch.BioShim { *; }
-keep class app.worklog.punch.FileShim { *; }

# androidx.biometric inflates fragments reflectively.
-keep class androidx.biometric.** { *; }

# WebView callbacks invoked from native.
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void onShowFileChooser(...);
}
