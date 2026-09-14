# Third-party notices

근무기록 Work Log ships as one self-contained file. Everything it needs is inside
that file, including the code below, so these notices travel with the app rather
than with a package manifest.

Checked against the shipping bundle by unpacking the
`<script type="__bundler/manifest">` island in `dist-v2/index.html`, base64-decoding
and gunzipping each part, and reading the licence banners actually present. Re-check
the same way after a dependency change — a `grep` of the built file proves nothing,
because the parts are compressed binary in there.

---

## React, React DOM

The bundle carries the minified React and React DOM production builds. Their
`@license` banners survive the build and read:

> @license React · react.production.min.js · Copyright (c) Facebook, Inc. and its
> affiliates. · This source code is licensed under the MIT license found in the
> LICENSE file in the root directory of this source tree.

That banner points at a `LICENSE` file that does **not** travel with the bundle, so
the full text of the MIT licence it refers to is reproduced here. This is the whole
reason this file exists: the notice alone is the customary practice, but MIT asks for
the permission notice too, and the app is distributed as a single file with no
package tree to point at.

```
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Android libraries (APK only)

The APK links four androidx libraries, declared in `android/app/build.gradle`:

| Library | Version | Licence |
|---|---|---|
| `androidx.webkit:webkit` | 1.14.0 | Apache-2.0 |
| `androidx.biometric:biometric` | 1.1.0 | Apache-2.0 |
| `androidx.activity:activity` | 1.9.3 | Apache-2.0 |
| `androidx.fragment:fragment` | 1.8.5 | Apache-2.0 |

They are not vendored in this repository — Gradle resolves them at build time — but
they **are** compiled into `classes.dex` and therefore redistributed inside the APK,
which is why they are listed here rather than treated as build-time-only. Apache-2.0
requires that its licence text and any NOTICE travel with a binary that contains the
work; a copy of the Apache License 2.0 is at
<https://www.apache.org/licenses/LICENSE-2.0>.

None of these is part of the web build at `/logger/`, which is the single HTML file
and nothing else.

## Fonts

No font file is embedded. The app asks for the system UI font
(`-apple-system, system-ui`) and falls back to whatever the device provides. A
Google Fonts stylesheet URL appears in the bundler manifest, but the bundler inlines
it at build time — the shipping app makes no request for it. The Android package
holds no `INTERNET` permission and could not fetch one in any case.
