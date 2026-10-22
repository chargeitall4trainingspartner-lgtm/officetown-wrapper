# officetown-wrapper

An Electron wrapper for [`officetown.app`](https://www.officetown.app) that sets `backgroundThrottling: false`, so Chromium's background-tab throttling — the trigger that detaches the app's auto-scroll pin when the window is minimized — does not apply. Local, single-machine, source-run.

---

## Requirements

- **Node.js 20.11 – 24.x**
- **~150 MB network** on first install (the pinned Electron build downloads from the Electron CDN)
- **~400 MB disk** for `node_modules`

No git required, no global installs, no binaries to trust beyond Node and Electron themselves.

---

## Install (for non-technical users)

You do not need to know how to code. Copy and paste the commands exactly as shown.

### 1. Install Node.js 24

**Windows 10/11:** Open **PowerShell** (Start -> type powershell -> Enter) and run:
```
winget install OpenJS.NodeJS.LTS
```
Click **Yes** if asked. Wait for "Successfully installed".

**macOS:** Open **Terminal** (Cmd+Space -> type Terminal -> Enter) and run:
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Follow the prompts (press Enter when asked). Then run:
```
brew install node
```

**Linux:** Open your terminal and run:
```
curl -fsSL https://fnm.vercel.app/install | bash
```
Close and reopen the terminal, then run:
```
fnm install 24
fnm use 24
```

### 2. Download the project

On the GitHub page, click the green **Code** button -> **Download ZIP**. Extract the ZIP (right-click -> Extract All on Windows, or double-click on macOS/Linux). You will get a folder named officetown-wrapper-main.

### 3. Open a terminal in that folder

**Windows:** Open the extracted folder in File Explorer. Click the address bar, type powershell, press Enter.

**macOS:** Right-click the folder in Finder -> **Services -> New Terminal at Folder**. (If missing, open Terminal, type cd followed by a space, drag the folder into the window, press Enter.)

**Linux:** Right-click inside the folder -> **Open in Terminal**.

### 4. Install dependencies

In the terminal, run:
```
npm ci
```
Wait for it to finish. If you see electron binary missing, run:
```
npm install-scripts approve electron
npm ci
```

### 5. Start the app

```
npm start
```
The app window opens. To use it again later, repeat steps 3 and 5 (you do not need npm ci again).

### Warnings you may see

- **Windows Firewall / antivirus:** Click **Allow access** or **Allow**. This is normal - the app needs internet access.
- **macOS "Are you sure you want to open it?":** Click **Open**. This appears once and is not a virus warning.
- You will not see "unknown publisher" or "unverified developer" blocks with this method.

---

## Run

```sh
npm start
```

Expected terminal output:

```
[wrapper] unknown - electron 35.7.5 - win32-x64
[win] focus
[wrapper] auto-scroll provenance patch injected
```

If `build-info.json` is absent (it's gitignored), the `[wrapper] …` line is skipped — everything else still works.

---

## Verify it's active

Open DevTools (`Ctrl+Shift+I`), select the `top` context in the Console, and run:

```js
window.__AUTO_SCROLL_PROVENANCE_PATCHED__   // → true
window.__wrapperScrollProvenance()          // → { programmaticUntil, lastGestureAt, now }
```

Then minimize the window and restore it. `[win] minimize` / `[win] restore` should print, and the view should stay pinned to the last message.

Run the drift guard any time:

```sh
npm run verify
```

It checks the Node version against `engines`, the lockfile version, the installed Electron against the exact pin, the Electron binary's presence, and that `main.js` and the patch parse.

---

## Project layout

```
officetown-wrapper/
├── main.js                       # BrowserWindow, origin guard, patch injection
├── patches/
│   └── auto-scroll-provenance.js # observer patch: tags scroll events with provenance
├── scripts/
│   └── verify.js                 # postinstall drift guard
├── package.json                  # exact pin, engines, allowScripts, verify/postinstall
├── package-lock.json             # committed — the stability anchor
├── build-info.json               # gitignored; provenance for the startup log
├── .nvmrc                        # "24"
└── .gitignore                    # node_modules/, build-info.json, .fresh-profile/
```

**`main.js`** creates the window with `backgroundThrottling: false`, logs `minimize`/`restore`/`hide`/`show`/`blur`/`focus`, injects the provenance patch on `did-finish-load` **only when the current origin is `officetown.app` or `www.officetown.app`**, and routes external `http(s)` popups to the system browser. It contains no OAuth bridge — see Limitations.

**`patches/auto-scroll-provenance.js`** is an observer. It tags each `scroll` event with `{programmatic, userGesture}` and exposes `window.__wrapperScrollProvenance()`. It does not change app behavior.

---

## What works, and what was verified

| Item | State |
|---|---|
| Loads `https://www.officetown.app` | ✅ observed |
| Provenance patch injects in the top frame | ✅ observed |
| Origin guard skips `accounts.google.com` / `accounts.google.de`, re-injects on return | ✅ observed |
| Google login via full-window redirect (Supabase → Google → back) | ✅ observed |
| Session persists across restart | ✅ observed |
| `npm run verify` passes clean | ✅ observed |
| `backgroundThrottling: false` eliminates the 60 s stall | ⚠️ **not measured on this build** — see below |
| Stage 2 (large message burst while minimized) | ⚠️ **not tested** |

**On the throttling numbers.** The original measurement — ~60,005 ms stalls in stock Edge versus a 614 ms max gap under the wrapper — was taken on **Electron 35.1.5**. This checkout is pinned to **35.7.5**. The flag is unchanged and behaves identically across the 35.x branch, but if you want the numbers to be true for *this* build, run the minimize test yourself: launch, scroll to bottom, minimize, wait five minutes, restore. Confirm the view is still pinned.

**On Stage 2.** The only remaining open question: can a large message burst while minimized defeat the pin? Answering it requires a second account in a regular browser, 100+ messages, and five idle minutes. Until then, this is documented as an open question, not a pass or a failure.

---

## Troubleshooting

**Blank window, terminal shows `render-process-gone { reason: 'launch-failed', exitCode: 18 }`.**

Electron's Chromium sandbox could not start the renderer. This is a known Windows issue, usually one of: running the shell as Administrator, Memory Integrity / Core Isolation, or third-party anti-virus blocking `node_modules\electron\dist\electron.exe`. In order:

1. Confirm the shell is **not** elevated:
   ```powershell
   ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")
   ```
   `True` → relaunch PowerShell normally and try again.
2. `npx electron . --disable-gpu-sandbox` — narrowest relaxation; leaves the renderer sandbox on.
3. `npx electron . --no-sandbox` — disables the renderer sandbox for every renderer. Use it to *confirm* the diagnosis, not as the permanent config.
4. Check Windows Security → Device security → Core isolation, and whitelist the Electron binary in any anti-virus.

**`npm ci` fails with `missing preload.js`.** This repo has no preload and `scripts/verify.js` does not expect one. If you see this, you're running an older `verify.js` — re-pull or delete `node_modules` and retry.

**`npm audit` reports 6 vulnerabilities.** They are dev-only and install-time-only: the `@electron/get → got` download toolchain. They do not ship in the wrapper and are not reachable at runtime. **Do not run `npm audit fix --force`** — it resolves to a `got` major that breaks the Electron binary download, or bumps Electron off the exact pin.

**`npm install` (not `ci`) drifts Electron off the pin.** Never use plain `npm install` on this repo. `npm ci` installs the lockfile exactly; anything else can re-resolve.

---

## Known limitations

1. **No OAuth bridge.** `officetown.app` authenticates via Supabase (`zcdmwaatpyddvblnsglv.supabase.co`) and the flow is a **full-window navigation**: the main window goes to `accounts.google.com` (or a regional TLD), Google redirects to Supabase, Supabase redirects back to `officetown.app`, and the session is established in that round-trip. Because no popup is opened, `setWindowOpenHandler` never fires, and any loopback bridge would be unreachable. Login works; the wrapper's only role is the origin guard that skips the patch on Google/Supabase pages.

2. **No auto-update.** This is a local checkout. `git pull` (if it is a git checkout) followed by `npm ci` is the update path. There is no background updater, no Squirrel, no `electron-updater`.

3. **`window.__wrapper` does not exist.** There is no preload, no `contextBridge`, no IPC surface. The only renderer-side globals the wrapper adds are `__AUTO_SCROLL_PROVENANCE_PATCHED__` and `__wrapperScrollProvenance`.

4. **The provenance patch is an observer, not an intervention.** If a large burst ever does detach the view, the patch records the provenance of the scroll but does not prevent the detach. Promoting it to an intervention means locating the app's detach decision and short-circuiting it on `programmatic && !userGesture` — not done, because the defect it would guard against has not been observed.

5. **No `will-navigate` lockdown.** The main window is free to navigate anywhere. This is *why login works* — the OAuth flow needs the main frame to reach `accounts.google.com` and Supabase. Adding a lockdown requires allowlisting `officetown.app`, `www.officetown.app`, `*.supabase.co`, and `accounts.google.*`, or login breaks.

6. **`allowScripts` is npm 11+.** On older npm the field is ignored; the one-time `npm install-scripts approve electron` may be needed manually on a fresh clone.

---

## Testing status

| Stage | Result |
|---|---|
| Wrapper loads the live site, patch injects, origin guard behaves, login works, session persists | **Confirmed by observation** |
| Background throttling eliminated (60 s stall → sub-second gaps) | **Not measured on 35.7.5** — originally measured it on 35.1.5 |
| Large message burst while minimized (Stage 2) | **Not tested** — open question |
| Google OAuth via loopback bridge | **Not applicable** — the app uses full-window redirect, the bridge is removed |

The wrapper is doing the job it was built for on this machine. The two "not measured / not tested" rows are the honest boundary of the evidence; neither blocks daily use.
