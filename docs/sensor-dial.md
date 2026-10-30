---
layout: default
title: Sensor Dial
nav_order: 6
description: "The Sensor Dial action shows Mac Sensors readings on the touchscreen above a Stream Deck + or Stream Deck + XL dial."
---

The **Sensor Dial** action shows Mac Sensors readings on the touchscreen above a Stream Deck + or Stream Deck + XL dial. Choose one reading with a range bar, two readings with trend lines, or three compact rows. Turn the dial to change the reading; push and touch it to control the display.

**Requires:** a Stream Deck + or + XL. Set **View** under **Display** for the layout, and **Gestures** under **Controls** for what the dial's inputs do.

Dial gestures have not yet been run on a physical Stream Deck +. The gesture map on this page and on [Dial controls and presets](dial-controls.html) is what the code implements and its tests check. Requirements and what has been measured are on [Hardware compatibility](hardware.html).

![Three Sensor Dial faces: CPU super 1 at 62.4 °C in the one-reading view with its session low 39.9, high 63.7 and a range bar with amber and red zones at the right; the two-row view with CPU super 1 and GPU 1 and their trend lines; and the three-row view with CPU SUPER 1, GPU 1 and FAN 1 under a session line.](assets/img/dials.png)

*Production-rendered sample data with Mac catalog readings under custom labels and illustrative values, drawn with **Accent colors** set to **Theme accent everywhere**. The minimum, maximum and session tag are local session statistics.*

## The touchscreen readout

Each dial draws into its own 200 by 100 pixel segment of the touchscreen, filled with the theme's background. The one-reading view draws four things, top to bottom:

| Element | Shows |
| --- | --- |
| **Title** | Your **Title on the dial**. Left blank, the name you gave the reading with **Rename** in the rotation list, else the reading's own label. A title too wide for the segment is cut to fit. |
| **Value and unit** | The live reading, formatted by **Decimals**, with the unit inline. While you view a session statistic instead of the live value, a badge follows the unit: `· MIN`, `· MAX` or `· AVG`. Long text steps down to a smaller size so it stays inside the segment. |
| **Stats line** | `▼ <low>   ▲ <high>   session`: the lowest and highest values this dial has observed for the reading in this session. Byte and rate readings pack it tighter, as `▼<low> ▲<high> session`. `pinned` replaces `session` while the dial is pinned, and `cycle paused` while an auto cycle is set and paused. A line too long at 12 px draws at 11 px; a line too long even then leaves off `session` first, and only then is cut. |
| **Range bar** | A fill showing where the **live** value sits between the bar's two ends, over the warn and critical zones when thresholds are set. |

The bar always follows the live value, even while the number above it shows MIN, MAX or AVG.

A short message takes the whole stats line for about 1.6 seconds, then the line returns:

| Message | When |
| --- | --- |
| A group name, such as `GPU` or `group 2` | A group jump landed in that group |
| `stats reset`, `set stats reset`, `all dials reset` | A reset cleared this reading, the rotation set, or every dial |
| `cycle paused`, `cycle resumed` | The auto cycle was paused or resumed |
| `pinned`, `unpinned` | The dial was pinned or unpinned |
| `stats reset: data gap` | The first live frame after sensor data was unavailable |
| `stats reset: units changed`, `stats reset: reading changed` | The reading on the dial changed its unit or its type, so its session started again |

## Views

**View** under **Display** offers the one-reading face and two multi-row layouts. Both multi-row layouts list what rotation moves through:

- **Overview, two rows (big values and trend)**: two rows with large right-aligned values. The selected row sits on a band with an accent bar at its left edge. A long label wraps onto a second line; a row whose label fits on one line draws a trend line of its last 36 samples there when it has room. The footer shows the selected reading's session low and high.
- **Overview, three rows**: one line per reading. A thumb on the left rail marks the reading on the dial and where the visible window sits in the list. The context line carries the shared name, the state tags and the session `▼low ▲high`; names shorten before statistics. Put it above or below the rows with **Context line**, and show or hide the lines between rows with **Separators**. A temporary message replaces the context line for its moment.

<a class="image-link" data-image-viewer href="{{ '/assets/img/settings-dial.png' | relative_url }}" aria-label="Enlarge image: The Sensor Dial settings panel with the dial face in its header showing three rows, the theme strip on Void, the Reading section with CPU super core 1 on the dial and a rotation of three readings, and the Display section on Overview, three rows with Row labels, Context line, Separators, Color numbers by sensor type and Reading colors." data-image-caption="Settings-panel capture of the staged 1.0.1.0 panel in a simulated host with sample data. Shared Accent colors set to Theme accent everywhere."><img src="{{ '/assets/img/crops/settings-dial-display.png' | relative_url }}" width="756" height="1462" loading="lazy" decoding="async" alt="The Sensor Dial settings panel header with the dial face showing three rows, above the Display section on Overview, three rows with Row labels, Context line, Separators, Color numbers by sensor type and Reading colors."></a>

*Settings-panel capture of the staged 1.0.1.0 panel in a simulated host with sample data, showing the header and the **Display** section; the full capture opens from the image. Shared **Accent colors** set to **Theme accent everywhere**.*

Three things keep short labels readable:

- **Shared words move to the context line.** When the visible rows' labels start with the same words, such as `Memory free`, `Memory active` and `Memory wired`, the shared part is shown once and the rows read `free`, `active` and `wired`. The three-row face puts `Memory` on the context line; the two-row face puts it at the end of its footer. Names you type yourself are never shortened, and a reading whose whole label is the shared words keeps it. To keep every label whole, set **Row labels** to **Always full labels**.
- **Values share one right-aligned column.** Units sit in their own column beside it. The three-row face steps the value size down from 20 to 12 px until the widest visible value fits, and each row's label runs up to its own value before it shortens. A wide rate unit in view moves the value and unit columns left together, so the unit is not cut at the screen edge. The two-row face places its columns by the widest visible value.
- **You can rename any reading in the rotation.** Select it in the list under **Readings to rotate through** and press **Rename** in the toolbar under the list (or double-click it, or press F2 in the list). Type the new name in the **Name on the dial for ...** field; Return or clicking away saves it, and an empty field goes back to the reading's own name. The name shows on that reading's row and as the dial's title whenever that reading is on the dial, in every view. Removing the reading from the rotation keeps its name for later.

### What the overview lists

The overview has no list of its own to manage. It shows what rotation already steps through, in the same order:

- your **rotation set**, if you built one (any size; the view shows a two- or three-row window of it),
- the **active rotation group**, when [rotation groups](dial-controls.html#rotation-groups) steer a plain turn,
- otherwise the readings of the **same sensor group** as the reading on the dial, such as every CPU reading.

Turning works as in the one-reading view: the selection steps through the whole list and is saved, the mark follows it, and the window scrolls with the selection, held at both ends. Auto cycle, alert interrupts, pin, pause, group jumps, touch taps and [Sensor Control](dial-controls.html#the-sensor-control-key-action) keys keep working. A touch tap through MIN, MAX and AVG switches every row to that statistic, each row from its own session, and the stat badge joins the state tags.

Details specific to the overviews:

- The range bar and the big value belong to the one-reading view. **Bar from** and **Bar to** are hidden on the overviews and not used there; their values stay saved.
- **Warn at** and **Critical at** still apply, scoped to their unit as always: a row whose live value crosses a threshold shows its value in the alert color, and the alert-aware auto cycle can pull the selection, and so the window, to it.
- **Title on the dial** renames the marked row only, and it clears when the dial moves on to another reading unless **Title when the dial moves on** is **Stays for this dial**. Names given with **Rename** stay with each reading.
- Values are cut at 12 characters, and every row uses this dial's **Decimals** setting. Units are cut at 4 characters on the three-row face and 5 on the two-row face.
- With fewer readings than rows, the overview lists what there is. The status faces are the same as the one-reading view's.

Switching back to **One reading** restores the one-reading face.

## Reading colors

Choose one of the two overview **View** options under **Display**. **Color numbers by sensor type** and **Reading colors** then appear under the overview options.

- **Reading colors** offers **Automatic**, **Signal (four hues)**, **Pairs (two hues)** and **Uniform**. A preset colors the listed readings in order. When the colors match no preset, the select shows **Custom**.
- Click a reading's color well to give its number a color of its own. Two temperatures can have different colors.
- **Auto** beside a reading resets that reading; **Automatic** resets every listed reading. A reading without a chosen color follows **Color numbers by sensor type**, or normal text.

The list covers the rotation set (all groups), or the reading on the dial and the rest of its sensor group when there is no set. Colors are saved per reading and follow it through rotation, reordering and groups. Individual reading colors work whatever **Accent colors** is set to, and on Paper; only a valid custom text color overrides them. Switching views, or removing and adding a reading again, keeps its saved color. Labels, units, the footer, trend lines and the selection mark keep their usual styling.

![Two three-row dial faces with the same readings: on the left every number in the theme's text color, on the right the CPU SUPER 1 value in blue, the GPU 1 value in rose and the FAN 1 value in green, with identical labels, units and layout.](assets/img/reading-colors.png)

*Production-rendered sample data, drawn with **Accent colors** set to **Theme accent everywhere**. Only the number colors differ between the two faces; geometry and words are the same.*

<a class="image-link" data-image-viewer href="{{ '/assets/img/settings-reading-colors.png' | relative_url }}" aria-label="Enlarge image: The full Sensor Dial settings panel with View on Overview, three rows, Reading colors on Signal (four hues) with a color well and an Auto button for CPU super core 1, GPU 1 and Fan 1, then the Alerts, Controls and Advanced sections open." data-image-caption="Settings-panel capture of the staged 1.0.1.0 panel in a simulated host with sample data, showing individual reading colors. Shared Accent colors set to Theme accent everywhere."><img src="{{ '/assets/img/crops/settings-reading-colors-display.png' | relative_url }}" width="756" height="1184" loading="lazy" decoding="async" alt="The Display section of the Sensor Dial settings with View on Overview, three rows, and Reading colors on Signal (four hues) with a color well and an Auto button for CPU super core 1, GPU 1 and Fan 1"></a>

*Settings-panel capture of the staged 1.0.1.0 panel in a simulated host with sample data, showing the **Display** section with individual reading colors; the full panel opens from the image. Shared **Accent colors** set to **Theme accent everywhere**.*

**Color numbers by sensor type** is off by default. It needs **Text color** on **Theme text** or **Dimmed**, and **Accent colors** on **By sensor type** under **Advanced**, **Shared defaults**. Numbers then take their sensor type's accent color. On the Paper theme, and for readings whose type has no accent, numbers keep normal text.

**Theme text** keeps chosen reading colors exact; **Dimmed** dims them. A valid **Custom color** for text overrides reading colors. Warning and critical values keep priority. Leave both number-color controls at their defaults to keep normal text. See [Themes and colors](themes.html).

## Gestures

These are the **Legacy** preset's gestures, which every dial runs until you pick another preset. [Dial controls and presets](dial-controls.html) covers Elite and Custom, the pressed turn, touch zones, pause and pin, **A stats reset clears** and the Sensor Control key.

| Gesture | Effect |
| --- | --- |
| **Turn** (pressed or not) | Steps through your [rotation set](#rotation-set-ignore-turns-and-auto-cycle) if you built one, otherwise through the readings of the same sensor group as the reading on the dial, wrapping at both ends. The new choice is saved. Does nothing while **Ignore turns** is on or the dial is pinned. |
| **Push** (press the dial) | Resets the session min, max and average. On Legacy this happens the moment the dial goes down. |
| **Touch tap** (tap the screen) | Cycles the displayed number: current, session min, session max, session average, then current again. |
| **Long touch** (touch and hold) | Returns to the live current value. |

Without a rotation set, a turn only walks readings from the same sensor group as your current pick (CPU, GPU, Memory, Storage, Network, Battery, Fans or System), so you can step through every fan without leaving the Fans group. To reach another group, pick a reading under **On the dial now**, build a rotation set that crosses groups, or use the Elite preset's pressed turn.

## Rotation set, Ignore turns, and Auto cycle

Three settings control how rotation moves.

**Rotation set.** Tick readings in the **Readings to rotate through** search (in the **Rotation** group under **Reading**) to build a list. The dial then rotates through only those readings, in list order, wrapping at both ends. Ticking never changes the reading on the dial; the **On the dial now** picker above it does that. The set can mix readings from different sensor groups.

- The ticked readings show as a list under the search, in rotation order. Select one and use **Earlier**, **Later**, **Rename** or **Remove** in the toolbar under the list. In the list, Option with Left or Right Arrow moves the selected reading, Option+Home and Option+End move it to either end, F2 renames it and Delete removes it.
- The reading on the dial right now is highlighted. Turn the dial, jump groups or let the auto cycle run with the panel open, and the highlight moves with it.
- A ticked reading this Mac is not reporting right now keeps its place, shows a **missing** pill and is skipped until it returns. The note under the list counts only the readings the dial steps through, for example *Rotation moves through these 3 readings only, in this order.*
- Two listed readings with the same name carry a short tag that tells them apart: a word from the sensor group's name when that differs, otherwise **no. 1**, **no. 2** in the order the reading picker lists them.
- When the reading on the dial is not in the set, a line under the list says the next step leaves it and names where it goes.
- A set with one reading does not move; the note under the list says *Only one reading picked. Rotation needs two or more to move.* When fewer than two listed readings are reported right now, rotation waits until another returns.
- Leave the set empty for the default same-group behavior.
- **Split into groups** under the list turns the set into named [rotation groups](dial-controls.html#rotation-groups): a plain turn then stays inside one group and a pressed turn (Elite) jumps between groups.

**Ignore turns.** A checkbox under **Controls**, shown as **Ignore turns (protects against accidental bumps)**. The dial ignores plain and pressed turns, so a bump against the deck cannot move you off the reading you chose. This covers every command a turn carries, including **Cycle stat mode** on Custom. Push, touch, touch zones, the auto cycle, the settings panel and Sensor Control keys still work.

**Auto cycle.** A select under **Controls**: **Off** (default), **Every 5 seconds**, **Every 10 seconds**, **Every 30 seconds**, **Every minute** or **Every 5 minutes**. It steps to the next reading in the rotation set, or in the sensor group when there is no set.

- It runs even while turns are ignored. For hands-off rotation, build a set, tick **Ignore turns** and set a cycle time.
- Any move of the selection, by hand or by the cycle, restarts the timer for a full interval.
- Each step clears a custom title just like a manual turn, unless **Title when the dial moves on** is **Stays for this dial**.
- Timing follows **Read every**: the cycle checks on each read, so a step can land up to one read late.
- While the saved reading is missing, the cycle holds and tries again on the next read. It does not run while paused or pinned.
- **Auto cycle jumps to a critical reading** (under **Alerts**) makes the cycle alert-aware: it holds instead of rotating away while the reading on the dial is critical, and its next step goes to a critical member of the set instead of the next one in order. A manual turn can still move away; the next step returns to a reading that is still critical. Unticked (the default), alerts do not steer the cycle. Only critical counts, not warning. See [thresholds and mixed units](dial-controls.html#thresholds-and-mixed-units).

Rotation also protects your selection when the saved reading is missing (a sensor this Mac stopped reporting, or a reading not yet available after a restart): turns, the auto cycle and Sensor Control selection commands leave the dial where it is until the reading returns.

## Session stats are the dial's own, per reading

A dial calculates its own local min, max and average for each reading from the observations it receives, separate from the MIN, MAX and AVG that Sensor Reading keys and detail tiles show ([how those are calculated](faq.html#how-are-min-max-and-avg-calculated-on-a-key)). The average is the sum of accepted observations divided by their count; it is not time-weighted. A repeated display of the same observation does not count again; a new acquisition with the same value does.

- The reading on the dial, every rotation-set member and the readings in an overview's list collect while sensors are being read. Ordinary rotation keeps each reading's session, so turning away and back finds it again.
- A dial that goes off screen (another page or profile) keeps its pause and pin for up to 30 minutes; the plugin keeps the state of the 64 most recently hidden dials. Its sessions are kept too, and keep collecting, while a Sensor Reading key (the Back tile included), another Sensor Dial or a detail tile is visible. A visible Sensor Control key does not keep sensors being read.
- A missing or non-finite reading, or a change of a reading's unit or type, ends that reading's session. A status screen ends every session on every dial; the first live frame afterwards shows `stats reset: data gap` once. The next accepted observation starts a new session.
- With no Sensor Reading key, Sensor Dial or detail tile visible for 2 seconds (Sensor Control keys do not count), the plugin stops reading sensors. A dial that comes back after that starts its sessions again and shows `stats reset: data gap` once; its pause and pin stay within the limits above. A dial that comes back within those 2 seconds, as on a page change, keeps its sessions ([When reading starts and stops](data-sources.html#when-reading-starts-and-stops)).
- **Push** resets the current reading under the Legacy preset. **A stats reset clears** can widen a reset to the rotation set or to every dial. Other presets can put the reset on another gesture.

### How a dial's statistics can differ from a key's

A dial and a Sensor Reading key both count one sample per acquisition and average without time weighting. Both start over when the reading goes missing, when its unit or type changes, and when the plugin stops reading sensors. Their numbers can still differ:

| Difference | Sensor Reading key and detail tile | Sensor Dial |
| --- | --- | --- |
| Reads counted | Every accepted read since the plugin last started reading sensors, including reads before the key appeared or picked the reading | Only reads made while this dial follows the reading (on the dial, in its rotation set or in an overview's list), from when it first followed it |
| Reset | None | A gesture or a Sensor Control key, as far as **A stats reset clears** reaches |
| Status screens | The screen itself resets nothing; a reading removed or expired behind it starts over | Any status screen ends every session on every dial |
| Shared or separate | One set per reading, the same on every key and detail tile | Each dial keeps its own |

## Settings

The panel groups settings under **Reading**, **Display**, **Alerts**, **Controls** and **Advanced**. Its header shows the current face, the reading's name and the data state, for example *Live · Mac sensors*. When something needs fixing, a status message under the header names the repair. The theme strip sits below the header.

The theme strip, **Reading** and **Display** start open; the other sections start folded. A folded section summarizes its settings on its title line. **Open all sections** and **Fold all sections** in the header, or Option-click a section title (the panel's tooltip says Alt-click), change them together. The plugin remembers which sections you left open for every Sensor Dial panel until the plugin restarts.

| Section | Setting | What it does |
| --- | --- | --- |
| Theme strip | **Theme** | **Default** follows the shared theme; a named theme (Void, Graphite, Ultraviolet, Midnight, Forest, Ember, Paper) applies to this dial only. On **Default**, **Change** opens the shared **Theme** under **Advanced**, **Shared defaults**. On a theme picked for this dial, **Make shared** makes it the shared theme and sets this dial back to **Default**. See [Themes and colors](themes.html). |
| Reading | **On the dial now** | A searchable picker over every reading this Mac reports, each with its value when the list loaded; the button beside it reloads the sensor list. The line under it names what else changes the reading on this dial, from the dial's control map, for example *Turns change this too.* Arrow keys browse, Return picks, Tab or a click elsewhere closes without changing anything. |
| Reading | **Readings to rotate through** | The **Rotation** group: a search whose results tick readings in or out, then the ticked readings in rotation order with the **Earlier**, **Later**, **Rename** and **Remove** toolbar, and **Split into groups**. Empty means every reading of the picked reading's sensor group. See [Rotation set](#rotation-set-ignore-turns-and-auto-cycle). |
| Reading | **Title on the dial** | A custom title. Blank uses the reading's own name, or the name given with **Rename**. |
| Reading | **Title when the dial moves on** | **Clears (default)**: a custom title clears whenever the dial moves on to another reading, by a turn, a press or touch set to step, a Sensor Control key or the auto cycle. Picking a reading in the settings panel keeps it. **Stays for this dial** keeps it as a fixed title. |
| Display | **Text color** | **Default** (follows the shared Text color and names it, for example *Default (shared: Theme text)*), **Theme text**, **Dimmed** or **Custom color**. Custom adds **Custom text color** and **Dim labels, units and stats (the value keeps the exact color)**. |
| Display | **View** | **One reading** (default), **Overview, two rows (big values and trend)** or **Overview, three rows**. See [Views](#views). |
| Display | **Decimals** | **Auto** (default), or a fixed 0, 1, 2 or 3. Auto shows two decimals below 10, one below 100 and none from 100, and shortens values from 10,000 with k, M, G or T; byte and rate units follow the shared **Data units** setting instead. |
| Display | **°F** (under **Temperature**) | Shows temperatures in °F instead of °C. |
| Display | **Row labels** | Overviews only: **Shorten shared words; name on the context line** (default) or **Always full labels**. |
| Display | **Context line** | Three rows only: **Above the rows** (default) or **Below the rows**. |
| Display | **Separators** | Three rows only: **Thin lines** (default) or **None**. |
| Display | **Color numbers by sensor type** | Overviews only: numbers take their sensor type's color. Off by default. See [Reading colors](#reading-colors). |
| Display | **Reading colors** | Overviews only: a preset or individual number colors, with **Auto** to reset a reading. See [Reading colors](#reading-colors). |
| Display | **Bar from** / **Bar to** | One reading only: fixed ends of the range bar. Leave blank to follow the session low and high. A decimal comma such as `30,5` works. Anything else is kept as typed, and the field says *Not a number. The bar ignores this field until it is one.* See [Bar range](#bar-range-fixed-vs-session). |
| Alerts | **Warn at** / **Critical at** | Values at which the bar fill, or an overview row's value, turns amber or red. Empty means off. Use the displayed temperature unit. |
| Alerts | **Alert when the value drops to or below these numbers (for fans and clocks)** | Flips the comparison, for fan speeds and other readings where lower is worse. Mac Sensors offers no clock readings. |
| Alerts | **Auto cycle jumps to a critical reading in the rotation and holds there while it stays critical** | Makes the auto cycle alert-aware. Off by default. |
| Controls | **Gestures** | **Legacy (default)**, **Elite** or **Custom**. Under it the panel lists what each gesture does on this dial now. Custom adds one select per gesture: **Turn**, **Pressed turn**, **Short push**, **Long push**, **Touch tap**, **Long touch**. See [Dial controls and presets](dial-controls.html). |
| Controls | **Touch zones** | Elite and Custom only: **Off (the whole strip is one tap)** (default), **Two: left and right switch readings**, or **Three: left and right switch, center taps**. |
| Controls | **Ignore turns** | Disables plain and pressed turns, for bump protection. |
| Controls | **Auto cycle** | Steps through the rotation on a timer, every 5 seconds to every 5 minutes. Off by default. |
| Controls | **A stats reset clears** | **This reading only** (default), **The whole rotation set**, or **Every dial, everywhere (use with care)**. |
| Controls | **Link ID** | An optional name. Sensor Control keys whose **Target** is this name steer this dial. |

Under **Alerts**, the folded title line says what is set and, once a threshold is anchored to a unit, ends with that unit, such as *°C readings only*. Thresholds and the manual bar range are scoped to a unit: they apply only to readings in the unit that was on the dial when you last changed any of them, so a temperature limit never fires on a fan you rotate to. Details are on [Dial controls and presets](dial-controls.html#thresholds-and-mixed-units).

Alerts check the current value in the reading's own unit (°F when °F is on). For bytes and rates, that is the sensor source's number and unit, which the dial may show rescaled by **Data units**.

### Bar range: fixed vs. session

By default (both fields blank), the bar spans the **session low to high**, so the fill uses the whole width of the range you have actually seen and grows as new extremes appear. Set **Bar from** and **Bar to** to fix the scale instead, for example `0` and `100` for a percentage, or `30` and `90` for a temperature, so the fill position means the same thing every time you look. You can set one end only; the other stays automatic. A range with no width yet (one observation so far) draws the fill at half.

With **Warn at** or **Critical at** set, the bar's track also marks the threshold zones in muted amber and red, toward the alarmed end (the low end when alerts fire on a drop). An automatic end widens to keep the zones visible, with a small margin past the threshold. A manual **Bar from** or **Bar to** is never widened; zones outside it are cut off. The zones show where the thresholds sit on the track and keep their muted color. The fill is the live value at full strength: the accent color normally, amber or red while alerting.

## Alerts on a dial

Dials take the same **Warn at** and **Critical at** thresholds as keys, compared against the **live** value. A dial stays in its theme while alerting; what changes depends on the view:

- In the one-reading view, only the **range bar's fill** turns amber for warning or red for critical. The title, value and the rest of the face keep your theme.
- The two [overview](#views) layouts have no range bar, so an alerting row's **value** takes the alert color, adjusted for contrast against that row's background.

Alert colors take priority over individual reading colors and a custom text color. See [Thresholds and alerts](thresholds.html).

## Status screens

When sensor data is not available, the touchscreen shows a short two-line message in place of a reading:

| Touchscreen | Meaning and next step |
| --- | --- |
| **Reading sensors** / please wait | No reading has arrived since sensor reading started, or every reading lapsed or failed before a full read had completed. Readings appear after the next successful read. |
| **Source busy** / retrying | The first read has not finished 15 seconds after reading started. Choose **Check again** in the settings panel. |
| **No sensor data** / copy report | Both sources answered, but no reading is current. Choose **Check again**; if it stays, choose **Copy support report** under **Advanced**, **Support**. |
| **Needs macOS** / check requirements | The Node runtime is not macOS on arm64 or x86_64. See [Installation and requirements](installation.html). |
| **Bridge failed** / reinstall | The native reader could not load. Quit and reopen Stream Deck. If it persists, see [Keys show Bridge failed](troubleshooting.html#keys-show-bridge-failed). |
| **Tahoma needed** / Open Font Book | A fixed image, drawn without Tahoma. Install Tahoma Bold in Font Book, then choose **Check again**. |
| **Source error** / copy report | A read failed in a way no other screen covers. Choose **Check again**; if it stays, choose **Copy support report** under **Advanced**, **Support**. |

Before you pick a reading, the dial shows **Mac Sensors** / **rotate to pick** with the hint *or use the settings panel*; the first turn picks a reading. If the saved reading is not reported by this Mac, the dial shows **Sensor missing** / **waiting** with the hint *reselect in settings*. Turns are ignored there so your saved pick survives; pick another reading in the panel if it is gone for good. The full list of status screens is on [Status screens](status-screens.html).

## Advanced (shared by all keys and dials)

**Shared defaults** and **Connection** affect every Mac Sensors key and dial.

- **Shared defaults**: **Theme**, **Text color**, the **Text font: Tahoma Bold** line with its status, **Accent colors** (**By sensor type** or **Theme accent everywhere**) and **Data units** (**Decimal (KB, MB, GB; rates in Mbps)** or **Binary (KiB, MiB, GiB; rates in MiB/s)**). See [Themes and colors](themes.html).
- **Connection**: **Read every**, one of 250 ms, 500 ms, 1 second (default), 2 seconds or 5 seconds. Every key and dial updates from one shared read at this interval; changing it clears trend-line history. Shorter intervals read the sensors more often and use more processor time. **Sensor setup** lists the first steps. See [Data sources](data-sources.html).
- **Support**: **Copy support report** copies a redacted diagnostics report to the clipboard; nothing is uploaded. See [Troubleshooting](troubleshooting.html).
- **Configuration documents**: **This dial's settings** and **Shared settings** as JSON, each with **Copy** and **Replace**. Replace swaps the whole document, reloads the panel and keeps fields this version does not know. **Replace shared settings** changes every Mac Sensors key and dial and asks for a second click.

## Where to go next

- [Dial controls and presets](dial-controls.html): Elite and Custom gestures, rotation groups, touch zones, pause and pin, and the Sensor Control key.
- [Themes and colors](themes.html) and [Thresholds and alerts](thresholds.html) for the dial's look and alert levels.
- [Dial gestures do nothing](troubleshooting.html#dial-gestures-do-nothing) if a dial does not respond.
