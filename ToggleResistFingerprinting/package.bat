@echo off
cd .\ToggleResistFingerprinting

rmdir /S /Q ..\Firefox
..\7za.exe a -tzip ..\Firefox\ToggleResistFingerprinting.zip ^
    ..\..\LICENSE.md^
    ..\..\README.md^
    background.js^
    icon.svg^
    icon-light.svg^
    manifest.json
