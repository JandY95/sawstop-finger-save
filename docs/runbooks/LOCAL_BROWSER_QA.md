# LOCAL_BROWSER_QA

## Purpose
- Provide two safe local browser QA paths for the server-only development host.
- Keep customer form browser checks local to `127.0.0.1:8787`.
- Do not deploy, submit the live form, complete Turnstile, upload files, or write Queue/R2/Notion data as part of this runbook.

## Automated Headless QA

Run from the repository root:

```bash
npm run check:customer-click-layout-stability
```

This command starts `npm run dev:fully-local -- --host 127.0.0.1 --port 8787` when no local server is already responding, then uses Playwright Chromium against:

```text
http://127.0.0.1:8787/
```

The check exercises click/focus interactions only. It does not click `접수하기`, does not complete Turnstile, does not upload files, and fails if the browser requests `/submit`.

## Server-Local Playwright Setup

Run this setup in an interactive server terminal, not through Hermes chat. The dependency step uses `sudo`, and Hermes cannot receive or enter the local sudo password in chat.

```bash
cd /srv/harness-lab/repos/sawstop-finger-save
npm install
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 sudo -E npx playwright install-deps chromium
```

On an Ubuntu 26.04 host, Playwright may not have a native dependency mapping yet. The `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` prefix asks Playwright to use the Ubuntu 24.04 Chromium/dependency profile until native support is available.

If `install-deps` cannot complete and you need the explicit package fallback, run this in the same interactive server terminal:

```bash
cd /srv/harness-lab/repos/sawstop-finger-save
sudo apt-get update
sudo apt-get install -y \
  at-spi2-common \
  fontconfig \
  fonts-freefont-ttf \
  fonts-ipafont-gothic \
  fonts-liberation \
  fonts-tlwg-loma-otf \
  fonts-unifont \
  fonts-wqy-zenhei \
  libasound2-data \
  libasound2t64 \
  libatk-bridge2.0-0t64 \
  libatk1.0-0t64 \
  libatspi2.0-0t64 \
  libavahi-client3 \
  libavahi-common-data \
  libavahi-common3 \
  libcairo2 \
  libcups2t64 \
  libdatrie1 \
  libfontenc1 \
  libgraphite2-3 \
  libharfbuzz0b \
  libpango-1.0-0 \
  libpixman-1-0 \
  libthai-data \
  libthai0 \
  libxcb-render0 \
  libxdamage1 \
  libxfont2 \
  libxres1 \
  x11-xkb-utils \
  xfonts-cyrillic \
  xfonts-encodings \
  xfonts-scalable \
  xfonts-utils \
  xserver-common \
  xvfb
```

Then install/refresh the Chromium browser binary:

```bash
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium
```

The automated script sets the same override automatically on Ubuntu 26.04. If Chromium launch still reports missing shared libraries or host dependencies, treat automated browser QA as HOLD until the server-local dependency setup above succeeds.

Artifacts are written under:

```text
diagnostics/playwright/customer-click-layout-stability/
```

That diagnostics path is gitignored.

## Manual Browser QA Through SSH Tunnel

On the server, from the repository root, start the local Worker bound to loopback:

```bash
npm run dev:fully-local -- --host 127.0.0.1 --port 8787
```

On the user PC, open a tunnel to the server:

```bash
ssh -N -L 8787:127.0.0.1:8787 jun@jandy
```

Then open this URL in the user PC browser:

```text
http://127.0.0.1:8787
```

Use this path for visual and interaction checks that need a normal desktop browser while keeping the Worker reachable only through SSH.

## Tailscale Alternative

Prefer the SSH tunnel for routine QA because the Worker stays bound to server loopback.

If Tailscale is used instead, keep access limited to the private Tailscale network and ACLs. Binding Wrangler to `--host 0.0.0.0` exposes the local dev server beyond loopback; use it only with a deliberate private-network boundary and never as a public test endpoint. Local dev may read `.dev.vars` and other development bindings.

## Boundaries

- Do not deploy.
- Do not click the submit button or `접수하기`.
- Do not submit the live form.
- Do not complete or bypass Turnstile.
- Do not upload customer or admin files.
- Do not use admin upload.
- Do not write Queue, R2, Notion, GitHub, or Core data.
- Do not print secrets or `.dev.vars` values.
