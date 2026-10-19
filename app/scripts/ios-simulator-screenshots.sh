#!/usr/bin/env bash
# Installs the debug app on a booted iPhone simulator, opens each screen and
# saves a screenshot. Fails if the app crashes. Usage: ios-simulator-screenshots.sh APP OUT_DIR
set -uo pipefail

app="$1"
out="$2"
bundle=com.partynearme.app
failed=0
mkdir -p "$out"

xcrun simctl install booted "$app" || exit 1
# Answer the location prompt ahead of time, as a user tapping "Allow" would.
xcrun simctl privacy booted grant location "$bundle" || true

running() {
  # Read the whole list first: `grep -q` stopping early would break the pipe.
  local list
  list=$(xcrun simctl spawn booted launchctl list)
  [[ "$list" == *"UIKitApplication:$bundle"* ]]
}

shot() {
  local name="$1"
  shift
  xcrun simctl terminate booted "$bundle" 2> /dev/null || true
  if ! xcrun simctl launch booted "$bundle" "$@" > /dev/null; then
    echo "::error::Could not open $name"
    failed=1
    return
  fi
  # Time for sample photos and map tiles to load from the internet. Maps and photo
  # grids get longer, as on Android: the simulator draws maps in software.
  case "$name" in
    *event*|*map*|*profile*|*user*) sleep 16 ;;
    *) sleep 8 ;;
  esac
  xcrun simctl io booted screenshot "$out/$name.png" > /dev/null
  if ! running; then
    echo "::error::The app was not running after opening $name"
    failed=1
  fi
}

# The real app, signed out: checks it starts against the real configuration.
shot 00-real-app
# Sample data (debug builds only), one screen at a time, in the light theme.
xcrun simctl ui booted appearance light
n=1
for screen in sign_in feed notifications nearby event new_event map_picker post inbox chat profile user; do
  shot "$(printf '%02d' "$n")-$screen" -demo "$screen"
  n=$((n + 1))
done
# The main screens again in the dark theme: the app follows the phone's setting.
xcrun simctl ui booted appearance dark
for screen in sign_in feed notifications nearby event map_picker profile; do
  shot "$(printf '%02d' "$n")-$screen-dark" -demo "$screen"
  n=$((n + 1))
done
xcrun simctl ui booted appearance light

# Map and image messages, to see why a map or photo stays blank.
xcrun simctl spawn booted log show --last 10m --style compact \
  --predicate 'process == "PartyNearMe"' 2> /dev/null \
  | grep -iE "maplibre|mbgl|metal|tile|coil|image|http|error" | tail -n 400 > "$out/app-log.txt" || true

# Crash reports land here on the Mac running the simulator.
mkdir -p "$out/crashes"
find ~/Library/Logs/DiagnosticReports -name 'PartyNearMe*' -newer "$app" -exec cp {} "$out/crashes/" \; 2> /dev/null
if [ -n "$(ls -A "$out/crashes")" ]; then
  echo "::error::The app crashed. See the crashes folder"
  head -c 20000 "$out"/crashes/*
  failed=1
else
  rmdir "$out/crashes"
fi
exit "$failed"
