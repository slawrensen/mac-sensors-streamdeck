---
layout: default
title: Installation and requirements
nav_order: 2
description: "Install the plugin, then confirm that Tahoma Bold is present. No separate sensor app is needed."
---

Install the plugin, then confirm that Tahoma Bold is present. No separate sensor app is needed. If it is already installed, [get your first reading](getting-started.html).

## System requirements

The declared floor is what the package asks for. **Actually run** lists what ran on the measured Mac and on hosted CI.

| Requirement | Declared floor | Actually run |
| --- | --- | --- |
| **macOS** | 13.5 or later | 27.0.1 on an Apple silicon M5 Pro. Hosted CI virtual machines ran the test suite and the native readers on macOS 26.6.2 (Apple silicon) and 26.6.1 (Intel). |
| **Stream Deck app** | 7.1 or later | 7.5.0, 7.6.0 and 7.6.1 |
| **Node runtime** | Node 24, supplied by the Stream Deck app. You install nothing. | 24.13.1 with app 7.5.0 and 24.22.1 with apps 7.6.0 and 7.6.1, the runtimes the app chose. |
| **Tahoma Bold** | Installed. It ships with macOS. | Present on the measured Mac |
| **Processor** | The package carries an arm64 reader for Apple silicon and an x86_64 reader for Intel | Apple silicon measured. Intel ran only on hosted virtual machines; physical Intel validation has not been done ([Mac](hardware.html#mac)). |
| **A deck** | **Sensor Reading** goes on a display key. **Sensor Dial** goes on a dial of a Stream Deck + or + XL. **Sensor Control** can go on any key, including a Stream Deck Pedal or Corsair G-Keys (not checked on hardware), and steers dials on another deck ([Stream Deck models](hardware.html#stream-deck-models)). | The 8 by 4 Virtual Stream Deck, and a Stream Deck MK.2 for keys, presses and opening details. Other physical checks and Stream Deck + dial gestures have not run ([Stream Deck models](hardware.html#stream-deck-models)). |

Mac Sensors needs no administrator password, privileged helper, daemon or kernel extension. Which readings appear depends on the Mac and its macOS version. The [compatibility matrix](hardware.html#compatibility-matrix) gives the evidence for each Mac and deck.

## Install the plugin

### Get the package

Install from the [Elgato Marketplace]({{ site.plugin_release.marketplace }}), or download `com.lawrensen.mac.streamDeckPlugin` from the [latest GitHub release](https://github.com/slawrensen/mac-sensors-streamdeck/releases/latest). {% if site.plugin_release.marketplace_version == site.plugin_release.package_version %}The current version is {{ site.plugin_release.package_version }} on both.{% else %}The GitHub release is {{ site.plugin_release.package_version }}; the Marketplace listing offers {{ site.plugin_release.marketplace_version }}.{% endif %}

### Install from a .streamDeckPlugin file

1. Open the Stream Deck app.
2. In Finder, double-click `com.lawrensen.mac.streamDeckPlugin`. The Stream Deck app asks whether to install it. Choose **Install**.
3. Find the **Mac Sensors** category in the actions list. It holds **Sensor Reading**, **Sensor Dial** and **Sensor Control**.

A browser download keeps the macOS quarantine flag, and you do not need to clear it. On the measured Mac, Finder passed a quarantined package straight to the Stream Deck app.

### Check the download

Each GitHub release has `SHA256SUMS.txt` attached. Put the package, `native-manifest.json` and `SHA256SUMS.txt` from the same release in one folder and run:

```sh
shasum -a 256 -c SHA256SUMS.txt
```

Each line must end in `OK`. A matching checksum identifies the published bytes; it does not establish safety. The two native readers are ad-hoc signed, which checks file integrity. They have no Developer ID certificate and are not notarized. To inspect an extracted reader, run `codesign --verify --strict <file>` and `codesign -dv --verbose=4 <file>`.

Before loading a reader, the plugin compares the file's SHA-256 with the record inside the package. A file that does not match is not loaded, and keys show **Bridge failed**. Quit and reopen Stream Deck. If it persists, remove Mac Sensors and install it again ([Removing](#removing)).

### Elgato Marketplace

Install from the [Marketplace listing]({{ site.plugin_release.marketplace }}). Checked {{ site.plugin_release.checked | date: "%-d %B %Y" }}: the listing offers version {{ site.plugin_release.marketplace_version }}. Elgato repackages Marketplace copies, so their checksums can differ from the GitHub package's. Do not compare the two.

### Updating

- **Newer version:** open the newer package the same way. The Stream Deck app replaces the installed plugin. Your keys, dials and their settings stay, because the Stream Deck app stores them outside the plugin folder. On the measured Mac, 1.0.0.0 installed this way over an earlier build.
- **Same version:** opening a package of the installed version changes nothing. The app writes `AlreadyInstalled` to its log in `~/Library/Logs/ElgatoStreamDeck`, the running plugin keeps going, and its files stay as they were. To install the same version again, remove it first.
- **Detail view:** after an update that changes the bundled detail view, Stream Deck asks again to install it the first time details open on each kind of deck. 1.0.1.0 and 1.0.2.0 ship the 1.0.0.0 detail view files unchanged.

### Removing

1. Export a backup of your Stream Deck profiles.
2. Remove Mac Sensors from the Plugins list in the Stream Deck app's settings.

The plugin itself writes only its logs, inside its own plugin folder. If you opened sensor details, the Stream Deck app also holds a **Mac Sensors Details** profile for each kind of deck you used, and one more after an update that changed the detail view. Whether removing the plugin also removes those profiles has not been checked. To remove one, delete **Mac Sensors Details** from the app's profile list.

### Where it installs

| What | Where on this Mac |
| --- | --- |
| Plugin files | `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.lawrensen.mac.sdPlugin` |
| Plugin logs | The `logs` folder inside the plugin folder. `com.lawrensen.mac.0.log` is the newest. |
| Stream Deck app log | `~/Library/Logs/ElgatoStreamDeck` |
| Key, dial and shared settings | Stored by the Stream Deck app, not in the plugin folder |
| Detail view profiles | **Mac Sensors Details** in the Stream Deck app's profile list, once you accept the install prompt |
| Node runtime | Supplied by the app, under `~/Library/Application Support/com.elgato.StreamDeck/NodeJS/` |

The plugin loads the reader that matches the Node runtime the app starts: `hwmac-arm64.node` for arm64, `hwmac-x86_64.node` for x86_64. Both sit in the plugin folder's `bin` folder.

## Tahoma Bold prerequisite

Keys, dials and detail tiles draw their text in Tahoma Bold, and the plugin fits each label and value to that font's measured widths. Tahoma Bold ships with macOS. On the measured Mac it is `/System/Library/Fonts/Supplemental/Tahoma Bold.ttf`. The package carries no font file.

On every system read, the plugin asks macOS for the font named `Tahoma-Bold`, with automatic font activation turned off, and accepts it only when macOS returns that exact font. Any other answer, such as a substitute font, counts as missing.

When the font is missing, every Sensor Reading key, Sensor Dial and detail tile shows a fixed setup image, **Tahoma needed** and **Open Font Book**, and readings are withheld until the font is back. Sensor Control keys keep their own image. The setup image is stored as pixels, so it draws without the font. In the settings panel, the problem notice says "Install Tahoma Bold in Font Book, then choose Check again." and offers **Check again**.

1. Open Font Book and search for Tahoma.
2. Make sure Tahoma Bold is listed and turned on. If it is not listed, install a Tahoma Bold font file in Font Book.
3. Select a Mac Sensors key, open its settings and choose **Check again**.

Do not remove a system font to test this screen. [Status screens](status-screens.html) shows every status image, and [Troubleshooting](troubleshooting.html#keys-show-tahoma-needed) has the full repair.

## Verify it works

Drag **Sensor Reading** onto a key and choose a **Reading**. The key shows a number and unit, and the settings header shows **Live · Mac sensors**. To see how many readings this Mac returned, open **Advanced**, then **Support**, choose **Copy support report**, and look at `sourceRows` in the `mac` section: `public` counts system readings, `smc` counts SMC readings and `health` counts battery and drive health readings; `computedRows` counts the readings computed from SMC readings. The measured M5 Pro reports `public` 14, `smc` 67, `health` 3 and `computedRows` 5. Follow the [five-step guide](getting-started.html) or find the exact message in [Troubleshooting](troubleshooting.html).

## Next steps

[Get started](getting-started.html) · [Sensor Reading](sensor-reading.html) · [Sensor Dial](sensor-dial.html) · [Data sources](data-sources.html) · [Hardware compatibility](hardware.html)
