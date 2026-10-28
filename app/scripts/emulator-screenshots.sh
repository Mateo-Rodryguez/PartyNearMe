#!/usr/bin/env bash
# Installs the debug APK on a running emulator, opens each screen and saves a
# screenshot. Fails if the app crashes. Usage: emulator-screenshots.sh APK OUT_DIR
set -uo pipefail

apk="$1"
out="$2"
pkg=com.partynearme.app
failed=0
mkdir -p "$out"

adb install -r "$apk" || exit 1
adb logcat -c

shot() {
  local name="$1"
  shift
  adb shell am force-stop "$pkg"
  adb shell am start -W -n "$pkg/.MainActivity" "$@" > /dev/null
  # Time for sample photos and map tiles to load from the internet. Maps get
  # longer: the emulator draws them in software, a few seconds behind a phone.
  case "$name" in
    *event*|*map*) sleep 16 ;;
    *) sleep 8 ;;
  esac
  adb exec-out screencap -p > "$out/$name.png"
  if ! adb shell pidof "$pkg" > /dev/null; then
    echo "::error::The app was not running after opening $name"
    failed=1
  fi
}

# The real app, signed out: checks it starts against the real configuration.
shot 00-real-app
# Sample data (debug builds only), one screen at a time, in the light theme.
adb shell cmd uimode night no
n=1
for screen in sign_in feed notifications nearby event new_event map_picker post inbox chat profile user settings relationship search followers saved comments edit-party invite party-chat; do
  shot "$(printf '%02d' "$n")-$screen" --es demo "$screen"
  n=$((n + 1))
done
# The main screens again in the dark theme: the app follows the phone's setting.
adb shell cmd uimode night yes
for screen in sign_in feed notifications nearby event map_picker profile settings relationship; do
  shot "$(printf '%02d' "$n")-$screen-dark" --es demo "$screen"
  n=$((n + 1))
done
adb shell cmd uimode night no

adb logcat -d -b crash > "$out/crash-log.txt" || true
# Map messages, to see why a map stays blank.
adb logcat -d | grep -iE "maplibre|mlnffi" | tail -n 300 > "$out/map-log.txt" || true
if grep -q "FATAL EXCEPTION" "$out/crash-log.txt"; then
  echo "::error::The app crashed. See crash-log.txt"
  cat "$out/crash-log.txt"
  failed=1
fi
exit "$failed"
