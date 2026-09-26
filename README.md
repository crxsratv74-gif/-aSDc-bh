# Pella Render Recorder v20.6

Wispbyte-focused build with Render-optimized Playwright Chromium headless-shell installation to reduce disk usage.

## Wispbyte
Use Node.js 22.

Startup command can remain Wispbyte's default command that runs `npm install` and then `node index.js`.
`package.json` now has a `postinstall` script that runs:

`PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`

The server also auto-installs the Chromium headless shell at first recording attempt if the browser binary is missing.

The app binds to `0.0.0.0` and prefers `SERVER_PORT`, then `PORT`, then 10896.

## Render
Build:
`npm install && PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`

Start:
`npm start`

Health:
`/health`

## Render setup

Build command:
```text
npm install && PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
```

Start command:
```text
npm start
```

Health check:
```text
/health
```

Render uses `PORT=10000`. The application binds to `0.0.0.0`. The browser is installed at build time, not during recording.


Render Node version: 22.23.2 (.node-version).

## UI state effect
When recording is active, the full page gets a blue/cyan animated Edge Glow and the single action button becomes a red Stop Recording button in the same position. When recording stops, the glow and red state turn off and the button returns to Start Recording.

## v20.12 interactive Live Screen Preview

While a recording is running, the Live Screen Preview is interactive. Click or tap the preview to send the input to the same Playwright browser page being recorded. Mouse-wheel/trackpad scrolling is also forwarded.

The preview uses screenshot frames, so it is not a full 60 FPS remote-desktop stream; input is sent directly to the live page while the next preview frame appears.

Keep the recorder panel private when using interactive control because anyone who can access the panel can interact with the currently open webpage.

## v20.14 stability update
- Keeps the interactive Live Screen Preview, but reduces screenshot frequency and JPEG quality at high recording resolutions to lower CPU/memory pressure.
- Serializes preview click/touch/wheel events so they do not race with each other or with browser-context shutdown.
- Disables live input immediately after Stop is requested, preventing Stop/context-close races.
- Relaunches Chromium automatically for the next URL if the browser process disconnects.
- Keeps the existing UI, B2 features, recording format, URL queue, and quality choices unchanged.

## v20.15 Live Preview Control

The Live Screen Preview now has a **Touch / Click Control** switch.

- **ON**: click, tap, right-click, and mouse-wheel/trackpad interaction are forwarded to the active hosted Chromium page.
- **OFF**: the preview is view-only and does not send click, tap, or wheel input to Chromium.
- The switch defaults to **ON** to preserve the previous interactive-preview behavior.

This is a UI-level interaction toggle; recording behavior and the existing preview/recording features are unchanged.


## v20.16 automatic daily schedule
The panel now supports a daily automatic recording window. Example: enable the schedule, set Start time to `05:30`, End time to `06:00`, choose your local IANA time zone such as `Asia/Kolkata`, and save it. The service reads the saved `urls.txt` list, starts automatically at the start time, and requests a safe recording stop at the end time.

The schedule is a daily local-time window. Start and end can cross midnight, for example `23:00` to `01:00`. Manual recording remains available and is unchanged.
