# R8 keep rules — currently unused (release sets minifyEnabled false).
# Written ahead of time so that turning R8 on is a two-line change in
# app/build.gradle rather than a debugging session. Read the comment on the
# release buildType before you flip it.

# ── 지문 · 파일 다리 · the JavaScript bridge ────────────────────────────
# WebView resolves @JavascriptInterface methods by NAME, at runtime, from a
# string. R8 cannot see those call sites, so without this it will rename or
# strip them and 백업 내보내기 silently stops reaching the disk.
-keepclasseswithmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class app.worklog.punch.MainActivity$NativeBridge { *; }

# FileShim.SOURCE is JavaScript held in a static String field and injected
# with addDocumentStartJavaScript. The string must survive.
-keep class app.worklog.punch.FileShim { *; }

# WebView callbacks invoked from native.
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void onShowFileChooser(...);
}
