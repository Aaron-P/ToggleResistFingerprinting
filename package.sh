#!/usr/bin/bash
set -e
mkdir -p dist/Firefox
rm -r -f dist/Firefox/ToggleResistFingerprinting.zip 2>/dev/null || true
if command -v 7z >/dev/null 2>&1; then
    7z a -tzip dist/Firefox/ToggleResistFingerprinting.zip @package-firefox.txt
elif command -v 7za >/dev/null 2>&1; then
    7za a -tzip dist/Firefox/ToggleResistFingerprinting.zip @package-firefox.txt
elif command -v zip >/dev/null 2>&1; then
    zip -r dist/Firefox/ToggleResistFingerprinting.zip $(cat package-firefox.txt)
else
    echo "Error: No archive tool found (7z, 7za, or zip required)." >&2
    exit 1
fi
