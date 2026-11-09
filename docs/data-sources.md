---
layout: default
title: Data sources
nav_order: 10
description: "Where each reading comes from, macOS system counters or the SMC, and when a value counts as fresh."
---

Every reading on a key, dial or detail tile comes from one of three local sources on this Mac: macOS system counters, SMC readings taken by the plugin's own native reader, or battery and drive health from public IOKit interfaces. A few more readings are computed by the plugin from SMC readings of the same read. Each read asks the system counters and the SMC, and asks the health source when at least 1.5 seconds have passed since it was last asked. There is no source setting to choose and no separate sensor application. Which readings exist depends on the Mac model and macOS version.

For requirements and the Tahoma Bold prerequisite, see [Installation and requirements](installation.html). For what was measured on which Mac, see [Hardware compatibility](hardware.html).

<span id="system-counters-and-smc-readings"></span>

## System counters, SMC readings and battery and drive health

| Property | **System counters** | **SMC readings** | **Battery and drive health** |
| --- | --- | --- | --- |
| What they are | Processor time, memory, swap, startup volume space, and network and storage byte counters that macOS keeps | Temperatures, fan speeds, voltages, currents and power from the System Management Controller (SMC) | Battery cycle count and battery health, and the internal SSD temperature |
| How they are read | Public macOS calls: `host_processor_info`, `host_statistics64`, `sysctl`, `statfs`, `getifaddrs` and the IOKit storage driver statistics | The `AppleSMC` IOKit service, with read-only commands, for a fixed table of keys | Public IOKit calls: `IOPSCopyPowerSourcesInfo`, `AppleSmartBattery` registry properties and the NVMe SMART plug-in from the macOS SDK |
| Picker groups | CPU, Memory, Storage, Network | CPU, GPU, Battery, Fans, System | Battery, Storage |
| On the measured M5 Pro | 14 readings: 9 read directly, 5 worked out from two reads | 51 readings, plus 3 computed from them | 3 readings |
| On another Mac | The same collectors run; a counter macOS does not return is left out | Depends on the model and chip (see [SMC readings](#smc-readings)) | No battery readings without an internal battery; no drive reading without exactly one internal NVMe drive that reports SMART |
| Minimum, maximum, average | Not provided; Mac Sensors keeps its own from its reads | Not provided; Mac Sensors keeps its own from its reads | Not provided; Mac Sensors keeps its own from its reads |
| Access needed | No administrator access | No administrator access, privileged helper or driver | No administrator access, privileged helper or driver |

No source keeps a history, so Mac Sensors keeps statistics for every reading itself. A key with **Value shown** on **Minimum**, **Maximum** or **Average**, or a press that cycles to them, shows the lowest, highest or average value accepted for that reading since the plugin last started reading sensors. They start over after a gap in that reading; see [How are MIN, MAX and AVG calculated on a key?](faq.html#how-are-min-max-and-avg-calculated-on-a-key) Dial statistics are separate local observations; see [Sensor Dial](sensor-dial.html#session-stats-are-the-dials-own-per-reading).

The plugin only reads. The native reader has no command that writes an SMC key or changes a fan, sends the drive only the SMART read, and exposes no hardware handle to the rest of the plugin.

### System counters

| Reading | Group | Unit | How the plugin gets it |
| --- | --- | --- | --- |
| CPU usage | CPU | % | Share of processor ticks that were not idle between two reads, across every core |
| Memory total | Memory | bytes | Installed memory (`hw.memsize`) |
| Memory free, Memory active, Memory inactive, Memory wired, Memory compressed | Memory | bytes | The kernel's page counts for each category, times the page size |
| Swap used | Memory | bytes | Swap in use (`vm.swapusage`) |
| Startup volume total, Startup volume available | Storage | bytes | Size and space available on the volume mounted at `/` |
| Network receive, Network send | Network | bytes per second | Change in received and sent bytes between two reads, summed over Ethernet-type interfaces named `en0`, `en1` and so on |
| Storage read, Storage write | Storage | bytes per second | Change in bytes read and written between two reads, summed over every block storage driver |

The memory readings are the kernel's named counters. Their sum is not Activity Monitor's Memory Used, and the plugin does not compute one.

Network and storage rates are totals for the Mac. They are not split by application, interface or drive. Only interfaces named `en` followed by a number count, so loopback, VPN tunnel and bridge interfaces are left out.

The five worked-out readings (CPU usage and the four rates) need two reads, so they are left out of a read when there is no valid pair:

- the first read after reading starts (see [Counter rebaseline](#counter-rebaseline));
- the first system counter read after one that failed or arrived too old, which starts a new pair;
- a counter that went down, which means it was reset or started over;
- a change in which interfaces or storage drivers are counted;
- a sleep between the two reads, detected when the time elapsed and the time awake differ by more than 50 ms;
- for the storage rates, any block storage driver that reports no byte counts, on every read where it does so;
- for the network rates, no interface named `en` followed by a number.

When a worked-out reading is left out, a key showing only that reading shows **Sensor missing** until the next read brings it back. Its sparkline starts again.

**Known limit in 1.0.1: network counters start over at 4 GiB.** macOS gives the plugin 32-bit byte counters for each interface. When one passes 4 GiB it starts again from zero, and the read in which that happens shows no network rate. At a sustained 1 Gbit/s that is about every 34 seconds for each direction and interface. At **Read every** 5 seconds, a transfer of more than 4 GiB within one read would also be undercounted.

### SMC readings

The native reader opens the `AppleSMC` service and, for each key in its table, asks for the key's type and size once per connection, then reads its value on every read. Its transport accepts three read-only SMC commands and rejects any other command before it reaches the SMC. It checks the reply's length and firmware status, decodes the types `flt`, `sp78`, `fpe2`, `ui8`, `ui16` and `ui32`, and withholds anything else.

The table has 74 candidate SMC keys. Keys that the SMC on this Mac does not have are left out.

| Applies to | SMC keys | Readings |
| --- | --- | --- |
| Every Mac | 31 | CPU and GPU diode and proximity, battery and Airport temperatures; memory and DC In voltage; CPU and GPU high side, DC In and battery current; CPU package, GPU, battery, DC In, memory and system power; Fan 1 to Fan 8 |
| Mac computers with Apple silicon | 4 more | Airflow left, Airflow right, NAND and Battery 2 temperatures |
| Mac17,9 with the t6050 chip only | 39 more | CPU super core and performance core temperatures, GPU 1 to GPU 8 temperatures; Airflow top, Charger proximity, Power supply proximity, Thunderbolt left and right, Trackpad and Trackpad actuator temperatures; Fan 1 and Fan 2 target, minimum and maximum speeds |

On the measured Mac17,9 with an M5 Pro, 51 of the 74 SMC keys answer. Any other model with Apple silicon receives the first two rows, and an Intel Mac the first row only; on both, the plugin log records `This model uses common typed sensors; its generation-specific catalog is not qualified.` A Mac without fans need not report fan readings. For the state of Intel validation, see [Hardware compatibility](hardware.html).

Each kind of reading has a range. A value outside it is withheld, never shown:

| Kind | Unit | Accepted range |
| --- | --- | --- |
| Temperature | °C | -50 to 150 |
| Fan | RPM | 0 to 30,000 |
| Voltage | V | 0 to 100 |
| Current | A | -500 to 500 |
| Power | W | -1,000 to 2,000 |
| Count (battery cycles) | cycles | 0 and up |
| Percent (battery health) | % | 0 to 200 |

A successful zero stays zero; an idle power rail or a stopped fan can read 0. Battery health can pass 100 % because a new battery can hold a little more than its design capacity.

If the `AppleSMC` service is missing or cannot be opened, the SMC readings are left out and the system counters keep working. The support report records the error under `sourceErrors`. A transport failure closes the SMC connection, and the next read opens it again.

These are not offered: CPU and GPU clocks, GPU usage, per-chip power channels, and HID temperature sensors. The HID registrations had duplicate identities and invalid values, and the power and clock channels found were metadata without a qualified meaning. A value that can be decoded is not offered unless its meaning is known.

### Computed readings

On Mac17,9 with the t6050 chip the plugin computes three readings from the SMC readings of the same read. Other models get none, because the inputs of each one are a fixed list of keys qualified on that model.

| Reading | Group | Unit | Inputs |
| --- | --- | --- | --- |
| CPU average | CPU | °C | Mean of the 18 CPU core temperatures (super cores 1 to 6 and performance cores 1 to 12) |
| CPU hottest core | CPU | °C | Highest of the same 18 core temperatures |
| Fan average | Fans | RPM | Mean of Fan 1 and Fan 2 actual speed. Target, minimum and maximum speeds are never included |

On the measured M5 Pro, TG Pro's own CPU Average was within 1 °C of the mean of the 18 cores in 99.98 % of 32,932 log rows.

A computed reading follows its inputs:

- It is computed only when every input was accepted from the same SMC read: valid, a finite number, inside its range, not duplicated and less than 15 seconds old. If any input is missing or withheld, the computed reading is left out of that read. It is never computed from a value kept from an earlier read.
- Its acquisition time is that of its oldest input, so it expires no later than that input.
- A failed or expired SMC read removes it with the SMC readings.
- It keeps its own MIN, MAX and AVG, which start over after a read in which it was left out.

### Battery and drive health

| Reading | Group | Unit | How the plugin gets it |
| --- | --- | --- | --- |
| Battery cycles | Battery | cycles | `CycleCount` of the `AppleSmartBattery` registry entry |
| Battery health | Battery | % | `NominalChargeCapacity` as a percent of `DesignCapacity`, from the `BatteryData` dictionary of the same entry, or from the entry itself where macOS publishes them there |
| Internal SSD | Storage | °C | Composite temperature from the internal NVMe drive's SMART data, read through the public NVMe SMART plug-in; the drive reports whole kelvin, and the plugin subtracts 273.15 |

- Battery readings appear only when `IOPSCopyPowerSourcesInfo` lists a present internal battery, so a desktop Mac has none.
- Battery health is not the **Maximum Capacity** that macOS shows; Apple does not publish how that figure is calculated. On the measured M5 Pro, `system_profiler SPPowerDataType` reported Maximum Capacity 96 % while this reading said 92.1 %. macOS 27.0.1 there published no `BatteryHealth` condition through the public interfaces, so the plugin offers no condition text.
- Only a drive marked internal is read. External drives get no reading. A Mac with two internal NVMe drives that report SMART gets no drive reading, because one reading cannot name two drives. The drive's model and serial number are not read into a reading.
- The health source opens the drive's SMART connection for each read and closes it again. It is asked at most every 1.5 seconds: every second read at the 1 second default, and every read at 2 seconds or longer.
- Its readings expire 15 seconds after their own acquisition time, like every other reading; at 1.5 seconds apart they are replaced long before that.

### Reading identity

A saved reading is stored by its identity, never by its label or position in the list.

- A system counter's identity is its name, for example `mac:v1:system:cpu-total`. It is the same on every Mac, so a saved CPU usage selection works on another Mac.
- A battery or drive health reading's identity is its name and a meaning revision, for example `mac:v1:health:battery-cycles:count.v1`. It is the same on every Mac.
- A computed reading's identity is the Mac model, its name and a meaning revision, for example `mac:v1:computed:Mac17%2C9:cpu-average:temp.v1`.
- An SMC reading's identity is the Mac model, the four key bytes and a meaning revision, for example `mac:v1:smc:Mac17%2C9:54423154:temp.v1` for the battery temperature on a Mac17,9. A selection saved on one model shows **Sensor missing** on another model. The plugin does not move it to a reading with a similar name.

Labels, list order and the plugin build are not part of the identity, so renaming a label in a later version cannot point a saved key at a different sensor. Two rows that produce the same identity are both withheld. A row whose key bytes are not four printable characters, or whose model name cannot be encoded, is withheld.

The settings panel's picker shows the readings of the latest read, grouped as CPU, GPU, Memory, Storage, Network, Battery, Fans and System. The list updates on its own when a source adds or removes readings; that update does not start an extra read.

## How a read works

One reader serves every Sensor Reading key (including the Back tile), Sensor Dial and detail tile on every connected deck. It starts when the first of them appears and stops 2 seconds after the last one disappears, unless one appears again within those 2 seconds. The plugin log says, for example, `Started (1000 ms interval)` and `Stopped (no visible actions)`. Sensor Control keys do not keep it running. See [When reading starts and stops](#when-reading-starts-and-stops).

Each read asks the system counters and the SMC, and asks the health source when at least 1.5 seconds have passed since it was last asked. Each source runs its hardware calls on its own background slot, so a slow SMC or drive read never blocks the system counters. If a source's previous read has not returned yet, it is not asked again until it has.

Every reading carries its own acquisition time, taken when its read started, not when the answer arrived. A late answer therefore cannot make an older value look newer.

### One redraw per read

When a key or dial shows readings from more than one source, the sources that answer first wait for the rest of the read, so the face changes once for that read instead of several times:

- The wait lasts at most 100 ms. If a source has not answered by then, the readings already in appear and the late source's follow when they arrive.
- After eight reads in a row in which the last source answered within 50 ms of the first, the plugin stops applying the 100 ms limit.
- On the next slow read it waits once for the last source, for up to one **Read every** interval, then applies the 100 ms limit again until there are eight fast reads in a row.
- The 100 ms limit always applies while keys and dials show a status screen, for example **Reading sensors** or **No sensor data**, so a slow source never holds a recovery back.
- The count of fast reads starts over when reading starts and when **Read every** changes. A page change inside the 2 seconds keeps it. A **Read every** change also shows any readings still waiting at once.

Waiting changes only when the face is drawn. It never changes a reading's acquisition time, and each read still adds one sparkline point and one dial observation.

In a traced run of an earlier 1.0.1 candidate, measured as a development copy in the Stream Deck app on the M5 Pro at 1 second, the two sources of a read answered a median 11.5 ms apart and at most 40.2 ms apart ([PERF.md](https://github.com/slawrensen/mac-sensors-streamdeck/blob/main/PERF.md)). In a separate terminal benchmark of the native reader, two windows of 1,000 reads at 1 second, the SMC part of a read had a median of 11.52 ms and 11.10 ms; the slowest read, 66.39 ms, was in the first window (PERF.md, `scripts/bench-native.mjs`). How long SMC reads take on an Intel Mac is unknown; a source that answers more than 100 ms after the first can change the face twice in one read.

### Counter rebaseline

The first system counter read after reading starts only sets the starting point for CPU usage and the rates. About a quarter second later the plugin reads the system counters once more, so those readings appear without waiting a full **Read every** interval:

- The extra read starts 250 ms after the first read started, and never sooner than 200 ms after the first read finished. The kernel counts processor time in 10 ms ticks, so 200 ms covers about twenty.
- It happens once each time reading starts: when a key, dial or detail tile appears and none was visible for the last 2 seconds, for example the first one after the plugin starts, or a page you return to after that long. A page change, opening sensor details or pressing Back inside the 2 seconds keeps the baseline, so CPU usage and the rates carry on without this read.
- If the regular read is due first, as at **Read every** 250 ms, the regular read takes its place.
- A regular read that starts within 200 ms after the extra read started reads only the SMC, so CPU usage and the rates are never computed over a gap of only a few milliseconds.

Until the extra read, a key that shows only CPU usage or a rate shows **Sensor missing**. In an earlier 1.0.1 release candidate, measured as a development copy in the Stream Deck app on the M5 Pro, CPU usage showed a value a median 253.6 ms after a key appeared, over 40 appearances (PERF.md, 2026-10-16 actual-app entry). That candidate had no 2 second hold, so each of those appearances started reading.

**Check again** in a settings panel reads at once, so CPU usage and rates from that read cover the time since the read before it, which can be a fraction of a second.

## Read every

**Read every** sets how often the plugin reads the system counters and the SMC; the health source is read at most every 1.5 seconds. It is under **Advanced**, **Connection**, marked **All keys and dials**, in both the Sensor Reading and Sensor Dial panels. It is one setting for the whole plugin, not one per key.

**Connection** also states that the plugin reads available sensors on this Mac and does not change hardware settings, that available readings depend on this Mac and macOS version, and that a saved reading stays selected when it is unavailable. It also holds **Sensor setup**, three first steps (see [Status screens](status-screens.html#in-the-settings-panel)).

| Option | Notes |
| --- | --- |
| 250 ms | Shortest. Uses the most processor time |
| 500 ms | |
| 1 second | Default |
| 2 seconds | |
| 5 seconds | Longest. Inside the 15-second reading lifetime |

The Connection summary shows the effective value, for example "Mac sensors · read every 1 s".

- One read serves every key, dial and detail tile, so this is the plugin's total read rate. Adding keys does not add reads.
- Changing it clears the sparkline history of every key and dial. It keeps every reading's MIN, MAX and AVG and every dial's session statistics. The plugin log records each change, for example `Read interval set to 500 ms`.
- A blank or non-numeric stored value means 1 second. A stored number outside the range is read as the nearest end, so a value above 5 seconds, for example from a configuration document, runs at 5 seconds, and one below 250 ms runs at 250 ms. A number inside the range that the menu does not offer, such as 1500, is used as stored. The stored setting itself is never rewritten.
- Each read asks the system counters and the SMC for new measurements. How often the SMC itself refreshes a key is unknown, so an SMC value can repeat between reads.

Shorter intervals use more processor time. As a development copy in the Stream Deck app on the M5 Pro with 32 single-reading keys, the published 1.0.1.0 used 0.704% of one core at 1 second over 24 hours, and an earlier 1.0.1 candidate used 0.668% at 1 second and 2.478% at 250 ms (PERF.md). An earlier 1.0.1 release candidate in the repository mock host (`scripts/lib/mock-host.mjs`) with six actions used 18 to 19 ms of plugin CPU time per second at 250 ms, about 5 ms at 1 second and about 1 ms at 5 seconds; the app's own drawing cost is not included (PERF.md).

## When reading starts and stops

The plugin reads sensors while at least one Sensor Reading key (the Back tile of a detail page included), Sensor Dial or detail tile is visible on any deck. Sensor Control keys do not count.

- **Reading starts** when one of them appears while reading is stopped: the first time after the plugin starts, or after none has been visible for 2 seconds. Keys show **Reading sensors** until the first read returns, CPU usage and the transfer rates follow about a quarter second later ([Counter rebaseline](#counter-rebaseline)), and the plugin log says `Started (… ms interval)`.
- **When the last one disappears**, the plugin makes no new regular reads but keeps the reading for 2 seconds. The Stream Deck app removes the old page's actions before it shows the new page's, so changing pages, opening sensor details and pressing Back leave a moment with nothing visible. If one appears again within the 2 seconds, the same reading continues. Key MIN, MAX and AVG, sparklines, the counter baseline, the count of fast reads and dial sessions are kept. Keys show readings at once instead of **Reading sensors**, CPU usage and the rates do not wait for a new pair, and the log shows no new `Started` line. The next read comes on the next **Read every** tick.
- **Reading stops** 2 seconds after the last one disappeared, if none has appeared since. The plugin closes its reader, clears every sparkline, ends every reading's MIN, MAX and AVG, and logs `Stopped (no visible actions)`. The next appearance starts reading as above, and a dial that returns then shows `stats reset: data gap` once.

The 2 seconds is fixed. This behavior comes from the code and its software tests; how long a page change takes on a physical deck has not been measured.

## Freshness and local history

Each reading expires 15 seconds after its own acquisition time and is then removed, at that moment rather than at the next read. Ages are measured on a clock that keeps counting while the Mac sleeps, so changing the system clock cannot extend a reading's life. With **Read every** at most 5 seconds, a source that keeps answering replaces its readings long before they expire.

- A read that fails removes that source's readings at once, and the readings computed from it. The other sources keep serving. One exception: SMC readings wait for the first successful system counter read, which carries the font check. Until then keys show **Source error**, or **Source busy** if a read is still out after 15 seconds.
- A row that is invalid, out of range, not a finite number or duplicated is withheld.
- The plugin never draws an expired or failed reading as live. It has no held-value state: a reading is current or it is absent, and an absent reading shows **Sensor missing** on its key or **Sensor missing** / **waiting** on its dial (see [Status screens](status-screens.html#key-screens)).
- An unchanged value can be a genuine new measurement. A hardware register that stopped changing internally cannot be told apart from a steady one by reading it.
- Nothing is shown before the first successful read: keys and dials show **Reading sensors** until then.

Sparklines add one point for each new acquisition, not for each redraw, and keep up to 36 points spaced by reads, not by time. A sparkline starts again when its reading is absent or not a finite number, when the reading's unit or type changes, when keys show a status screen, when **Read every** changes, and when reading stops, 2 seconds after the last Sensor Reading key, Sensor Dial or detail tile disappears. Returning to a page after none was visible anywhere for 2 seconds therefore starts its sparklines over. A page change, opening sensor details or pressing Back inside the 2 seconds keeps every sparkline, and while one stays visible, a hidden key's sparkline keeps filling.

Each reading's MIN, MAX and AVG take one sample from each accepted read of it. A reading that is withheld, removed by a failed read or expired, or whose unit or type changes, starts its statistics over at its next accepted read, and every reading starts over when reading stops, 2 seconds after the last Sensor Reading key, Sensor Dial or detail tile disappears. A **Read every** change keeps them, and so does a page change inside those 2 seconds. See [Value shown](sensor-reading.html#value-shown-stat-mode).

Dial minimum, maximum and average are local session statistics from new observations; a redraw of the same observation does not count again. See [Sensor Dial](sensor-dial.html).

## Sleep and wake

This section follows the code and its software tests; sleep and wake on a Mac with a deck attached have not been checked yet.

- **After a sleep longer than 15 seconds**, every reading is past its limit, and the plugin removes them at its first read or expiry check after the wake. Until they are removed, the deck can still show the face drawn before the sleep; how long that lasts on a physical deck is unknown. Once they are removed, keys and dials can show **No sensor data** until the first read after waking returns. Every reading's MIN, MAX and AVG start over with its first read after the wake. A read that starts from a status screen always uses the 100 ms limit, so system readings return at most 100 ms after their read completes, even when the SMC read is slow. In software tests with a simulated 60-second sleep and a slow first SMC read, the status screen lasted at most 105 ms: a 5 ms system read plus the 100 ms limit. Whether that screen is visible on a physical deck is unknown.
- **After any sleep**, the first system counter read detects the sleep and leaves out CPU usage and the rates for that read, so they return one **Read every** interval later, with their MIN, MAX and AVG started over. No extra rebaseline read is made.
- **After a sleep shorter than 15 seconds**, readings taken before the sleep stay current until their own 15 seconds run out or the next read replaces them. A reading other than CPU usage and the rates that is read again before its 15 seconds run out keeps its MIN, MAX and AVG.

If a screen stays after waking, see [Keys show No sensor data](troubleshooting.html#keys-show-no-sensor-data).

## Where to go next

- [Status screens](status-screens.html) lists every screen these sources can produce and what the settings panel says.
- [Troubleshooting](troubleshooting.html) has the repair path for each screen, the plugin log and the support report.
- [Hardware compatibility](hardware.html) records which Mac and deck combinations were measured.
