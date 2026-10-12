# Branding

- `icon.svg`: the master app icon, on the 108×108 Android adaptive-icon grid.
  Launchers show roughly the middle 72×72, so keep important shapes inside a
  66-unit circle in the centre.
- `play-store-icon-512.png`: the 512×512 icon Google Play asks for.
- The iPhone icon is `iosApp/PartyNearMe/Assets.xcassets/AppIcon.appiconset/icon-1024.png`:
  the middle 84×84 of `icon.svg` at 1024×1024 with no transparency (iOS rounds
  the corners itself).

The Android launcher icon in `androidApp/src/main/res/drawable/ic_launcher_*.xml`
is the same artwork as vector paths. To change the icon, edit `icon.svg`, copy its
paths into those files, and re-export the PNG.
