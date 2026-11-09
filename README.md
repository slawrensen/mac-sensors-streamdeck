<p align="center">
  <img src=".github/readme/readme-hero.png" width="100%"
       alt="A board of Mac Sensors key and dial faces drawn by the plugin with sample values: one CPU temperature key in each of the seven themes and a four-reading key; single keys for GPU temperature, fan speed, system power, CPU activity, active memory, network receive and free space; two- and three-reading keys, a ring and a bar, an amber warning key, a red critical key, a Back tile and a detail title tile; and four dial faces below in one-reading, two-row and three-row views">
</p>

<p align="center">
  <em>Seven themes · one to four readings per key · sparkline, bar and ring · amber <strong>warn</strong> / red <strong>critical</strong> alerts · Stream&nbsp;Deck&nbsp;+ dials in one, two or three rows</em>
</p>

<h1 align="center">Mac Sensors for Stream Deck</h1>

<p align="center">
  <b>Live Mac readings on your Stream Deck keys and dials.</b><br>
  Temperatures, fans, power, CPU activity, memory, storage and network, with a sparkline, bar or ring and amber and red alerts.
</p>

<p align="center">
  <a href="https://marketplace.elgato.com/product/mac-sensors-f04e345c-21c5-411c-9ecd-01864c3a8c3c"><img alt="Get it on the Elgato Marketplace" src="https://img.shields.io/badge/Elgato%20Marketplace-Get%20it-e8940d?style=for-the-badge&logo=elgato&logoColor=white&labelColor=0d1117"></a>
  <a href="https://docs.slawrensen.com/mac-streamdeck/"><img alt="Documentation" src="https://img.shields.io/badge/Docs-Read%20the%20guide-30363d?style=for-the-badge&labelColor=0d1117"></a>
  <a href="https://github.com/slawrensen/mac-sensors-streamdeck/releases/latest"><img alt="Download the latest release" src="https://img.shields.io/github/v/release/slawrensen/mac-sensors-streamdeck?style=for-the-badge&label=Download&logo=github&labelColor=0d1117&color=30363d"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#keys">Keys</a> ·
  <a href="#dials">Dials</a> ·
  <a href="#themes-and-alerts">Themes and alerts</a> ·
  <a href="#sensor-details">Sensor details</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="#build-from-source">Build</a>
</p>

> [!NOTE]
> **1.0.2** adds battery cycles, battery health and the internal SSD
> temperature, more M5 Pro readings, and network rates that carry on past
> 4 GiB. See [what changed in 1.0.2](https://docs.slawrensen.com/mac-streamdeck/whats-new-1.0.2.html).

## Install

1. **Install** from the [Elgato Marketplace](https://marketplace.elgato.com/product/mac-sensors-f04e345c-21c5-411c-9ecd-01864c3a8c3c), or download `com.lawrensen.mac.streamDeckPlugin` from [Releases](https://github.com/slawrensen/mac-sensors-streamdeck/releases/latest), double-click it and choose **Install**.
2. **Drag** *Mac Sensors → Sensor Reading* onto a key.
3. **Pick a reading**: type in the **Reading** box and choose one from this Mac's list.

> [!NOTE]
> Needs macOS 13.5 or later, Stream Deck 7.1 or later and Tahoma Bold, which
> ships with macOS. The package carries a reader for Apple silicon and one for
> Intel. Which readings appear depends on the Mac and its macOS version;
> [Hardware compatibility](https://docs.slawrensen.com/mac-streamdeck/hardware.html)
> says what I measured and on which Mac.

**More:** [Getting started](https://docs.slawrensen.com/mac-streamdeck/getting-started.html) · [Installation and requirements](https://docs.slawrensen.com/mac-streamdeck/installation.html)

## Keys

One reading with a sparkline, bar or ring, or up to four readings on one key.

<img src=".github/readme/key-layouts.png" width="100%" alt="Eight key faces with sample values: one CPU temperature with a sparkline, two temperatures stacked, three readings in rows, four readings in a quad grid, CPU usage with a bar and with a ring, active memory and network receive with sparklines">

- Press to cycle current, MIN, MAX and AVG. Mac Sensors keeps them from its own reads since reading started.
- Give a reading your own label. The key saves which reading it is, not its place in the list.
- Temperatures in °C or °F.

**More:** [Sensor Reading](https://docs.slawrensen.com/mac-streamdeck/sensor-reading.html)

## Dials

One reading or several on each Stream Deck + and + XL touchscreen segment, in any of the seven themes.

<img src=".github/readme/dials.png" width="100%" alt="Three dial faces with sample values: one CPU temperature with session minimum and maximum and a range bar, two rows with trend lines, and three compact rows of CPU, GPU and fan">

- **View**: one reading with a range bar, two rows with a trend line, or three compact rows.
- At warn and critical the bar turns amber or red; in the two- and three-row views the alerting row's number does.
- **Reading colors**: give each row its own number color, or start from the Signal, Pairs or Uniform presets.
- Turn to move through the readings, touch to cycle the stat, push to reset the session. The **Elite** and **Custom** presets remap each gesture.
- A **Sensor Control** key steers a dial from another key, a Multi Action or a pedal.

Dial gestures run in software tests and synthetic gesture traces. I have not run them on a physical Stream Deck + yet.

**More:** [Sensor Dial](https://docs.slawrensen.com/mac-streamdeck/sensor-dial.html) · [Dial controls and presets](https://docs.slawrensen.com/mac-streamdeck/dial-controls.html)

## Themes and alerts

Seven themes, set once for the whole deck or per key and dial.

<img src=".github/readme/themes.png" width="100%" alt="The same CPU temperature key in the seven themes: Void, Graphite, Ultraviolet, Midnight, Forest, Ember and Paper">

- Void, Graphite, Ultraviolet, Midnight, Forest and Ember are dark; Paper is light.
- At **Warn at** the key turns amber; at **Critical at**, red. Alert colors are the same on every theme.
- **Alert when the value drops to or below these numbers** makes a low value the alarm, for fans.
- **Accent colors** (By sensor type, the default) color each graph by reading type; **Theme accent everywhere** uses each theme's own color.

**More:** [Themes and colors](https://docs.slawrensen.com/mac-streamdeck/themes.html) · [Thresholds and alerts](https://docs.slawrensen.com/mac-streamdeck/thresholds.html)

## Sensor details

A key press can open a page of related readings, then return.

<img src=".github/readme/details.png" width="100%" alt="A detail page on a 15-key Stream Deck: the pressed CPU temperature as the Back tile, a Custom set title tile, Previous and Next, and seven readings">

- Show the pressed reading's group, a filter, or a list you build.
- Page through long lists; the key you pressed stays live as the Back tile.
- One editable detail profile ships per supported deck type.

**More:** [Sensor details](https://docs.slawrensen.com/mac-streamdeck/sensor-details.html)

## Troubleshooting

When a key can't show a reading, it names the condition and what to do.

<img src=".github/readme/status.png" width="100%" alt="Status screens: Reading sensors, Source busy, Sensor missing, No sensor data, Bridge failed, Tahoma needed and Source error">

<details>
<summary>What each screen means</summary>

| Key shows | Fix |
| --- | --- |
| **Reading sensors** | The first read is still out. After 15 seconds it becomes **Source busy**. |
| **Source busy** | Choose **Check again**. If it stays, copy a support report, then quit and reopen Stream Deck. |
| **No sensor data** | Choose **Check again**. It can show briefly after the Mac wakes. If it stays, copy a support report and open an issue. |
| **Tahoma needed** | Install or turn on Tahoma Bold in Font Book. The key clears on the next read. |
| **Bridge failed** | Quit and reopen Stream Deck. If it repeats, remove Mac Sensors and install it again. |
| **Source error** | Choose **Check again**. If it stays, copy a support report, reopen Stream Deck and open an issue. |
| **Needs macOS** | Not expected with the runtime Stream Deck supplies. Check the requirements, then copy a support report. |
| **Pick a sensor** / **Sensor missing** | Open the key's settings and pick the reading again. The panel says whether this Mac reports it. |

**Copy support report** is in the key's settings under *Advanced → Support*.

</details>

**More:** [Status screens](https://docs.slawrensen.com/mac-streamdeck/status-screens.html) · [Troubleshooting](https://docs.slawrensen.com/mac-streamdeck/troubleshooting.html) · [FAQ](https://docs.slawrensen.com/mac-streamdeck/faq.html)

## Build from source

```bash
npm ci                  # Node 24+
npm run build:native    # arm64 and x86_64 readers (Xcode Command Line Tools)
npm run build           # bundles bin/plugin.js and assembles the plugin
npm test                # shared unit suites (node:test)
npm run test:mac        # Mac suites
npm run e2e             # drives the built plugin over a mock Stream Deck
npm run pack            # release/com.lawrensen.mac.streamDeckPlugin
```

Dev loop: `npm run build:dev` stages a separate `com.lawrensen.macdev` copy, so
an installed release is never overwritten; link it with `streamdeck link`.
Conventions are in [AGENTS.md](AGENTS.md). Performance numbers live in [PERF.md](PERF.md).

The native readers `bin/hwmac-arm64.node` and `bin/hwmac-x86_64.node` are
ad-hoc signed, not notarized. Every release attaches `SHA256SUMS.txt`; put the
downloads in one folder and run `shasum -a 256 -c SHA256SUMS.txt` before
opening the package. See [SECURITY.md](SECURITY.md).

## Credits and license

[MIT](LICENSE). Free, no ads, no telemetry, no network requests. Reads are
read-only: no fan control, no root, no privileged helper. SMC measurement names
are adapted from [Stats](https://github.com/exelban/stats) by Serhiy
Mytrovtsiy (MIT). Full credits in [NOTICE.md](NOTICE.md).

Not affiliated with, endorsed by, or sponsored by Apple or Elgato.
Mac and macOS are trademarks of Apple Inc. Stream Deck and Elgato are
trademarks of Corsair Memory, Inc.
