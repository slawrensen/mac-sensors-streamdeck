---
layout: default
title: Hardware compatibility
nav_order: 12
---

# Hardware compatibility

Check your Mac and deck and the evidence behind each row. A result from one Mac or one release does not qualify another.

- **Measured**: ran in the Stream Deck app on my Mac, with a recorded result.
- **Hosted VM**: ran on hosted CI runners in a virtual machine. This is software evidence, not a physical-device result.
- **Software tests**: exercised by unit tests or a mock Stream Deck host that simulates device registration and events. Not a physical-device result.
- **Pending**: not run yet.
- **Not claimed**: no support is claimed.

## Compatibility matrix

### Mac

| Mac | Evidence | What ran |
| --- | --- | --- |
| Apple silicon: Mac17,9 with M5 Pro, macOS 27.0.1 | **Measured** | Stream Deck app 7.5.0 with its Node 24.13.1 on the 8 by 4 Virtual Stream Deck: the 1.0.0.0 package installed from Finder, 14 system and 38 SMC readings, and a 24-hour observation of the final 1.0.1 release candidate, run as a development copy in the Stream Deck app with the development process observer, with 32 keys at the 1 second default (24.017 hours, 1,442 samples, no warnings or errors, resource and freshness check passed). The native reader was also checked under Node 24.22.1, another runtime the app carries. |
| Other Apple silicon models | **Pending** | Not run. The table of generation-specific SMC readings is qualified only for Mac17,9 with the M5 Pro chip. On another Apple silicon model the plugin offers the 31 common and 4 Apple silicon SMC keys its SMC answers, the system counters the Mac reports, and the battery and drive health readings its hardware has, but no computed readings. |
| Intel | **Hosted VM** | The x86_64 native reader in 1.0.1 is byte-identical to the one in 1.0.0. Hosted Intel CI runners (a virtual machine with an emulated SMC) loaded that exact file and read live system and SMC values for both 1.0.0 and the 1.0.1 release candidate. Physical Intel validation is in progress. |
| Rosetta on the M5 Pro | **Pending** in the app | Outside the Stream Deck app, x86_64 Node 20, 22 and 24 running under Rosetta loaded the x86_64 reader and read live values on this Mac. Running the whole Stream Deck app under Rosetta has not been checked. The Node runtimes the Stream Deck app supplies on this Mac are arm64 files. |
| macOS 26.6 | **Hosted VM** | Hosted Apple silicon runners on macOS 26.6.2 and Intel runners on macOS 26.6.1 ran the full test suite and loaded and read the exact shipped native readers. No physical Mac has run Mac Sensors on macOS 26. |
| macOS 13.5 to 15 | **Pending** | 13.5 is the declared floor. Mac Sensors has not run on these versions. |

The package requires Stream Deck 7.1 or later, which plugins that use the Node 24 runtime need. The app supplies that runtime and chooses its version; the measured app ran the plugin on 24.13.1.

### Stream Deck models

| Deck | Keys | Dials | Evidence |
| --- | --- | --- | --- |
| Virtual Stream Deck | Yes | No | **Measured** at 8 by 4 on the M5 Pro with app 7.5.0. The plugin takes the grid the app reports and treats this deck as having no dials. |
| Stream Deck, 15 keys (5 by 3) | Yes | n/a | **Software tests**: the mock host registers a 5 by 3 deck and drives keys on it. Physical key checks are pending. |
| Stream Deck + | Yes | Yes, 4 | **Software tests**: the model table gives it four dials and a touch strip of 200 by 100 per dial. Dial events run in the mock host on a + XL, which uses the same dial code. Physical dial gestures are pending. |
| Stream Deck + XL | Yes | Yes, 6 | **Software tests**: the mock host registers a + XL, draws six dials on it and sends dial turns. Synthetic gesture traces replay through the production gesture code. Physical dial gestures are pending. |
| Stream Deck XL, Mini, Neo | Yes | n/a | **Software tests**: their grids (8 by 4, 3 by 2, 4 by 2) are locked by capability tests, and each has a bundled detail view. Not run on hardware. The Neo detail page's device model comes from the Stream Deck app's own device table, not from a Neo profile export, so its install has not been checked even in software. The plugin does not use the Neo's info bar or touch points. |
| Stream Deck Mobile | Yes | n/a | **Pending**: its grid is taken from what the app reports. It has no bundled detail view. |
| Corsair Voyager | Yes | n/a | **Pending**: the model table names it as a deck with keys only; its grid is taken from what the app reports. It has no bundled detail view. |
| Stream Deck Pedal, Corsair G-Keys, SCUF controllers | Sensor Control only | n/a | **Pending**: the model table marks them as having no display, so the sensor actions draw nothing there. **Sensor Control** can steer dials on another deck from them. |
| Stream Deck Studio, Galleon 100 SD | Not claimed | Not claimed | **Not claimed**: neither is in the model table, so both take the unknown-device fallback. Keys and input are still handled, the support report lists the deck as "Unknown device (type 10)" or "Unknown device (type 12)", and the plugin log names its type as the app reports it. Studio's dials have no strip the plugin can draw on. Galleon's screen takes 720 by 384 images, not the 200 by 100 per-dial faces this plugin draws. |
| Unknown future devices | Fallback | Fallback | **Not claimed**: capabilities come from the reported grid, input events are always handled, and drawing does nothing where there is no display. |

## Readings measured on the M5 Pro

On Mac17,9 with the M5 Pro and macOS 27.0.1, the picker lists 71 readings: 14 from macOS system counters, 51 from the SMC, 3 computed from SMC readings, and 3 battery and drive health readings. Another Mac can report a different set.

| Group | Readings on the measured Mac | Source |
| --- | --- | --- |
| CPU | CPU usage; 6 super core and 12 performance core temperatures; CPU average and CPU hottest core | System counters; SMC; computed |
| GPU | 7 GPU temperatures | SMC |
| Memory | Memory total, free, active, inactive, wired and compressed; swap used | System counters |
| Storage | Startup volume total and available; storage read and write rates; Internal SSD temperature | System counters; health |
| Network | Network receive and send rates | System counters |
| Battery | Battery and Battery 2 temperatures; Battery power; Battery cycles and Battery health | SMC; health |
| Fans | Fan 1 and Fan 2 speeds; their target, minimum and maximum speeds; Fan average | SMC; computed |
| System | NAND, Airport, Airflow left, Airflow right and Airflow top temperatures; Charger proximity, Power supply proximity, Thunderbolt left, Thunderbolt right, Trackpad and Trackpad actuator temperatures; DC In and System Total power; DC In current; DC In voltage | SMC |

CPU and GPU clock speeds, private GPU usage and the HID temperature channels are not offered. [Data sources](data-sources.html) explains what each reading family means.

## Sensor details support

The [sensor detail view](sensor-details.html) ships one bundled page per deck type: Mini (3 by 2), 15-key (5 by 3), Neo (4 by 2), + (4 by 2 keys), XL (8 by 4) and + XL (9 by 4 keys). Back is the top-left key on every page. The Mini page has no title tile; on the XL and + XL pages Back, title, Previous and Next run down the left column.

The Virtual Stream Deck borrows the page with the most reading tiles whose key grid fits its size, from every page except the + page; a virtual deck at least 9 keys wide and 4 keys high runs the + XL page. The first time details open on each kind of deck, Stream Deck asks to install the bundled detail view, and asks again after an update that changes it.

The bundled pages are checked by archive tests and by a mock-host detail run on the 15-key page. The detail view and Back on a physical deck are pending.

Decks without a bundled page (Mobile, Studio, Galleon, Corsair Voyager, Pedal, G-Keys, and a Virtual Stream Deck too small for the 3 by 2 Mini page) do not open details: the key shows the Stream Deck alert triangle and the deck stays on its page.

## Page swipe and page changes

On a Stream Deck +, a sideways swipe on the touch strip changes pages. The Stream Deck app handles the swipe. Readings, labels and colors are saved settings, so they come back with the page.

A hidden dial keeps its pause and pin for up to 30 minutes, and its session statistics for as long as reading continues; the plugin keeps the state of the 64 most recently hidden dials ([Pause, pin, and reset reach](dial-controls.html#pause-pin-and-reset-reach)). While a Sensor Reading key, Sensor Dial or detail tile stays visible anywhere, the plugin keeps reading and the hidden dial keeps adding to its session statistics.

The Stream Deck app removes the old page's actions before it shows the new page's, so a page change leaves a moment with nothing visible. The plugin keeps the reading for 2 seconds after the last Sensor Reading key, Sensor Dial or detail tile disappears (Sensor Control keys do not count), with no new reads in that time. A page with one that appears within those 2 seconds continues the same reading: key MIN, MAX and AVG, sparklines, CPU usage and the rates and dial sessions carry on, and keys show readings at once. After 2 seconds with none visible, reading stops, sparkline history is cleared and every reading's MIN, MAX and AVG end. When a page with one returns after that, keys show **Reading sensors** until the first read, and CPU usage and transfer rates appear about a quarter second later. A dial that returns this way starts a new session and says **stats reset: data gap** once live data arrives. See [When reading starts and stops](data-sources.html#when-reading-starts-and-stops).

Physical swipes are pending; this behavior comes from the code and its software tests.

## Hardware test procedure

You can check a deck yourself and report the result:

1. Install the plugin. Put at least one **Sensor Reading** key on the deck and, if it has dials, one **Sensor Dial** with at least two readings in its rotation.
2. Confirm the key shows a value and its settings header says **Live · Mac sensors**.
3. On keys: judge at arm's length whether each label and value is readable. Set **Warn at** just below the current value and leave **Critical at** blank to see the warning color, then set **Critical at** just below the current value to see the critical color. Set the key's **A press** to **Opens sensor details** and press it. The first time on each kind of deck, accept the app's prompt to install the detail view within 30 seconds. Then press **Back**. Switch to another page and back.
4. On dials, in this order: **Turn** two slow turns each way and one fast spin; **Short push**; **Long push**; **Pressed turn**; **Touch tap**; **Long touch**; then a page swipe away and back. Note what the dial did for each step. [Dial controls](dial-controls.html) says what each gesture does in your preset.
5. Open the dial's settings, then **Advanced**, **Support**, and choose **Copy support report**. The report keeps only the most recent 24 events, so copy one report after the turns and another after the pushes and touches.
6. Open an issue on [the documentation repository](https://github.com/slawrensen/slawrensen.github.io/issues) titled `Hardware report: Mac Sensors 1.0.1.0, [Mac model], [deck]` with your notes and the reports.

## Event recorder

For development, the plugin has an event recorder. It is off by default. With `MACSENSORS_TRACE_EVENTS=1` in the plugin process environment, the plugin appends one JSON line per dial input, dial appearance and disappearance, dial reading change, **Sensor Control** command, dial redraw and source observation to `logs/trace-<pid>.jsonl` in the plugin folder, and its log says the recorder is on.

The trace is redacted where it is written: device IDs and reading identities are hashed, and no sensor values, sensor names, computer names or user paths are recorded. Its field names match the replay fixtures in the plugin's tests, so a capture from real hardware can replace a synthetic trace.

A tested way to start the Stream Deck app with that variable on macOS has not been recorded, so the procedure above uses the support report, which always carries the most recent events.

## Support report

**Copy support report** is under **Advanced**, **Support** on a Sensor Reading key or a Sensor Dial, and under **Advanced** on a Sensor Control key. It builds a local JSON summary, including whether the event recorder is on, and copies it to the clipboard. [Copy a support report](troubleshooting.html#copy-a-support-report) lists the main parts of the report.

It contains no sensor values or reading names, and the Node path shows your home folder as `~`. Nothing is uploaded: the plugin makes no internet requests, and its only connection is the local link to the Stream Deck app. Detail view tiles have no settings of their own and no report button. Review the report before you post it.

## Where to go next

- [Installation and requirements](installation.html): declared floors next to what actually ran.
- [Sensor details](sensor-details.html): the detail page on each supported deck.
- [Dial controls and presets](dial-controls.html): what each gesture does.
- [Troubleshooting](troubleshooting.html): find a status message and its next step.
- [FAQ and privacy](faq.html): Intel, Rosetta, performance and privacy questions.
