---
layout: default
title: FAQ and privacy
nav_order: 13
description: "Requirements, statistics, performance and privacy."
---

For a status on a key or dial, see [Status screens](status-screens.html) and [Troubleshooting](troubleshooting.html). For changes by version, see the [changelog](changelog.html).

## Platform and requirements

### Does it work on other operating systems?

No. Mac Sensors runs only on macOS. Its manifest declares macOS as the only platform, and the package carries native readers for Apple silicon (arm64) and Intel (x86_64) Mac computers only.

### What are the exact requirements?

- macOS 13.5 or later
- Stream Deck app 7.1 or later, with the Node 24 runtime the app supplies
- Tahoma Bold, which ships with macOS ([Tahoma Bold prerequisite](installation.html#tahoma-bold-prerequisite)).

These are declared floors. Measured: Apple silicon M5 Pro, macOS 27.0.1, Stream Deck app 7.5.0, 7.6.0 and 7.6.1 on the Virtual Stream Deck. On a Stream Deck MK.2, keys, presses and opening details were checked; [Hardware compatibility](hardware.html#stream-deck-models) lists the physical checks not done yet, including Stream Deck + dial gestures. See also [Installation](installation.html).

**Sensor Reading** goes on keys. **Sensor Dial** needs a deck with dials, such as Stream Deck + or Stream Deck + XL.

### Is Mac Sensors affiliated with Apple or Elgato?

No. Mac Sensors is an independent project by Stephen Lawrensen, free and MIT licensed, with no ads. Its [source](https://github.com/slawrensen/mac-sensors-streamdeck) is on GitHub. It is not affiliated with Apple or Elgato. Mac and macOS are trademarks of Apple Inc. Stream Deck is a trademark of Corsair Memory, Inc.

### Do I need a separate sensor app?

No. The plugin reads macOS system counters and SMC readings itself, through the native reader in its package. It installs no separate monitoring app, privileged helper or daemon. There is also no data source to choose: each read covers the system counters and the SMC readings together. See [Data sources](data-sources.html).

## Mac models and readings

### Which Mac models and readings are supported?

Available readings depend on the Mac model and macOS version. A reading appears only when this Mac answers for it with a valid value.

On the measured Mac17,9 with the 18-core M5 Pro, the catalog has 68 SMC readings (temperatures, fans, power and related values), 6 readings computed from them (CPU average, Hottest core, Fan average, Battery hottest, Mac average and Hottest sensor), 14 system readings (CPU usage, memory counters, swap, startup volume space, and network and storage transfer rates) and 3 battery and drive health readings (Battery cycles, Battery health and SSD SMART, the internal SSD's own temperature). Another Mac with an Apple M1 to M6 or A18 Pro chip reads its chip family's table: per-core CPU temperatures and GPU temperatures, with CPU average and Hottest core computed from them. Those tables come from the Stats project, except the M5 Pro and M5 Max core rows, which follow the measured M5 Pro. I have not measured them on that hardware, and the 23 rows measured on the M5 Pro stay with that model. Every Mac also gets each fan's target, min and max speed, Fan average with two or more fans, Mac average and Hottest sensor. An Intel Mac, a virtual machine and a chip the table does not list get the common SMC readings and those computed ones only. CPU and GPU clock speeds and GPU usage are not offered.

[Hardware compatibility](hardware.html) lists what was measured. [Data sources](data-sources.html) explains what each reading means.

### Does it run on Intel Mac computers or under Rosetta?

The package carries a separate x86_64 reader, and the plugin loads it whenever its Node runtime is x86_64. Hosted Intel virtual machines with an emulated SMC have loaded it and read values; physical Intel validation has not been done ([Hardware compatibility](hardware.html#mac)).

On Apple silicon the plugin loads its arm64 reader when the Stream Deck app's Node runtime is arm64. Every Node runtime the Stream Deck app supplied on the measured M5 Pro is an arm64-only file, so it does not run under Rosetta. When Node runs as x86_64 under Rosetta, the plugin loads the x86_64 reader and the support report's `translation` field says `translated`. Outside the Stream Deck app, x86_64 Node 20, 22 and 24 running under Rosetta loaded that reader and read live values on the M5 Pro. The Stream Deck app itself has not been run under Rosetta, and Rosetta results are not Intel results.

### Why is a reading missing?

The key shows **Sensor missing** / **pick again** when its saved reading is not in the current catalog on this Mac. This Mac may not offer that reading, its last read may have failed, or its value may have expired: a failed reading is removed at once, and no value is shown more than 15 seconds after it was acquired.

The saved selection, label and colors stay. When the same reading returns, the key shows it again. The plugin never substitutes the nearest name or list position. See [Status screens](status-screens.html).

If values are shown but do not seem to change, see [Values do not seem to update](troubleshooting.html#values-do-not-seem-to-update).

## Statistics

### How are MIN, MAX and AVG calculated on a key?

macOS reports current values only, so Mac Sensors keeps its own statistics for every reading. MIN and MAX are the lowest and highest value accepted for the reading since the plugin last started reading sensors, and AVG is the arithmetic mean of those reads: one sample per read, including a read that repeats the last value, not weighted by time. Changing pages, opening sensor details and pressing Back keep them ([When reading starts and stops](data-sources.html#when-reading-starts-and-stops)).

The statistics belong to the reading, so every key and detail tile that shows it shows the same numbers. They start over after a gap in that reading (a read where it is missing, withheld or failed, or the reading expiring 15 seconds after its last read), when its unit or type changes, and when the plugin stops reading sensors (2 seconds after the last one disappears) or restarts. After a sleep, CPU usage and the transfer rates skip one read, so theirs start over. Changing **Read every** keeps them. A key has no command that resets them. The full rules are under [Value shown](sensor-reading.html#value-shown-stat-mode).

Alerts keep checking the current value whatever **Value shown** says.

### How do dial session statistics differ?

A Sensor Dial keeps its own minimum, maximum and average for each reading, from the observations it accepted since the session started. Each new acquisition counts once, including one with an unchanged value; drawing the same acquisition again does not count. Each reading in a rotation keeps its own session, so turning away and back shows that reading's numbers.

A session starts over when you reset it, when the reading goes missing, when its unit or type changes, or when a status screen replaces the readings. After a status screen, the first live frame shows **stats reset: data gap**. Sessions live in the plugin's memory only.

A dial and a key showing the same reading can therefore show different numbers. A key's statistics cover every read since the plugin started reading sensors. A dial counts only the reads made while it follows the reading (the reading on the dial, its rotation set or an overview's list), from when it first followed it or was last reset, and any status screen ends its sessions. See [Sensor Dial](sensor-dial.html#session-stats-are-the-dials-own-per-reading).

## Sparklines

### Why does a sparkline start empty and fill in?

The plugin keeps the last 36 samples of each graphed reading in memory and adds one per read while a Sensor Reading key (including the Back tile of a detail page), Sensor Dial or detail tile is visible. Every new acquisition is a sample, including one with an unchanged value. At the default **Read every** of 1 second, 36 samples take about 36 seconds; at 250 ms about 9 seconds; at 5 seconds about 3 minutes.

The line draws from the second sample and always spans the full graph width, so an early line is coarse and gains detail as samples arrive. Samples are spaced by count, not by time. CPU usage and transfer rates need two reads before they have a value; the second read runs about a quarter second after reading starts.

The line clears and starts again when:

- **Read every** changes (Advanced, Connection).
- A status screen replaces the readings, for example **Reading sensors** or **No sensor data**.
- The reading goes missing or has no valid value, or its unit or type changes.
- No Sensor Reading key, Sensor Dial or detail tile has been visible anywhere for 2 seconds, which stops reading. A page change, opening sensor details or pressing Back inside those 2 seconds keeps the line.
- The plugin restarts.

Switching **°F** on or off does not clear it: samples are stored in the reading's own unit.

## Performance and resource use

### How much CPU and memory does it use?

[PERF.md](https://github.com/slawrensen/mac-sensors-streamdeck/blob/main/PERF.md) records each measurement with its build, host and harness. The figures below are for an earlier 1.0.1 candidate, built before key statistics and the 2 second hold, run as a development copy in the Stream Deck app 7.5.0 on the M5 Pro (macOS 27.0.1), with 32 single-reading keys on an 8 by 4 Virtual Stream Deck. The harness was the development process observer, sampling the plugin process every 5 seconds in back-to-back runs against 1.0.0. CPU is the mean of two runs; RSS is the maximum of each run.

| Read every | Plugin CPU, one core | Maximum RSS |
| --- | --- | --- |
| 1 second (default) | 0.668% | 88.2 and 89.3 MiB |
| 250 ms | 2.478% | 95.9 and 94.6 MiB |

A 24-hour observation of the published 1.0.1.0, run as a development copy in the Stream Deck app 7.6.0 with 32 single-reading keys at 1 second, used 0.704% of one core, peaked at 92.55 MiB of RSS and closed at 50.41 MiB while the Mac was under memory pressure. It kept 12 threads and 49 to 50 file descriptors and logged no warnings or errors.

In four 10-minute runs as development copies in the Stream Deck app 7.6.0, with 32 single-reading keys at 1 second, the 1.0.2.0 package used 0.844% of one core against 0.690% for the published 1.0.1.0 (PERF.md). On the M5 Pro it reads 67 SMC and 3 battery and drive health readings where 1.0.1.0 read 38 SMC readings. A 24-hour observation of 1.0.2.0, run the same way in the Stream Deck app 7.6.1, used 0.790% of one core, peaked at 98.41 MiB of RSS and closed at 69.41 MiB. It kept 12 threads and 53 file descriptors and logged no warnings or errors.

Limits: one build's CPU differed by 35% between two sessions in the same harness, other development work ran during the measurements, and dials, detail views and keys that mix system and SMC readings were not measured in the app. These are recorded results on one Mac, not a promise for another.

### What does Read every change?

**Read every** (Advanced, Connection) sets how often the one shared read runs for every key and dial: 250 ms, 500 ms, 1 second (the default), 2 seconds or 5 seconds. Shorter intervals update sooner and use more processor time: in the table above, 250 ms used about 3.7 times the CPU of 1 second. An earlier 1.0.1 candidate in the same harness used 0.44% of one core at 2 seconds and 0.21% at 5 seconds.

Changing **Read every** clears sparkline history and keeps every MIN, MAX and AVG. A blank value means 1 second, and a stored value outside 250 ms to 5 seconds runs at the nearest limit.

### Does adding keys add more sensor reads?

No. One shared read per interval serves every visible Sensor Reading key, Sensor Dial and detail tile, however many there are. Each extra key adds drawing work and messages to the Stream Deck app, not another read. When none of them is visible anywhere, the plugin makes no new reads, and 2 seconds later reading stops until one appears; **Sensor Control** keys do not keep it running. With nothing visible, the plugin process keeps running and keeps its connection to the Stream Deck app. In the measured show and hide cycles it made no reads, ticks or frames while hidden; those cycles ran on a build without the 2 second hold, and this is not a measurement of idle CPU. See [When reading starts and stops](data-sources.html#when-reading-starts-and-stops).

A key can show up to four readings (**Readings on this key**), a dial can turn through a set of readings, and a key can open a detail page, so a deck can show more readings than it has keys. The measured bench above used 32 keys.

### Can several keys show the same reading?

Yes. Each key keeps its own **Label on the key**, layout, theme, **Text color**, **Decimals**, **°F**, **Value shown**, **Graph under the value** and alert thresholds. They all use the same shared read, draw the same sparkline history for that reading and show the same MIN, MAX and AVG.

## Alerts, thresholds and colors

### Why is a key amber or red?

The current value reached a threshold set under **Alerts** in that key's settings:

- At or past **Warn at**, the whole key turns amber with dark text.
- At or past **Critical at**, it turns red with white text.

By default a higher value is worse. Tick **Alert when the value drops to or below these numbers** where low is the problem, such as fan speed. Alerts check the current value in the reading's own unit (°F when **°F** is on), even when **Value shown** names a statistic; for bytes and rates they check the source's number and unit, which the key may show rescaled. On a key with several readings, only reading 1 is checked, and it recolors the whole key.

With **Graph under the value** set to **Bar** or **Ring**, muted amber and red zones mark the thresholds on the track whenever they are set, crossed or not. A zone marks where a threshold sits; the alert is the key's color change.

On a dial the face keeps its theme: the bar takes the alert color, or in an overview the row's value does. Once thresholds are set, the one-reading bar's track also marks the warning and critical zones in muted amber and red. Dial thresholds apply only to readings in the unit that was on the dial when you last changed them. Alert colors are the same in every theme. To turn alerts off, clear **Warn at** and **Critical at**. How the colors look on a physical deck has not been checked yet. See [Thresholds and alerts](thresholds.html).

### How do I reset a dial's session statistics?

- **Legacy** (the default): push the dial.
- **Elite**: hold the push for at least half a second.
- **Custom**: assign **Reset session stats** to **Short push**, **Long push**, **Touch tap** or **Long touch**.

**A stats reset clears** (under **Controls**) sets the scope: **This reading only**, **The whole rotation set** or **Every dial, everywhere (use with care)**. A **Sensor Control** key set to **Reset session stats** sends the same command from any key, pedal or Multi Action, with its own **A reset clears**. The next accepted observation starts the new session. A Sensor Reading key has no reset: its MIN, MAX and AVG start over only as [How are MIN, MAX and AVG calculated on a key?](#how-are-min-max-and-avg-calculated-on-a-key) describes. See [Dial controls and presets](dial-controls.html).

## Themes

### Why isn't Default the same as Void?

**Default** is a link. A key or dial set to Default follows the shared theme under **Advanced**, **Shared defaults**, **Theme**, which every Mac Sensors key and dial set to Default uses. On a fresh install the shared theme is Void, so Default draws Void until you change it. Picking the **Void** chip instead keeps that key on Void when the shared theme changes.

In the theme strip the Default chip has a dashed frame and a link mark. The line above the chips names what is drawn: *Default (shared: Void)* follows the shared theme; *Void (set on this key)* is the key's own pick.

If the plugin finds saved settings but no shared theme the first time an action appears, it starts the shared theme on Graphite instead of Void.

### Why doesn't a key follow my shared theme?

A theme picked on the key wins. Changing the shared theme affects only keys and dials set to **Default**. Pick the **Default** chip on that key to make it follow again, or choose **Make shared** to make the key's theme the shared one and set the key back to Default. See [Themes and colors](themes.html).

### Can I choose another font?

No. Faces use Tahoma Bold, and the panel shows **Text font: Tahoma Bold**. A font choice saved in a configuration document stays in the document and is not used.

## Privacy

### Is my data sent anywhere? Any telemetry?

No. The plugin makes no internet requests and has no telemetry or ads. It reads macOS interfaces and SMC readings on this Mac and draws the faces locally. Its only connection is the Stream Deck SDK's WebSocket to the Stream Deck app at the loopback address 127.0.0.1. Settings are stored by the Stream Deck app, and logs stay on this Mac. The only web address in the settings panel is a link to this documentation.

### What is in a support report?

**Copy support report** (Advanced, Support) builds a report on this Mac and copies it to the clipboard. Nothing is uploaded; it goes only where you paste it. It contains the plugin, Stream Deck app and macOS versions, the Node runtime version and architecture, the Mac model and chip, whether the plugin runs translated, the number of readings and any error codes from each source, the read interval and state, Stream Deck device models with hashed identifiers, and recent events.

It leaves out user names, serial numbers, hardware UUIDs, raw device identifiers and sensor values. Review a report before you share it. Event tracing is a development switch that is off unless set, and writes only to local logs. See [Copy a support report](troubleshooting.html#copy-a-support-report).

### Is the native reader signed? How do I verify what I installed?

The two native reader files, `bin/hwmac-arm64.node` and `bin/hwmac-x86_64.node`, are ad-hoc signed. An ad-hoc signature checks that a file is intact. It is not a Developer ID certificate, and the files are not notarized. Before it loads a reader, the plugin checks the file's SHA-256 against the list in its own package and checks its architecture and protocol; a mismatch shows **Bridge failed**.

Check the package as described in [Check the download](installation.html#check-the-download). To check the installed readers, compare the hashes the commands below print with the `sha256` entries in the same release's `native-manifest.json`, then inspect the signature:

```sh
cd ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.lawrensen.mac.sdPlugin/bin
shasum -a 256 hwmac-arm64.node hwmac-x86_64.node
codesign --verify --strict hwmac-arm64.node
codesign -dv --verbose=4 hwmac-arm64.node
```

The last command reports `Signature=adhoc`. A checksum identifies bytes; it does not establish that a file is safe.

## Hardware access

### Does it need administrator access, a helper or a kernel extension?

No. Mac Sensors installs no privileged helper, launch daemon or kernel extension and needs no root or administrator password for normal reads. On the measured Mac, installing it showed no prompt beyond the Stream Deck app's own install confirmation.

### Can it change fan speeds or write SMC values?

No. The reader is read-only. Its SMC path accepts only read and key-metadata requests and rejects every other request code before it reaches the SMC; a test sends all 256 codes to confirm it. There is no fan control or other setter. Alerts change only what the plugin draws.

## Setup and portability

### Do keys survive restarts and sensor changes?

Yes. A key saves the identity of its measurement, not a list position or label. A system reading is saved by its counter name, such as CPU usage. An SMC reading is saved by the Mac model, its four SMC key bytes and a meaning revision. That identity does not depend on catalog order, labels or build numbers, so a new order after a restart cannot point a saved key at a different reading. A custom label changes only what the key shows.

If the saved reading is absent, the key shows **Sensor missing** / **pick again** and keeps its settings. When the same identity returns, the key shows it again.

### Can I move settings to another Mac?

Yes, through configuration documents. Under **Advanced**, **Configuration documents**, **Copy** puts this key's settings or the shared settings on the clipboard as JSON. On the other Mac, paste it into the same box and choose **Replace this key's settings** or **Replace shared settings**. Replacing shared settings changes every Mac Sensors key and dial and asks for a second click. Fields this version does not know stay in the document.

System readings use the same identity on every Mac. An SMC reading's identity includes the Mac model, so on a different model that reading shows **Sensor missing** until you pick one there. Nothing is rebound automatically.

### What happens when my Mac sleeps?

After a sleep longer than 15 seconds, keys and dials can show **No sensor data** until the first read after waking returns, because every reading is older than its 15-second limit. After any sleep, CPU usage and transfer rates return one **Read every** interval later. This comes from the code and its software tests; real sleep and wake with a deck attached has not been checked yet. See [Sleep and wake](data-sources.html#sleep-and-wake).

### What do the two-line screens on my keys mean?

They name the condition the plugin can establish and the next step: for example **Reading sensors** before the first sample, **Sensor missing** for a saved reading this Mac does not offer now, **Tahoma needed** when the font is not installed, and **Bridge failed** when the native reader cannot load. The saved selection stays through every one of them, so there is no need to delete and rebuild a key. See [Status screens](status-screens.html) for each screen and [Troubleshooting](troubleshooting.html) for what to do.

### How do updates arrive?

From the [Elgato Marketplace]({{ site.plugin_release.marketplace }}), or as a newer `.streamDeckPlugin` package from [GitHub releases](https://github.com/slawrensen/mac-sensors-streamdeck/releases/latest) that you open. The plugin itself has no update channel and downloads nothing. Opening a package with the same version as the installed one does nothing; see [Opening the same version again does nothing](troubleshooting.html#opening-the-same-version-again-does-nothing).

## Help and reports

### Where do I report a bug or a security issue?

Report a bug in [GitHub Issues](https://github.com/slawrensen/mac-sensors-streamdeck/issues). Include the Mac Sensors version, the status on the key and where you got the package; a reviewed support report helps.

Report a suspected vulnerability through the [private security-report form](https://github.com/slawrensen/mac-sensors-streamdeck/security/advisories/new), naming the affected version. Do not post exploit details, profile exports or private logs in a public issue. The first reply target for a security report is seven days.

## Where to go next

For a screen on a key or dial, start with [Status screens](status-screens.html), then [Troubleshooting](troubleshooting.html). To set up a first key, see [Getting started](getting-started.html). For what each reading means, see [Data sources](data-sources.html), and for what was measured, [Hardware compatibility](hardware.html).
