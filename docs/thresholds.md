---
layout: default
title: Thresholds and alerts
nav_order: 9
description: "Set Warn at, Critical at or both to change the display when the live value reaches a limit: amber for warning, red for critical."
---

Set **Warn at**, **Critical at** or both to change the display when the live value reaches a limit: amber for warning, red for critical.

Open **Alerts** in the key or dial settings. Thresholds use the current value, even while a key shows MIN, MAX or AVG.

Both fields are optional and independent. A key with neither set shows its themed value.

Alerts change only what the plugin shows: colors, and with **Auto cycle jumps to a critical reading** ticked, which reading a dial shows. They never write to the Mac. The SMC transport accepts read and key-information requests only, so an alert cannot change a fan speed or a power limit.

![Four key faces labeled CPU super 1 and CPU usage: CPU super core 1 at 62.4 °C on the normal theme with a sparkline, the same reading on an amber warning face with a bar, the same reading on a red critical face with a bar, and a CPU usage bar with amber and red zones](assets/img/alerts.png)

*Production-rendered sample data: Mac catalog readings with the custom label CPU super 1 on the first three faces, and illustrative values. Warn at 60 and Critical at 80 for the amber face, Warn at 40 and Critical at 60 for the red face, both with a bar, and Warn at 65 and Critical at 85 for the CPU usage bar. Rendered with **Accent colors** set to **Theme accent everywhere**, so the normal faces use the Void accent instead of the default type accents.*

## The two fields

| Field | Effect on a **key** | Effect on a **dial** |
| --- | --- | --- |
| **Warn at** | The whole face turns amber with near-black text | The single view's bar fill turns amber; in an overview view, the alerting row's value |
| **Critical at** | The whole face turns red with white text | The single view's bar fill turns red; in an overview view, the alerting row's value |
| **Alert when the value drops to or below these numbers (for fans and clocks)** | Makes a low value the alarm | Same |

An empty field shows *Off*. On a dial the fields say what will change, such as *Off (bar turns amber)* in the single view and *Off (row value turns amber)* in an overview view.

Thresholds also mark the range on any face that draws one. A key whose **Graph under the value** is **Bar** or **Ring** (one-reading layout only) shows a muted amber zone from **Warn at** and a muted red zone from **Critical at**, running toward the alarmed end: the low end when the direction box is ticked. A dial's range bar marks them the same way. Zones are the alert colors blended toward the face background, and the live fill draws over them. A key's range is always automatic and widens to keep a zone visible. A dial with **Bar from** or **Bar to** set keeps those bounds, and a zone outside them is cut off. See [Graph under the value](sensor-reading.html#graph-under-the-value-sparkline-bar-ring).

## How the comparison works

### Thresholds are in the displayed unit

The value compared is the live reading in the unit the key shows, after the °C to °F conversion. Tick **°F** and a **Warn at** of `80` fires at 80 °F, which is about 26.7 °C; every temperature in a live read on the measured M5 Pro was above that. Enter Fahrenheit numbers instead: 176 for 80 °C. Leave °F off and the same reading compares in °C.

One exception: **Data units** rescales bytes and transfer rates for display only. Thresholds compare against the number in the reading's own unit, bytes or bytes per second. A Startup volume available reading of 292596883456 B shows 293 GB under Decimal and compares as 292596883456. Switching Decimal and Binary never changes an alert. See [Data units](sensor-reading.html#data-units).

| Mac readings | Unit a threshold compares in |
| --- | --- |
| Temperatures (CPU and GPU cores, Battery, NAND, Airport, Airflow) | °C, or °F with **°F** ticked |
| Fans | RPM |
| Power (System Total, DC In, Battery) | W |
| Voltage | V |
| Current | A |
| CPU usage | % |
| Memory total, free, active, inactive, wired and compressed; Swap used; Startup volume total and available | B (bytes) |
| Network receive and send; Storage read and write | B/s (bytes per second), also when the key shows Mbps |

### The trigger is at or past the limit

Reaching the number is enough:

- Normal direction (higher is worse): alerts when the value is at or above the threshold.
- Below direction (lower is worse): alerts when the value is at or below the threshold.

Critical is checked before warning, so a reading past both limits shows critical. A value that is not a finite number never alerts.

### Decimal commas are accepted

Both fields accept a period or a comma as the decimal point, so `70.5` and `70,5` both mean 70.5. Do not group digits with commas: `50,000` means 50, and a value with two commas is not a number. Blank means no threshold.

Anything that is not a number is kept as typed but ignored, and the field says so under it: *Not a number. Alerts ignore this field until it is one.* The folded Alerts title then names the field, such as *warn value is not a number*, or reads *Off: the values entered are not numbers* when neither field is a number.

The fields also accept exponent notation, which helps with byte thresholds: `50e9` means 50000000000.

## Direction: alert when high or when low

By default higher is worse: the right setting for temperatures, power, CPU usage and transfer rates. Tick **Alert when the value drops to or below these numbers (for fans and clocks)** for readings where low is the problem:

- **Fan speed**, on a fan that should keep spinning.
- **Startup volume available**, to know when free space drops under a floor.

With the box ticked, **Warn at** and **Critical at** become floors: the alert fires when the reading falls to or below them.

## Alert colors

Key alert palettes are the same on every theme: amber `#E8940D` with near-black text `#1C1200` for warning, red `#CB2114` with white text for critical. The value text calculates to about 7.6:1 on the amber and about 5.6:1 on the red. Type accents, quad cell colors and a **Custom color** text setting do not override them.

A dial keeps its theme while alerting. Its single view fills the bar with `#E8940D` or `#CB2114`. Its overview views color the alerting row's value `#E8940D` for warning and `#FF3B30` for critical, adjusted toward 4.5:1 against the row background when needed.

Contrast is a calculation. Physical recognition across devices and color-vision differences has not been established; for device checks, see [Hardware compatibility](hardware.html). [Themes and colors](themes.html#alert-colors-take-priority) lists every alert token.

## Worked examples

The readings below come from a live read on the measured M5 Pro at 15.7 percent CPU usage. The limits are example values: choose limits for your Mac and how you use it. The plugin does not offer a hardware safety limit.

### CPU temperature: warn 80, critical 90

In that read, **CPU super core 1** was 49.6 °C.

- **Warn at** `80`
- **Critical at** `90`
- **Alert when the value drops**: unticked (higher is worse)

Below 80 °C the key stays themed. At 80 °C it turns amber; at 90 °C, red. The folded Alerts title reads *Warn ≥ 80 °C · critical ≥ 90 °C*. To read the face in Fahrenheit, tick **°F** in Display **and** enter `176` and `194`; the title then reads *Warn ≥ 176 °F · critical ≥ 194 °F*.

### Fan speed: alert when it drops

A floor for a fan you expect to spin:

- **Warn at** `500`
- **Critical at** `300`
- **Alert when the value drops**: **ticked**

Above 500 RPM the key is normal. At 500 or below it warns; at 300 or below it turns red, and a fan reading 0 RPM is red.

In the same read, **Fan 1** and **Fan 2** both read 0 RPM. A floor on those fans turns the key red whenever they read 0, so use a floor only on a fan that should always spin. To catch a fan speeding up instead, leave the box unticked and set **Warn at** to a speed you choose. Set **Decimals** to **0** on fan keys: Auto shows 0 RPM as 0.00.

### Free space on the startup volume

**Startup volume available** reports bytes. In the same read it was 292596883456 B, which the key shows as 293 GB under Decimal or 273 GiB under Binary. Enter the limits in bytes:

- **Warn at** `50000000000` or `50e9` (50 GB)
- **Critical at** `20000000000` or `20e9` (20 GB)
- **Alert when the value drops**: **ticked**

When free space drops to 50 GB the key turns amber, and at 20 GB red. The folded title reads *Warn ≤ 50000000000 B · critical ≤ 20000000000 B*. If you think in binary units, 50 GiB is `53687091200`.

### Network rate in bits

**Network receive** reports bytes per second, and Decimal shows bits per second. To warn at 100 Mbps, enter `12500000`: 100 million bits per second divided by 8. In the same read, Network send was 2909517.6 B/s, shown as 23.3 Mbps.

> **Tip:** With the below direction, set **Critical at** lower than **Warn at**: critical is the deeper floor. Because critical is checked first, an inverted pair (Warn at 300, Critical at 500, box ticked) turns red at 500 and never shows amber. The same holds in the normal direction: a **Critical at** below **Warn at** turns red first.

## Where thresholds live

**Warn at**, **Critical at** and the direction box are in the **Alerts** section of both the Sensor Reading and Sensor Dial settings panels, below Display. The folded title states the rule in force and whether it is firing now (*warning now*, *critical now*). There is one pair of limits per key and per dial, saved with the rest of that action's settings ([Sensor Reading settings](sensor-reading.html#settings), [Sensor Dial settings](sensor-dial.html#settings)).

On the **Two readings, stacked**, **Three readings, rows** and **Four readings, quad grid** key layouts, that one pair watches the **first** reading only. The other rows or cells never raise an alert of their own, and the whole key recolors when the first reading crosses. The Alerts help says *Only reading 1 is checked; it recolors the whole key.* Put the reading you want alerts on first, or give it its own key.

On a **dial**, thresholds and the manual bar range apply only to readings in the unit that was on the dial when you last changed any of them, because rotation can put readings with different units on one dial: a °C limit never fires on a fan you rotate to. The folded title adds the unit, such as *°C readings only*. A dial can also jump to a critical reading with **Auto cycle jumps to a critical reading in the rotation and holds there while it stays critical**. Details: [Alerts on a dial](sensor-dial.html#alerts-on-a-dial) and [Thresholds and mixed units](dial-controls.html#thresholds-and-mixed-units).

In a [detail view](sensor-details.html), reading tiles draw without alert colors. A Back tile with its own reading follows its own Alerts settings; an unconfigured Back tile shows the opener's reading with the opener's thresholds.

## Where to go next

- [Sensor Reading](sensor-reading.html#warn-at-and-critical-at): where the fields sit on a key, with Bar and Ring zones.
- [Alerts on a dial](sensor-dial.html#alerts-on-a-dial): bar fill, overview rows and unit scoping.
- [Themes and colors](themes.html#alert-colors-take-priority): the alert palettes against every theme.
- [Troubleshooting](troubleshooting.html#thresholds-do-not-fire): when an alert does not fire.
