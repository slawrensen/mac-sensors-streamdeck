# Security policy

## Reporting a vulnerability

Report privately through GitHub's vulnerability reporting for this
repository: <https://github.com/slawrensen/mac-sensors-streamdeck/security/advisories/new>
(the repository's **Security** tab, then **Report a vulnerability**). Name
Mac Sensors and the affected version. I am the only maintainer; expect a
first reply within seven days. Please do not describe an exploitable problem,
or post profile exports or logs, in a public issue before I have had a chance
to ship a fix.

Fixes ship on the newest 1.x release. The plugin has no update channel of its
own; updates arrive through the Elgato Marketplace or the GitHub release page.

## What the plugin touches

The plugin runs inside Elgato's Stream Deck app on macOS. It reads local
macOS system interfaces and a bounded set of typed SMC keys, read-only, on the
local machine only. It has no sensor-register setter and no fan control. It
installs no privileged helper, daemon or kernel extension and needs no
administrator access for its reads. Settings are stored through the Stream Deck app and logs
stay local. It makes no network requests and has no telemetry; its only
connection is the local one to the Stream Deck app.

A support report leaves out user names, serial numbers, hardware UUIDs, raw
device IDs and sensor values. Review a report before you share it.

## The native readers are ad-hoc signed

`bin/hwmac-arm64.node` and `bin/hwmac-x86_64.node` are ad-hoc signed. That
checks file integrity; it is not a Developer ID certificate or notarization.
The bytes are checkable. Every release attaches `SHA256SUMS.txt` for the
package and `native-manifest.json`, which records each reader's architecture,
deployment floor, source identity and hash. To check a download, put the files
in one folder and run:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

For an extracted reader:

```bash
codesign --verify --strict hwmac-arm64.node
codesign -dv --verbose=4 hwmac-arm64.node
```

A GitHub-release install matches its published hash byte for byte. Elgato
repackages Marketplace copies, so a GitHub checksum does not apply to a
Marketplace download.
