# Security

Report suspected vulnerabilities through [private vulnerability reporting](https://github.com/slawrensen/slawrensen.github.io/security/advisories/new). The reporting form is hosted in the documentation repository so it is available while product source remains private. Name Mac Sensors and the affected version in the report. Please avoid posting exploit details, profile exports or private logs in a public issue. The first reply target is seven days.

Security fixes target the latest published 1.x release. The plugin has no update channel of its own; updates arrive through the Elgato Marketplace or GitHub releases. Install a newer published version when a fix is announced.

Mac Sensors reads local macOS system interfaces, a bounded set of typed SMC keys, and battery and internal drive health through public IOKit interfaces (IOPowerSources, AppleSmartBattery registry properties and the NVMe SMART read). It exposes no sensor-register setter or fan control. It installs no privileged helper, daemon or kernel extension and requires no administrator access for normal reads. Settings are stored through the Stream Deck app. Logs stay local. The plugin makes no internet requests and sends no telemetry; its SDK connection is to the local app.

The native files are ad-hoc signed. That checks file integrity but is not a Developer ID publisher certificate or notarization claim. Verify a downloaded package against the release's SHA256SUMS.txt with `shasum -a 256`. For extracted native files, use `codesign --verify --strict <file>` and `codesign -dv --verbose=4 <file>`. The native manifest records architecture, deployment floor, source identity and file hashes.

Marketplace copies are repackaged by Elgato and may differ from the outer GitHub package. A Marketplace-specific installation check is separate from direct-download validation.

A support report omits user names, serial numbers, hardware UUIDs, raw device IDs and sensor values. Review any report before sharing it. Keep profile backups and development traces private.
