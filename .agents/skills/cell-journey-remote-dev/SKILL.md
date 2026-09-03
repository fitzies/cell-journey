---
name: cell-journey-remote-dev
description: Run, expose, preview, or debug Cell Journey's Expo, Metro, Next.js, and related development servers on the headless Forge Linux host over Tailscale. Use whenever an agent starts a dev server, tests the mobile app on a device, opens a web preview, reports a local URL, or troubleshoots connectivity in this repository.
---

# Cell Journey remote development

Cell Journey runs on the headless Linux host `forge`. The user works from a Mac and may test Expo on a physical iOS or Android device. These clients reach Forge through the user's private Tailscale network. A Forge `localhost` URL points at the wrong machine when opened on a client.

Also follow the global `forge-preview` skill for browser previews. This skill adds the Expo and project-specific rules below.

## Establish the route first

Before starting or changing a server:

1. Run `hostname`, `tailscale ip -4`, `tailscale status`, `tailscale serve status`, and `ss -ltnp` for the intended port.
2. Confirm that Forge and the client device are connected to the same tailnet. A physical phone must run Tailscale too when it is not otherwise on a network that can reach Forge.
3. Reuse a working listener or Tailscale Serve mapping. Do not stop a process, replace a mapping, change firewall rules, start Funnel, or create a public Expo tunnel without the user's permission.
4. Prefer an exact Tailscale-IP bind. If a tool cannot bind to one address, bind it to loopback and use an existing tailnet-only Tailscale Serve TCP forward.
5. Never give the user `localhost`, `127.0.0.1`, or `0.0.0.0` as the URL to open.

Treat Tailscale IPs and Serve mappings as runtime state. Discover them each time instead of copying an old address from this file.

## Expo and Metro

Read `apps/mobile/AGENTS.md`, check the installed Expo version, and use that version's Expo documentation before changing Expo configuration. Preserve the repo's pnpm scripts and pass flags through them.

Expo's LAN mode chooses a network interface and may advertise Forge's ordinary LAN address instead of its Tailscale address. Expo's localhost mode is safer on this host when a tailnet-only TCP forward already maps the chosen Tailscale port to the same loopback port.

For the usual Metro port, first confirm that Tailscale Serve forwards the Forge tailnet port to `127.0.0.1:8081`. Then start Metro with an explicitly advertised Tailscale URL:

```bash
CJ_TAILSCALE_IPV4="$(tailscale ip -4 | sed -n '1p')"
EXPO_PACKAGER_PROXY_URL="http://${CJ_TAILSCALE_IPV4}:8081" \
  pnpm --filter mobile start -- --localhost --port 8081
```

`EXPO_PACKAGER_PROXY_URL` changes the URL embedded in Expo's QR code and manifests. The loopback bind keeps Metro off Forge's non-Tailscale interfaces, while Tailscale Serve carries HTTP and WebSocket traffic from the tailnet to Metro.

If port 8081 is occupied, inspect the owner. Reuse it if it is the intended server. Otherwise choose a free port only after confirming a matching Tailscale Serve TCP forward. Do not silently configure or overwrite a Serve mapping.

After startup, verify all of the following:

- `ss -ltnp` shows Metro on the expected loopback port.
- `tailscale serve status` shows the matching tailnet TCP forward.
- An HTTP request to `http://<tailscale-ip>:<port>` succeeds. A loopback-only request is not enough.
- Expo reports or embeds the Tailscale address, not Forge's LAN address or localhost.

Report the Expo QR/deep link produced by the running CLI when the user needs to open the native app. For Expo web, report the verified `http://forge:<port>` URL, or the verified Tailscale-IP URL if MagicDNS fails.

Do not use `--tunnel` as an automatic workaround. Expo tunnel URLs are public, depend on a third party, and are slower. Use one only when the user asks or approves it after the private Tailscale route fails.

## Headless native constraints

- Forge cannot run an iOS Simulator or build iOS locally because it is Linux. Do not pass `--ios` or press `i`. Use a physical iPhone with Expo Go or an installed development build. Use EAS Build or the user's Mac only when the task calls for a new iOS binary.
- Do not assume an Android emulator or USB device exists. Check `adb devices` and the Android toolchain first. Otherwise use a physical Android device over Tailscale.
- Starting Metro does not prove the native UI works. State whether verification covered only the bundler route or a real device session.
- Expo web is useful for browser checks, but it does not verify native layout, permissions, secure storage, haptics, push notifications, or platform-specific authentication.

## Next.js web app

The primary web app is `apps/web`, not the Expo web target. Start it from the workspace root with:

```bash
pnpm dev:web
```

`apps/web/scripts/dev.mjs` already discovers the current Tailscale IPv4 address and passes it to Next.js. Keep that launcher unless the user requests a different host. It accepts `WEB_DEV_HOST` as an override and forwards Next.js CLI arguments.

Verify the listener and request the site through its Tailscale address. Then use the T3 Code collaborative preview and report `http://forge:<port>` when MagicDNS and Next.js host validation work. `apps/web/next.config.ts` contains the development-origin allowlist, so update it only when a verified hostname or origin error requires a change.

## Client-visible endpoints

Audit URLs consumed by browsers and native code. On a client, `localhost` means that Mac or phone, not Forge. Use a hosted service URL or the verified Forge Tailscale URL for development-only callbacks, APIs, assets, and WebSocket endpoints.

Convex normally uses its hosted deployment URL and needs no inbound Tailscale port. Do not replace a working Convex URL with a Forge address.

Authentication redirects and deep links need separate verification. A Tailscale URL is private, and an OAuth provider may require an exact registered callback. Do not weaken callback or origin checks to make a preview work.

## Handoff

When leaving a server running, report:

- which app and command are running;
- the bind address and port;
- the Tailscale route or Serve mapping used;
- the client URL or Expo deep link;
- what was verified from Forge, the browser preview, and any physical device;
- the remaining limitation if native behavior was not observed.
