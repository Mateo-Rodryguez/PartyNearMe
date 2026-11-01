#!/usr/bin/env bash
# Installs the debug app on a booted iPhone simulator, opens each screen and saves
# a screenshot, in the light theme and then the dark one. Fails if the app crashes.
# Usage: simulator-screenshots.sh APP OUT_DIR
set -uo pipefail

app="$1"
out="$2"
bundle=com.partynearme.app
failed=0
mkdir -p "$out"

xcrun simctl install booted "$app" || exit 1
xcrun simctl privacy booted grant location "$bundle" || true
# A tidy status bar: 9:41, full signal and battery, as in Apple's own screenshots.
xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3 > /dev/null 2>&1 || true

running() {
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
  sleep 4
  xcrun simctl io booted screenshot "$out/$name.png" > /dev/null
  if ! running; then
    echo "::error::The app was not running after opening $name"
    failed=1
  fi
}

screens=(sign_in sign_up forgot profile_setup onboarding location app profile)

# The real app, signed out: checks it starts against the real configuration.
xcrun simctl ui booted appearance light
shot 00-real-app
sleep 4 # the sign-in screen asks Supabase which providers are on
n=1
for screen in "${screens[@]}"; do
  shot "$(printf '%02d' "$n")-$screen" -demo "$screen"
  n=$((n + 1))
done
xcrun simctl ui booted appearance dark
for screen in "${screens[@]}"; do
  shot "$(printf '%02d' "$n")-$screen-dark" -demo "$screen"
  n=$((n + 1))
done
xcrun simctl ui booted appearance light

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
