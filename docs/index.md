---
layout: default
title: Home
nav_order: 1
---

# Mac Sensors for Stream Deck

Mac Sensors shows temperatures, fan speeds, power, CPU usage, memory, storage and network rates on Stream Deck keys and dials, read through read-only macOS interfaces.

**Needs** macOS 13.5 or later, the Stream Deck app 7.1 or later with the Node 24 runtime it supplies, and Tahoma Bold, which ships with macOS. No separate sensor app. These are declared floors; [Hardware compatibility](hardware.html) lists what has actually run. [Installation and requirements](installation.html) · [Get started](getting-started.html)

Version 1.0.1.0 is published as a GitHub release, and its downloads require repository access. Mac Sensors is not on the Elgato Marketplace yet, so there is no public download link.

![Board of Mac Sensors keys and dials: one temperature key in each of the seven themes, a four-reading key, single keys for temperature, fan, power, CPU, memory, network and free space, two- and three-reading keys, a ring and a bar, warning and critical keys, a Back tile, a detail title tile and four dial views](assets/img/readme-hero.png)

*Production-rendered sample data: Mac catalog readings, several under custom labels (CPU super 1, CPU activity, Network RX, Free space). Rendered with **Accent colors** set to **Theme accent everywhere**, so graphs use each theme's accent instead of the default colors by sensor type. Values are illustrative; this is not a hardware photograph.*

## What goes on the deck

| Action | What it shows | Where it goes |
| --- | --- | --- |
| [Sensor Reading](sensor-reading.html) | One to four readings on a key. A single reading can have a sparkline, bar or ring under it. A press cycles min, max and average. Themes, warning and critical colors. | A display key on a deck with keys ([Stream Deck models](hardware.html#stream-deck-models)); physical key checks are pending |
| [Sensor Dial](sensor-dial.html) | One reading, two rows or three rows on the touch strip. Turn through a reading set; local session min, max and average. | A dial on a Stream Deck + or + XL |
| [Sensor details](sensor-details.html) | A **Press** choice on Sensor Reading: a page of tiles for the reading's group or your own list, with a Back tile | Decks with a bundled detail view ([Sensor details support](hardware.html#sensor-details-support)) |
| [Sensor Control](dial-controls.html#the-sensor-control-key-action) | Steers Sensor Dials: next or previous reading, pause, pin, reset statistics | Any key, pedal or Multi Action step |

Which readings appear depends on the Mac and its macOS version. The measured M5 Pro reports 52: 14 from system counters and 38 from the SMC ([Readings measured on the M5 Pro](hardware.html#readings-measured-on-the-m5-pro)). CPU and GPU clock speeds and GPU usage are not offered.

## What it does not do

Mac Sensors reads. It has no fan control and no way to write a sensor register, installs no privileged helper, daemon or kernel extension, and needs no administrator password. It makes no internet requests and sends no telemetry. You choose when to copy and share a support report. [Privacy](faq.html#privacy) has the details.

## Mac Sensors 1.0.1.0

1.0.0.0 was the first release. 1.0.1.0 keeps its native readers byte for byte. It changes what a key shows for MIN, MAX and AVG, keeps reading through page changes, and changes how often keys redraw, how fast counter readings appear and what some status text says. The [changelog](changelog.html) lists every change.

### What changed in 1.0.1

| Change | What you see | What you need to do |
| --- | --- | --- |
| Key statistics | Pressing a Sensor Reading key, or **Value shown** on **Minimum**, **Maximum** or **Average**, shows the MIN, MAX and AVG that Mac Sensors keeps from the reads since the plugin last started reading sensors, instead of N/A. Detail tiles show the same numbers. They start over after a gap in that reading. Sensor Dials keep their own session statistics as before. | Nothing. A key already set to a statistic shows numbers from its next read. |
| Page changes keep reading | Changing pages, opening sensor details or pressing Back keeps reading going: key MIN, MAX and AVG, sparklines, CPU usage and the rates carry on, and keys do not show **Reading sensors**. Reading stops 2 seconds after the last Sensor Reading key, Sensor Dial or detail tile leaves the deck. See [When reading starts and stops](data-sources.html#when-reading-starts-and-stops). | Nothing. |
| One redraw per read | A key or dial that shows both system and SMC readings changes once per read instead of twice in quick succession, when both sources answer within 100 ms of each other. | Nothing. |
| **Read every** help | The setting under **Advanced**, **Connection** explains that one shared read updates every reading key and dial, that changing it clears sparkline history, and that shorter intervals use more processor time. | Nothing. |
| **Read every** limits | A blank value means the 1 second default. A stored value above 5 seconds runs as 5 seconds, so readings no longer expire between reads. | Nothing. Pick another interval from the list if you want one. |
| Counter readings sooner | CPU usage and transfer rates appear about a quarter second after reading starts, instead of one full read interval later. Reading starts when the first key, dial or detail tile appears, or a page returns after none was shown for 2 seconds. | Nothing. |
| No old values as live | When every reading lapses or fails before the first SMC read completes, keys and dials show **Reading sensors** instead of keeping old values as live. | Nothing. |
| Missing saved reading | A key whose saved reading this Mac does not report says **Sensor missing** and **pick again**. | Pick another reading under **Reading**, or wait until this Mac reports it again. |
| Intel support reports | When macOS has no translation flag, as on an Intel Mac, the support report's `translation` field now says `native` instead of `unknown`. Physical Intel validation is in progress. | Nothing. |
| Panel wording | Status text in the settings panel no longer names the plugin as the source of sensor data. The Text font line uses the same spacing as other fields. | Nothing. |
| Processor time | PERF.md records the final 1.0.1 release candidate and a rebuild of 1.0.0, each run as a development copy in the Stream Deck app 7.5.0 on the M5 Pro with 32 single-reading keys on an 8 by 4 Virtual Stream Deck, sampled by the development process observer. 1.0.1 used 0.668% of one core at 1 second against 0.855% for 1.0.0, and 2.478% against 3.164% at 250 ms. [Performance and resource use](faq.html#performance-and-resource-use) has the limits. | Nothing. |

### What is still pending

| Item | Status |
| --- | --- |
| Elgato Marketplace | Mac Sensors is not on the Elgato Marketplace yet. |
| Physical Stream Deck keys | Pending: readability at arm's length, alert colors, and the detail view and Back on a physical deck |
| Stream Deck + dials | Pending: turn, push, touch and long touch on a real deck |
| Intel | Physical Intel validation is in progress; [Hardware compatibility](hardware.html) has the hosted evidence. |
| App restart, sleep and wake | Pending: not yet observed with a real app restart or a real sleep |
| Hardware photograph | Pending. The images on these pages are production-rendered sample data or settings-panel captures. |

Unit tests, a mock Stream Deck host and a 24-hour observation on the measured Mac establish software behavior. They do not establish physical readability, dial gestures or Intel hardware behavior. [Hardware compatibility](hardware.html) lists what ran on which Mac and deck.

## License and trademarks

Free and MIT licensed. Not affiliated with Apple or Elgato. Mac and macOS are trademarks of Apple Inc. Stream Deck is a trademark of Corsair Memory, Inc.

## Find what you need

- [Installation and requirements](installation.html): install, check, update and remove the package.
- [Getting started](getting-started.html): your first reading in five steps.
- [Themes and colors](themes.html): pick one of seven themes and set reading colors.
- [Thresholds and alerts](thresholds.html): warning and critical colors.
- [Status screens](status-screens.html): what each two-line message means.
- [Data sources](data-sources.html): what each reading family means and when a value counts as fresh.
- [Troubleshooting](troubleshooting.html): find the exact message and the next step.
- [FAQ and privacy](faq.html): requirements, statistics, performance and privacy.
- [Report a bug](https://github.com/slawrensen/slawrensen.github.io/issues): name Mac Sensors and its version.
