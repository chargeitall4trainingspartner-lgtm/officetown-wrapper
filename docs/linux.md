# Linux notes

Practical, verified guidance for running `officetown-wrapper` on Linux from source.
Packaging (`deb`/`rpm`/`pacman` artifacts) is **not** covered here — the project is
source-run only. Every package name below was probed against the distro's own
package index; see "How these commands were verified" at the end of the section.

## 1. Runtime dependencies and install commands

Electron 35 links against the same native libraries on every Linux distro. The
binary names differ; the libraries do not.

| Library        | Debian 13 (trixie) | Ubuntu 22.04 (jammy) | Ubuntu 24.04 (noble) | Fedora            | Arch                 |
|----------------|--------------------|----------------------|----------------------|-------------------|----------------------|
| ALSA           | `libasound2t64`    | `libasound2`         | `libasound2t64`      | `alsa-lib`        | `alsa-lib`           |
| GBM            | `libgbm1`          | `libgbm1`            | `libgbm1`            | `mesa-libgbm`     | `mesa`¹              |
| GTK3           | `libgtk-3-0t64`    | `libgtk-3-0`         | `libgtk-3-0t64`      | `gtk3`            | `gtk3`               |
| NSS            | `libnss3`          | `libnss3`            | `libnss3`            | `nss`             | `nss`                |
| XScrnSaver     | `libxss1`          | `libxss1`            | `libxss1`            | `libXScrnSaver`   | `libxss`             |
| libnotify      | `libnotify4`²      | `libnotify4`²        | `libnotify4`²        | `libnotify`       | `libnotify`          |
| libsecret      | `libsecret-1-0`    | `libsecret-1-0`      | `libsecret-1-0`      | `libsecret`       | `libsecret`          |
| xdg-utils      | `xdg-utils`        | `xdg-utils`          | `xdg-utils`          | `xdg-utils`       | `xdg-utils`          |

¹ Arch ships `libgbm` inside the `mesa` package — there is no standalone `libgbm`.
² `libnotify4` is **not** part of the 64-bit `t64` transition, on any Debian/Ubuntu
  release. Do not substitute `libnotify4t64`; it does not exist.

### Install commands

Debian 13 (trixie):

    sudo apt-get update
    sudo apt-get install -y \
      libasound2t64 libgbm1 libgtk-3-0t64 libnss3 \
      libxss1 libnotify4 libsecret-1-0 xdg-utils

Ubuntu 22.04 (jammy):

    sudo apt-get update
    sudo apt-get install -y \
      libasound2 libgbm1 libgtk-3-0 libnss3 \
      libxss1 libnotify4 libsecret-1-0 xdg-utils

Ubuntu 24.04 (noble):

    sudo apt-get update
    sudo apt-get install -y \
      libasound2t64 libgbm1 libgtk-3-0t64 libnss3 \
      libxss1 libnotify4 libsecret-1-0 xdg-utils

Fedora:

    sudo dnf install -y \
      alsa-lib mesa-libgbm gtk3 nss \
      libXScrnSaver libnotify libsecret xdg-utils

Arch:

    sudo pacman -S --needed \
      alsa-lib mesa gtk3 nss \
      libxss libnotify libsecret xdg-utils

### How these commands were verified

Package names were verified against distro package indexes directly, **not**
copied from Electron's generic docs and **not** inferred from a `t64` pattern
(the `libnotify4` and `libgbm1` cases prove the pattern would have produced
wrong answers).

- **Debian 13 (trixie)** — `qa.debian.org/madison.php`, suite-scoped to `trixie`,
  one query per binary name. Results retained on disk as `debiancheck-output.txt`.
- **Ubuntu 22.04 / 24.04** — Launchpad `getPublishedBinaries`, suite-scoped to
  `jammy` and `noble`. Results retained as `bincheck-output.txt`.
- **Fedora** — `packages.fedoraproject.org/pkgs/<srpm>/<rpm>/`. Retained as
  `bincheck-output.txt`.
- **Arch** — `archlinux.org/packages/search/json/?name=`. Retained as
  `bincheck-output.txt`.

A CI matrix installs these packages inside `ubuntu:22.04`, `ubuntu:24.04`,
`fedora:latest`, and `archlinux:latest` containers. Run
[39748467104 attempt 2](https://github.com/chargeitall4trainingspartner-lgtm/officetown-wrapper/actions/runs/39748467104)
(head `d454240`) finished green: all four jobs passed, including the smoke
step. This section is therefore *verified by install-and-run* as well as by
package-index probe. (Attempt 1 failed only on `ubuntu:22.04` with an upstream
mirror size mismatch on `jammy-updates/main`; it did not reproduce on rerun.)

## 2. Chromium sandbox

Electron runs Chromium, which needs a working sandbox. There are three ways to
satisfy it, in order of preference.

### 2.1 Check whether user namespaces work

Unprivileged user namespaces are the modern path. Test with:

    unshare -Ur true && echo "userns OK"

- Exit code `0` → the sandbox will work; nothing further to do.
- `Operation not permitted` / `Permission denied` → continue to §2.2.

On Ubuntu 24.04+ and Debian 13, AppArmor restricts unprivileged user namespaces
by default (`kernel.apparmor_restrict_unprivileged_userns=1`). The `unshare`
test above is authoritative — do **not** infer from distro version alone.

### 2.2 Options, in order of preference

**A — grant userns via AppArmor profile** (preferred when the app is packaged).
Ship an AppArmor profile that allows the app to create unprivileged user
namespaces. The profile must attach to **both** the launcher script **and** the
`*.electron-bin` binary — electron-builder's stock profile only covers the
launcher, which is not enough. From source this means the profile targets
`node_modules/electron/dist/electron` and `node_modules/electron/dist/chrome-sandbox`.

**B — setuid sandbox helper** (works today, source-run). Make Chromium's setuid
helper root-owned and setuid:

    sudo chown root:root node_modules/electron/dist/chrome-sandbox
    sudo chmod 4755 node_modules/electron/dist/chrome-sandbox

This is per-install. `npm ci` / `npm install` can reset the helper's mode, so
re-apply after any dependency change. When packaging lands, this is the same
step an `afterInstall` hook must perform explicitly — a custom `afterInstall`
**replaces** electron-builder's default post-install, and without an explicit
`chmod 4755` the `.deb` installs `chrome-sandbox` as `0755` and aborts. See §5.

**C — `--no-sandbox`** (last resort). Disables Chromium's sandbox entirely. Use
only when A and B are both impossible, and state the trade-off when you do. Do
**not** make this the default in scripts, launchers, or CI.

### 2.3 What not to do

`disable-gpu-sandbox` is a **Windows-only** workaround in `main.js` (see known
bug #1 in the project's issue tracker). It has nothing to do with the Linux
Chromium sandbox and must not appear in Linux launch commands, scripts, or
documentation. If you see it applied on Linux, that is the wrapper's bug, not a
fix for your environment.

## 3. Wayland

Electron 35 does not auto-select the Wayland backend. On a Wayland session
(`XDG_SESSION_TYPE=wayland` and `WAYLAND_DISPLAY` set), Electron defaults to
XWayland unless told otherwise.

Pass the platform hint at launch:

    npx electron . --ozone-platform-hint=auto

or set it via the environment:

    ELECTRON_OZONE_PLATFORM_HINT=auto npx electron .

`auto` picks Wayland when available and falls back to X11 otherwise. The
wrapper's `main.js` does not set this for you; it is a launch-time choice.

### 3.1 "Will this flag expire?"

Yes. Newer Electron releases default the hint to `auto`, at which point the
flag becomes a no-op. The pinned version in this repo is Electron 35, so the
flag is still required today. When the pin moves forward, revisit this section
and drop the flag if the default already covers it.

### 3.2 What not to do

Do not reach for `disable-gpu-sandbox` to "fix" Wayland. It is a Windows-only
GPU workaround (known bug #1) and has nothing to do with Wayland vs XWayland
selection. If Wayland rendering is broken, the answer is the ozone hint, a
driver update, or falling back to XWayland — not disabling the GPU sandbox.

### 3.3 Confirming which backend is active

Launch the app on a Wayland session and open `chrome://gpu` — the "Graphics
Feature Status" block reports whether the renderer is on Wayland or X11. If it
says X11 on a Wayland session, the hint did not take effect; check that the
env var or flag reached the Electron process and not just the shell that
launched it.

## 4. Troubleshooting

Symptom → cause → fix. Cross-references point at the section of this file that
explains the fix in full.

| Symptom | Cause | Fix |
|---|---|---|
| `The SUID sandbox helper binary was found, but is not configured correctly` | `chrome-sandbox` is not root-owned or not setuid | §2.2 B — `chown root:root` + `chmod 4755` on `node_modules/electron/dist/chrome-sandbox` |
| `FATAL:setuid_sandbox_host.cc ... Failed to move to new namespace` | Unprivileged user namespaces blocked (AppArmor on Ubuntu 24.04+ / Debian 13), and no setuid helper | §2.1 to confirm, then §2.2 A or B |
| `unshare: unshare failed: Operation not permitted` | Same as above — userns restricted by kernel/AppArmor | §2.2 A or B |
| `error while loading shared libraries: libX.so.N: cannot open shared object file` | Missing native dependency from §1 | `ldd node_modules/electron/dist/electron \| grep 'not found'` to list all missing at once, then install the matching §1 package |
| `libasound2 : Depends: libasound2t64` or install of `libasound2` fails on Ubuntu 24.04 / Debian 13 | The `t64` transition renamed the binary | Use `libasound2t64` (see §1 table). Same story for `libgtk-3-0` → `libgtk-3-0t64`. `libnotify4` and `libgbm1` are **not** t64-split — do not substitute `*t64` |
| App launches to a blank window on a Wayland session | Electron 35 fell back to XWayland or GPU init failed | §3 — set `--ozone-platform-hint=auto` or `ELECTRON_OZONE_PLATFORM_HINT=auto` |
| `Failed to load module "canberra-gtk-module"` (warning, app still runs) | Optional GTK audio-events module not installed | Cosmetic; safe to ignore. Not in §1 because it does not affect the app |
| `Cannot open display: ` or `Gtk-WARNING **: cannot open display:` | No `DISPLAY` and no `WAYLAND_DISPLAY` in the environment — common over SSH or in CI | Set `DISPLAY=:0` (or forward X) on X11, or `WAYLAND_DISPLAY=wayland-0` on Wayland. In CI, wrap with `xvfb-run -a` |
| Window minimizes but the auto-scroll pin detaches | `backgroundThrottling` not actually disabled — either the wrapper is not the launcher, or an older build is running | Confirm you are running this repo's `main.js` (it sets `backgroundThrottling: false`). This is the wrapper's whole reason for existing; if it reproduces on the pinned Electron 35, file a bug with `npx electron --version` output |

Two entries deserve emphasis because they are the most common wrong turns:

- Reaching for `disable-gpu-sandbox` when the error is a **sandbox permission**
  problem. That flag does not fix sandbox failures and is Windows-only in this
  repo (see §2.3). The fix is §2.2.
- Reaching for `libnotify4t64` / `libgbm1t64` because the t64 transition exists.
  Neither package is t64-split on Debian 13, Ubuntu 22.04, or Ubuntu 24.04.
  See the §1 table and its footnotes.
