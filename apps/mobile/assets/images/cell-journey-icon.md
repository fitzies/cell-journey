# Cell Journey app icon

`cell-journey-icon.png` is the Cell Journey brand logo (three people above a winding green path, "Cell Journey" wordmark) on white, exported as a 1024 × 1024 opaque RGB PNG from the October 2026 brand sheet. Expo uses it for the default, iOS, and Android app icons. iOS applies its own corner mask.

`splash-icon.png` and `favicon.png` are transparent-background versions of the same logo so they sit on the themed splash background (#F6F7F3).

Icon changes require a new native build. To build and upload to TestFlight, run from `apps/mobile`:

```sh
pnpm dlx eas-cli build --platform ios --profile production --auto-submit
```

The existing production profile increments the build number automatically and submits to App Store Connect app `6785403977`. Once Apple processes the build, make it available to the intended TestFlight testing group. An over-the-air JavaScript update cannot replace the installed app icon.
