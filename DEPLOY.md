# Deploying 근무기록 Work Log

> **This file describes v1.** For v2 — the version that ships now — substitute
> `python3 build.py v2` and `dist-v2/` everywhere below, and `./build_apk.sh v2`
> for the APK. Everything else on this page (hosting, HTTPS, TWA,
> assetlinks) is identical: both variants are one self-contained `index.html`
> with the same `applicationId`, so a v2 install upgrades a v1 one in place and
> the worker's records survive. See [`V2.md`](V2.md) for what changed.

## Build

```
python3 build.py
```

Everything to ship is in `dist-v2/` — 7 files, ~730 KB, no dependencies, no build
toolchain. `build.py` unpacks the handoff bundle, swaps in the current
`WorkLogApp.v2.dc.html`, adds the design-system tokens and the PWA head tags, and
re-seals it. Re-run it after any edit to `WorkLogApp.v2.dc.html`, `ds-tokens.css`,
`pwa/sw.js` or `pwa/manifest.webmanifest`.

```
dist-v2/index.html                the whole app
dist-v2/manifest.webmanifest      installability
dist-v2/sw.js                     offline shell
dist-v2/icon-{180,192,512}.png    launcher icons
dist-v2/icon-maskable-512.png     Android adaptive icon
```

Icons are regenerated with `python3 pwa/make_icons.py`. That script also writes
the Android launcher bitmaps into `android/app/src/main/res/mipmap-*`, the
adaptive icon's background colour, and the iOS `AppIcon.appiconset/icon-1024.png`.

The mark is the **clock and folder** — a clock (the hours) with a folder (the
record), green `oklch(0.52 0.14 149)` on the white disc. It replaced the green
fingerprint on 2026-10-26, when punching became a plain START / STOP tap
(`CHANGELOG.md`, eighty-sixth entry). The master drawing is
`docs/design/logo/logo-mark.svg` (redrawn 2026-10-27, eighty-ninth entry).
Nothing is rasterised from it: its shapes live in `make_icons.py` as `d`
strings — `FILLS` filled, `STROKES` stroked at their own widths — flattened and
drawn at whatever size is being emitted, so every icon is drawn at its own
resolution and every size is the same drawing.

Keep those strings in step with the master — `test/regress.js` compares them.
The O in the in-app wordmark is a clock without the folder
(`docs/design/logo/clock-mark.svg`) — still the first mark's clock; the
2026-10-27 redraw changed the launcher icon only. `pwa/icon-source.png` is the old
근무기록 · LOGGER wordmark bitmap; nothing reads it any more.

> The PWA head tags live in `PWA_HEAD` inside `build.py`, not in the app
> source. The build takes its outer template from the compiled bundle.

## Hosting — https, free, no account needed for the first one

**Netlify Drop** — https://app.netlify.com/drop — drag the `dist` *folder* onto
the page. You get `https://<name>.netlify.app` in about ten seconds. This is
what the existing `dainty-churros-fe875c.netlify.app` is; drop the new folder
on the same site to replace it and keep the URL.

Any of these work equally well, all free, all https:

| Host | How |
| --- | --- |
| Netlify Drop | drag `dist-v2/` onto app.netlify.com/drop |
| Cloudflare Pages | Create project → Direct upload → drag `dist-v2/` |
| GitHub Pages | push `dist-v2/` contents to a repo, Settings → Pages |
| Vercel | `npx vercel deploy --prod dist` |

Requirements the host must meet — all four do:

- **https.** Service workers refuse to run without it, and `localStorage` on a
  `file://` copy is unreliable.
- **`sw.js` served from the site root** (or the same folder as `index.html`), so
  its scope covers the app. Don't move it into a subfolder.
- No caching header longer than a few minutes on `index.html`. The service
  worker updates itself on the next launch after a redeploy; a hard CDN cache
  in front of it just delays that.

### Keep the domain stable

The worker's records live in `localStorage`, which is per-origin and does **not**
follow the app to a new URL. Moving hosts means every user **loses their logged
shifts unless they export first**.
So: pick the domain before handing the link around, and if you ever do move,
tell people to hit 설정 → 백업 → 파일로 내보내기 *before* they open the new URL,
then 파일에서 불러오기 once they are there.

## Backup

설정 → **백업 BACKUP**, at the bottom of the settings tab.

- **파일로 내보내기** writes `근무기록-YYYYMMDD.json` — settings, every day
  record, and any open session. On a phone it opens the OS share sheet
  (KakaoTalk, Drive, Files); the app never picks the destination. Where there is
  no share sheet it falls back to a normal download. In the APK neither exists:
  `FileShim` supplies a `navigator.share` backed by the Storage Access
  Framework, so the "내보냈습니다" message appears only after the bytes are on
  disk — see below.
- **파일에서 불러오기** parses the file and shows what it holds — how many days,
  when it was saved, and how many days are about to be destroyed — and waits for
  **덮어쓰기**. A file that is not a Work Log backup is refused by name and
  changes nothing.
- Nothing is uploaded at any point. There is no account and no sync.

### Why the APK needs extra code for this

A WebView has no file picker and no downloads unless the host activity supplies
them. Both directions of the backup failed silently without it:

- **불러오기** — `<input type="file">` does nothing at all unless the host
  implements `WebChromeClient.onShowFileChooser`. The tap is swallowed, no
  picker opens, and the page never hears back. `MainActivity` now implements it
  with `ACTION_OPEN_DOCUMENT` and type `*/*` (a backup that came back from Drive
  or KakaoTalk is often `octet-stream`, and filtering on `application/json`
  hides it — the page validates the contents anyway).
- **내보내기** — `navigator.share` does not exist in a WebView, so the page fell
  through to `<a download>`, and a `blob:` download dies unless a
  `DownloadListener` catches it. The page then said "내보냈습니다" over a file
  that had never been written. `FileShim` installs a real `navigator.share`
  whose promise resolves only once `ACTION_CREATE_DOCUMENT` has written the
  bytes, and rejects with `AbortError` if the sheet is dismissed — which the app
  already reads as "nothing happened". The `DownloadListener` remains as a
  fallback for a WebView too old for document-start scripts.

Neither uses a storage permission, and the app still holds no INTERNET
permission — SAF hands back a `content://` the worker picked themselves.

## The test APK (no hosting needed)

```
./build_apk.sh v2       ->  worklog-debug.apk         (sideload / testing)
./build_apk.sh          ->  worklog-frozen-debug.apk  (the frozen original)
./build_apk.sh release  ->  worklog-release.apk       (release APK)
./build_apk.sh bundle   ->  worklog-release.aab       (what the Play Store takes)
```

The first two are debug-signed and for your own phone. `release` and `bundle`
are the store route — see [Releasing to the Play Store](#releasing-to-the-play-store).

`worklog-debug.apk` is the whole app inside an Android package — no server, no
URL, works with the phone in airplane mode. Sideload it: send it to the phone,
open it, allow install from that source. Package id `app.worklog.punch`.

This is **not** the TWA described below. It exists so you can hold the app in
your hand before deciding anything about hosting. Differences that matter:

- The page is served by `WebViewAssetLoader` from
  `https://appassets.androidplatform.net`, not `file://`, so it is a real
  secure origin — localStorage persists and the service worker registers.
- Until 2026-10-26 a `BioShim` answered `navigator.credentials` with Android's
  `BiometricPrompt` for the fingerprint punch. Punching is one tap now, so the
  shim, the `USE_BIOMETRIC` permission and `androidx.biometric` are gone
  (CHANGELOG, eighty-eighth entry). The only bridge left is `FileShim`.
- The APK holds **no INTERNET permission**, and cloud backup and device
  transfer are both switched off in the manifest. The 백업 export is the only
  way data leaves the phone, and the worker picks where it goes.
- Debug-signed with `~/.android/debug.keystore`. Fine for sideloading and
  testing; the Play Store needs a release build signed with your own upload
  key — `./build_apk.sh bundle`, described below.

Records made in this APK are stored under the APK's own WebView origin. They
are **not** shared with the hosted site — a TWA would share them, a WebView
APK does not. Treat the two as separate installs.

### Putting it on a phone over USB

```sh
adb devices                            # must print "device"
adb install -r worklog-debug.apk       # -r upgrades in place
```

`-r` is the part that matters: it reinstalls over the existing app instead of
replacing it, so the WebView's localStorage — the worker's entire record — comes
through. Never uninstall first to "get a clean install"; that erases the data the
app exists to hold. Both variants share `applicationId app.worklog.punch`, so a v2
install upgrades a v1 one the same way.

If `adb devices` says **`unauthorized`**, the phone has not been told to trust this
computer. Unlock it and accept the "Allow USB debugging?" dialog (tick "Always allow"
so it stops asking). If no dialog appears, `adb kill-server && adb start-server` will
raise it again. `offline` usually means replugging the cable is enough. `adb` ships
at `~/Library/Android/sdk/platform-tools/adb` if it is not on PATH.

The debug keystore is per-machine. An APK built on a different computer is signed by
a different key and Android will refuse to upgrade over it — that install needs the
app removed first, which loses the records, so build and install from one machine.

**Confirm the phone is running what you just installed.** A successful `adb install`
only means the new assets are on disk; the service worker decides what the WebView
actually loads. Until 2026-08-13 it served the previous build on the first launch after
an update (see `V2.md` §6c). The check is one line — attach to the debug WebView and
ask the app what it has:

```sh
adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof app.worklog.punch)
curl -s http://127.0.0.1:9333/json/list        # gives you the WebSocket URL
```

then evaluate something only the new build has, e.g. a method on
`window.__dcRegistry.WorkLogApp.Logic.prototype` or a key in `Logic.STR`.

## Releasing to the Play Store

The APK route above is a real, shippable app — it does not need hosting, a URL,
or the TWA described further down. What it needs is a version number and your
own signing key.

### 1. Bump the version

```sh
./bump_version.sh --show     # what it is now
./bump_version.sh minor      # versionCode +1, 1.0 -> 1.1
```

`versionCode` is the only number the store orders releases by, and **it can
never be reused or reduced** — once a code is uploaded it is spent, even if you
delete the draft. `versionName` is the string a worker sees and means nothing to
that ordering.

The script now touches **two** files and moves them together:
`android/app/build.gradle` and the `static APP_VERSION` in
`WorkLogApp.v2.dc.html`, which is what the 근무내역서's `작성 도구` line prints.
That line exists so an inspector can tell which build calculated the money on
the paper, so it is only worth having while it matches the build — which is why
the two are no longer allowed to drift. If the second rewrite fails the script
exits non-zero and says which file is now ahead.

**Rebuild after bumping**, or the document keeps printing the old number:
`python3 build.py && python3 build.py v2`.

### 2. Make the upload key — once, and back it up

```sh
keytool -genkeypair -v -keystore ~/worklog-upload.jks \
  -alias worklog -keyalg RSA -keysize 4096 -validity 10000

cp android/keystore.properties.example android/keystore.properties
# then edit it to point at the .jks and hold the two passwords
```

`keystore.properties` and every `*.jks` are gitignored, and must stay that way.

**Back the key up somewhere that is not this laptop, before you ship anything.**
Play signs the delivered app with a key Google holds, but every update you
upload must be signed with *this* key. Lose it and you cannot update the app the
workers already have — they would have to uninstall, which **destroys their
records**, and install a fresh listing. There is no recovery process.

A CI machine can supply the same four values as `WORKLOG_STORE_FILE`,
`WORKLOG_STORE_PASSWORD`, `WORKLOG_KEY_ALIAS`, `WORKLOG_KEY_PASSWORD` instead of
a file.

### 3. Build the bundle

```sh
./build_apk.sh bundle     # -> worklog-release.aab
```

With no key configured this still builds, unsigned, and says so — an unsigned
artifact cannot be uploaded. With a key it prints the signing certificate.

Release builds differ from the debug ones in one way worth knowing: **they are
not debuggable**, so the `webview_devtools_remote` CDP trick in `CLAUDE.md` does
not work against them. Verify behaviour on a debug build; use the release build
to check it starts, punches, and exports.

### R8 is off, deliberately

`classes.dex` is larger than the app itself (~1.2 MB of assets) because
androidx's fragment and activity libraries come along. (androidx.biometric used
to as well; removing it took the release APK from 4.03 to 3.19 MB.)
Turning R8 on would cut a lot of that.

It is off anyway, because everything Java does here is reached **by name**:
WebView looks up `@JavascriptInterface` methods from a string, and
`FileShim` calls `window.WorkLogNative.<name>`. If R8 renames one of them,
백업 내보내기 silently stops reaching the disk. There are no tests over the
Java — the assertions are all on the web app — so nothing would catch it.

`android/app/proguard-rules.pro` already holds the keep rules. To turn it on,
set `minifyEnabled true` (and optionally `shrinkResources true`) in the release
buildType, then **verify on a real phone by hand**: punch in and out,
백업 내보내기, and 백업 불러오기.

### Before the first upload

- Data safety form: nothing is collected and nothing is shared. The missing
  `INTERNET` permission, `allowBackup=false` and `data_extraction_rules.xml` all
  back that up.
- Store listing needs a 512×512 icon and a 1024×500 feature graphic; neither is
  in this repo (`pwa/icon-512.png` is the app icon, not the listing one).
- A privacy policy URL is required even when nothing is collected.

## Wrapping the URL into an APK

Use a **Trusted Web Activity** (TWA), not a WebView wrapper. A TWA runs the page
in the user's real Chrome, so the service worker and localStorage behave
exactly as they do in the browser — and the APK shares
storage with the site, so anyone who used the web version keeps their records.

### Option A — PWABuilder, no local toolchain

1. https://www.pwabuilder.com → paste the https URL → **Start**.
2. **Package for stores → Android → Generate**. Defaults are fine; set
   package id to something like `app.worklog.punch`.
3. Download the zip. It contains `app-release-signed.apk` (sideload this),
   `app-release-bundle.aab` (Play Store), `signing.keystore` + `signing-key-info.txt`,
   and `assetlinks.json`.
4. **Keep the keystore.** Without it you can never ship an update to the same
   app id.

### Option B — Bubblewrap, local

```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://<your-host>/manifest.webmanifest
bubblewrap build          # → app-release-signed.apk
```

`bubblewrap init` asks for a signing key; let it generate one and keep the
`.keystore` file safe.

### Removing the URL bar (both options)

A TWA shows a Chrome address bar until the site proves it owns the app. Take the
`assetlinks.json` the tool produced and host it at:

```
https://<your-host>/.well-known/assetlinks.json
```

Netlify/Cloudflare/Vercel serve `dist-v2/.well-known/` as-is — put the file there
and re-deploy. Reinstall the APK; the bar disappears. Without this the app still
works, it just looks like a browser.

### Sideloading

`app-release-signed.apk` installs directly: send it over KakaoTalk, USB or a
download link. The phone will ask the user to allow installing from that source.
No Play Store account and no developer fee involved.

## iPhone — the iOS app

```sh
./build_ios.sh                 # build, install on the booted simulator, launch
./build_ios.sh build           # build only
./build_ios.sh "iPhone 17"     # boot that simulator first, then install
```

Same shape as the APK: `build.py` makes the site, the script copies it into
`ios/WorkLog/www`, and Xcode wraps it. `ios/WorkLog/www` is a **folder
reference** in the project, so whatever sits in that folder ships — the same
"delete your scratch pages first" rule that `dist-v2/` has. The bundle id is
`app.worklog.punch`, the same string the APK carries; they are separate
platforms and separate listings and share nothing but the name.

### Why there is an HTTP server inside an offline app

Every record the worker owns lives in localStorage, which is keyed by origin, and
the service worker needs a secure context. (Until 2026-10-26 the fingerprint
punch needed one too.) A WKWebView can load the page three ways and only one
satisfies both:

| | secure context | localStorage |
|---|---|---|
| `file://` | no | unreliable |
| custom scheme (`WKURLSchemeHandler`) | no — a scheme cannot be registered trustworthy | per-scheme |
| **`http://127.0.0.1:8787`** | **yes — loopback is trustworthy by spec** | **yes, stable** |

So `LocalServer.swift` serves the bundle on the loopback interface. It is the
iOS counterpart of the APK's `WebViewAssetLoader` origin
(`https://appassets.androidplatform.net`) and exists for exactly the same
reason. The app still talks to nothing: the listener is bound to loopback and
there is no outbound request anywhere in the codebase.

**The port is fixed at 8787 and must stay fixed.** The port is part of the
origin. A port picked at random, or a fallback to "the next free one", hands
the page a different localStorage on every launch and the worker's entire
history disappears with nothing raised. `LocalServer.start()` retries the same
port rather than moving; the only two outcomes are 8787 or a visible error.

### The bridge

`ios/WorkLog/Shims.swift` is the iOS half of `android/…/FileShim.java`, and it
keeps the same promise: `WorkLogApp.v2.dc.html` is not
modified for the app and does not know it is inside one. WKWebView answers
`postMessage` with a real Promise (`WKScriptMessageHandlerWithReply`), so the
whole pending-map-and-`settle()` half of the Android shim is simply absent.

- **지문 — removed 2026-10-26.** A Face ID shim backed by `LAContext` answered
  `navigator.credentials` for the fingerprint punch. Punching is one tap now,
  so the shim, `LocalAuthentication` and `NSFaceIDUsageDescription` are gone
  (CHANGELOG, eighty-eighth entry).
- **백업 내보내기.** Same guard as Android — a WebView with a working Web Share
  keeps it, and iOS has one, so the shim installs only where it is missing.
  Restoring needs no host code at all: `<input type="file">` opens the document
  picker in WKWebView on its own, the one thing iOS gives free that Android
  charged for.

`navigator.serviceWorker` does not exist in WKWebView. That costs nothing —
the site is served from the bundle, so it is already offline — and the
`'serviceWorker' in navigator` guard in `build.py` means nothing throws. It
also means the "the service worker is hiding your build" trap does not exist
on iOS.

### Checking it on the simulator

The debug build prints its own origin once per launch, which is the fastest way
to know the page got what it needs:

```
[worklog] {"origin":"http://127.0.0.1:8787","secure":true,"store":true,…}
```

```sh
xcrun simctl spawn booted log stream --style compact \
  --predicate 'eventMessage CONTAINS "[worklog]"'
```

### Onto a real iPhone

Open `ios/WorkLog.xcodeproj`, pick your team under Signing & Capabilities, and
Run. The signature is the only device-specific thing in the project — there is
no entitlement to request, because the app uses no capability that needs one:
no push, no iCloud, no associated domains, no network client. (`Info.plist`
carried `NSFaceIDUsageDescription` for the fingerprint punch until 2026-10-26;
the app no longer uses LocalAuthentication, so it is gone.)

## What did not change

The wage engine is untouched — `calc()`, `snapIn()`, `snapOut()`, `detectShift()`,
`period()`, `legalGap()` and every rate are byte-for-byte the handoff versions.
The only edits to `WorkLogApp.v2.dc.html` are the punch pad's gesture and the copy
on the pad itself.
