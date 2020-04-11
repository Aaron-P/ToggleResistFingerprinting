#!/usr/bin/bash
rm -r -f dist/Firefox
7za a -tzip dist/Firefox/ToggleResistFingerprinting.zip @package-firefox.txt
