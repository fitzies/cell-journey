# Cell Journey app icon

`cell-journey-icon.png` is the approved doorway, cross, and golden path design, exported as a 1024 × 1024 opaque RGB PNG. Expo uses it for the default, iOS, and Android app icons. iOS applies its own corner mask.

Generated using the built-in imagegen tool, then resized with Sharp.

Final edit prompt:

> Edit this approved Cell Journey app icon for production export. Change ONLY the four white outer corners: extend the adjacent blue background and foreground artwork all the way to the four square corners. Output a completely filled square image, no rounded outer corners, no white margin, no border, no transparency. Keep the existing doorway, white cross, golden winding path, proportions, composition, colors, lighting, and every interior design detail unchanged. This is the same icon prepared as a full bleed square for iOS to apply its own corner mask. Highest quality square PNG.

Icon changes require a new native build. To build and upload to TestFlight, run from `apps/mobile`:

```sh
pnpm dlx eas-cli build --platform ios --profile production --auto-submit
```

The existing production profile increments the build number automatically and submits to App Store Connect app `6785403977`. Once Apple processes the build, make it available to the intended TestFlight testing group. An over-the-air JavaScript update cannot replace the installed app icon.
