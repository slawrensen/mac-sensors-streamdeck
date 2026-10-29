<p align="center">
  <img src=".github/readme/readme-hero.png" width="100%" alt="Production-rendered Mac Sensors sample board: seven themes, temperature, fan, power, CPU, memory, network and free-space readings, multi-reading keys, gauges, warning and critical alerts, and four dial layouts">
</p>

<p align="center">
  <em>Seven themes · one to four readings per key · sparkline, bar and ring · warning and critical colors · reading sets on dials. Production-rendered sample data.</em>
</p>

<h1 align="center">Mac Sensors for Stream Deck</h1>

<p align="center">
  <b>Live Mac readings on your keys and dials.</b><br>
  Temperatures, fans, power, CPU activity, memory and transfer rates through read-only macOS interfaces.
</p>

<p align="center">
  <a href="https://docs.slawrensen.com/mac-streamdeck/index.html">Documentation</a> ·
  <a href="https://github.com/slawrensen/mac-sensors-streamdeck/releases">Releases</a> ·
  <a href="https://github.com/slawrensen/slawrensen.github.io/issues">Report a bug</a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#keys">Keys</a> ·
  <a href="#sensor-details">Details</a> ·
  <a href="#dials">Dials</a> ·
  <a href="#themes">Themes</a> ·
  <a href="#settings">Settings</a>
</p>

> [!NOTE]
> **Mac Sensors 1.0.1.0.** This repository and its releases require access. The hosted documentation is public; product source remains private. Physical-device and Intel validation status is recorded in the compatibility guide.

## Install

1. Install `com.lawrensen.mac.streamDeckPlugin` from the release, then open Stream Deck and select **Virtual Stream Deck** or a connected deck.
2. Add **Mac Sensors → Sensor Reading** to a key and choose a reading from this Mac's catalog.
3. Pick a layout, theme and optional thresholds. Click a virtual key to use its configured action.

Needs macOS 13.5+, Stream Deck 7.1+ and Tahoma Bold. Availability varies by Mac; the hardware compatibility page distinguishes measured results from pending physical checks.

**More:** [Installation](https://docs.slawrensen.com/mac-streamdeck/installation.html) · [Getting started](https://docs.slawrensen.com/mac-streamdeck/getting-started.html) · [Hardware compatibility](https://docs.slawrensen.com/mac-streamdeck/hardware.html)

## Keys

Show a large number or put two, three or four readings on one key.

<img src=".github/readme/key-layouts.png" width="100%" alt="Production-rendered key layout examples">

*Production-rendered sample data using Mac catalog readings and short custom labels.*

- Pick a reading by name and give it your own label; the key saves its identity, not its list position.
- Use a sparkline, bar or ring where the layout supports it.
- Keep a saved selection when a sensor is temporarily unavailable.

**More:** [Sensor Reading](https://docs.slawrensen.com/mac-streamdeck/sensor-reading.html) · [Getting started](https://docs.slawrensen.com/mac-streamdeck/getting-started.html)

## Sensor details

Put a group of readings behind one key and return through a configurable Back tile.

<img src=".github/readme/details.png" width="100%" alt="Production-rendered detail view examples">

*Production-rendered sample data showing reading cells and navigation.*

- Choose the sensor's group, a filter or a custom list.
- Mix one- to four-reading tiles; labels and colors move with their readings.
- Use the second Back tile at the opener's position where supported.

**More:** [Sensor details](https://docs.slawrensen.com/mac-streamdeck/sensor-details.html)

## Dials

Turn through readings and groups with one-reading, two-row and three-row views.

<img src=".github/readme/dials.png" width="100%" alt="Production-rendered dial examples">

*Production-rendered sample data with local session statistics.*

- A missing reading keeps its place in the set until it returns.
- Use local session min, max and average.
- Choose a preset or assign the individual controls you need.

**More:** [Sensor Dial](https://docs.slawrensen.com/mac-streamdeck/sensor-dial.html) · [Controls and presets](https://docs.slawrensen.com/mac-streamdeck/dial-controls.html)

## Themes

Choose a theme for the whole deck or override it on one action.

<img src=".github/readme/themes.png" width="100%" alt="Production-rendered theme examples">

*Production-rendered sample data with the same reading in each theme.*

- Seven themes: six dark ones and Paper, a light one.
- Make shared applies your choice as the shared default.
- Alert colors override custom text and reading colors.

**More:** [Themes and colors](https://docs.slawrensen.com/mac-streamdeck/themes.html)

## Alerts

Warning and critical colors mark the limits you choose for a reading.

<img src=".github/readme/alerts.png" width="100%" alt="Production-rendered alert examples">

*Production-rendered sample data. Alert colors are fixed.*

- Warning is amber and critical is red in every theme.
- Bars and rings show muted zones at each threshold.
- Alerts change the display; hardware remains read-only.

**More:** [Thresholds and alerts](https://docs.slawrensen.com/mac-streamdeck/thresholds.html)

## Status screens

Status screens preserve your selection and name the condition the plugin can establish.

<img src=".github/readme/status.png" width="100%" alt="Production-rendered status examples">

*Production-rendered sample scenarios.*

- Failed or expired readings do not stay live.
- Check again asks for a new read.
- A fixed setup image remains available when Tahoma Bold is missing.

**More:** [Status screens](https://docs.slawrensen.com/mac-streamdeck/status-screens.html) · [Troubleshooting](https://docs.slawrensen.com/mac-streamdeck/troubleshooting.html)

## Dial reading colors

Keep the same reading set and assign a distinct number color to each row.

<img src=".github/readme/reading-colors.png" width="100%" alt="Production-rendered dial comparison showing uniform numbers beside individually colored CPU, GPU and fan values">

*Production-rendered sample data. The readings and geometry stay the same.*

- Set individual colors or start with a preset.
- Reading colors work with every theme, Paper included.
- Warning and critical colors take priority when thresholds are crossed.

**More:** [Themes and colors](https://docs.slawrensen.com/mac-streamdeck/themes.html) · [Sensor Dial](https://docs.slawrensen.com/mac-streamdeck/sensor-dial.html)

## Settings

Search this Mac's available readings, then adjust the layout, graph and colors in the settings panel.

<img src="marketing/shot-4-settings.png" width="100%" alt="Mac Sensor Reading and Sensor Dial settings previews with the reading picker, shared themes and dial rotation choices">

*Settings-panel captures from the shipped panel on a simulated host, with sample readings.*

- Search by reading name or browse the grouped catalog.
- Apply a shared look or customize one action.

**More:** [Getting started](https://docs.slawrensen.com/mac-streamdeck/getting-started.html) · [Dial controls](https://docs.slawrensen.com/mac-streamdeck/dial-controls.html)

## Requirements and scope

macOS 13.5 or later, Stream Deck 7.1 or later, and Tahoma Bold. The package includes separate arm64 and x86_64 readers and uses the app's Node 24 runtime. No privileged helper or separate sensor application is installed.

Measured on Apple silicon: an M5 Pro with macOS 27.0.1 and Stream Deck 7.5.0 and 7.6.0 on the Virtual Stream Deck. Intel ran only on hosted virtual machines with an emulated SMC; physical Intel validation is in progress.

Sensor availability varies by Mac. The measured M5 Pro catalog includes temperatures, fans, system power, DC input voltage and current, CPU activity, named memory counters, storage space, aggregate transfer rates, battery cycles and health, the internal SSD temperature, and a CPU average, hottest CPU core and fan average computed from SMC readings. CPU/GPU clocks and unqualified private GPU usage are not offered. Keys show minimum, maximum and average that Mac Sensors keeps from its own reads since the plugin last started reading sensors; each dial keeps separate session statistics.

[Hardware compatibility](https://docs.slawrensen.com/mac-streamdeck/hardware.html) distinguishes actual app, hosted CI, Rosetta and physical-device evidence. [PERF.md](PERF.md) records timing windows and their limits. Images above use sample data and do not represent a hardware photograph.

## Privacy and license

The plugin makes no internet requests and sends no telemetry. It reads local macOS interfaces and communicates with the local Stream Deck app. You choose when to copy and share a support report. See the [privacy details](https://docs.slawrensen.com/mac-streamdeck/faq.html#privacy).

Free, MIT licensed, no ads, no telemetry. [License](LICENSE) · [Third-party notices](NOTICE.md) · [Security reporting](SECURITY.md)

Not affiliated with Apple or Elgato. Mac and macOS are trademarks of Apple Inc. Stream Deck is a trademark of Corsair Memory, Inc.
