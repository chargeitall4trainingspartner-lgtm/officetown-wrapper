# Contributing

Thanks for looking. This is a small, deliberately narrow project: an Electron
wrapper around `officetown.app` that exists to disable Chromium's background
throttling. Changes are welcome if they keep it that way.

## Before you start

- **Node.js 20.11 – 24.x** (`node -v`)
- Run `npm ci` after cloning — never `npm install`. The repo pins Electron
  exactly and the lockfile is the source of truth.

## What belongs here

- Fixes to the wrapper itself: `main.js`, `patches/auto-scroll-provenance.js`,
  `scripts/verify.js`
- Corrections to the README, especially the troubleshooting section
- Documentation of new failure modes (Windows sandbox, Linux SUID, proxy/CDN issues)

## What does not belong here

- **The app itself.** `officetown.app` is not this project; bugs in the site
  should go to whoever runs it.
- **Bundled binaries, installers, or auto-updaters.** This repo is source-run by
  design. See "Known limitations" in the README.
- **The loopback OAuth bridge.** It was removed because the app uses a
  full-window redirect flow, not a popup. See README limitation #1.

## Before opening a PR

1. Run `npm run verify` — it must print `[verify] OK`.
2. Run `npm start` and confirm the site loads and the terminal prints
   `[wrapper] auto-scroll provenance patch injected`.
3. If you touched `main.js` or the patch, minimize and restore the window once
   to confirm `[win] minimize` / `[win] restore` still print and the view
   stays pinned.

## Reporting a bug

Include:

- OS and version (`win32-x64`, `darwin-arm64`, `linux-x64`)
- `node -v` and the `[wrapper] ...` startup line
- The full terminal output from launch to the point of failure
- Whether you're running as Administrator / root, and whether anti-virus or
  Memory Integrity is on (Windows) — these are the two most common causes of a
  blank window.

## License

By contributing, you agree your changes are licensed under the MIT License
(see `LICENSE`).
