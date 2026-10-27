---
layout: default
title: Data sources
nav_order: 10
---

# Data sources

Every reading on a key, dial or detail tile comes from one of two local sources on this Mac: macOS system counters, or SMC readings taken by the plugin's own native reader. Each read asks both sources. There is no source setting to choose and no separate sensor application. Which readings exist depends on the Mac model and macOS version.

For requirements and the Tahoma Bold prerequisite, see [Installation and requirements](installation.html). For what was measured on which Mac, see [Hardware compatibility](hardware.html).

## System counters and SMC readings

| Property | **System counters** | **SMC readings** |
| --- | --- | --- |
| What they are | Processor time, memory, swap, startup volume space, and network and storage byte counters that macOS keeps | Temperatures, fan speeds, voltages, currents and power from the System Management Controller (SMC) |
| How they are read | Public macOS calls: `host_processor_info`, `host_statistics64`, `sysctl`, `statfs`, `getifaddrs` and the IOKit storage driver statistics | The `AppleSMC` IOKit service, with read-only commands, for a fixed table of keys |
| Picker groups | CPU, Memory, Storage, Network | CPU, GPU, Battery, Fans, System |
| On the measured M5 Pro | 14 readings: 9 read directly, 5 worked out from two reads | 38 readings |
| On another Mac | The same collectors run; a counter macOS does not return is left out | Depends on the model and chip (see [SMC readings](#smc-readings)) |
| Minimum, maximum, average | Not provided | Not provided |
| Access needed | No administrator access | No administrator access, privileged helper or driver |

Neither source keeps a history. A key with **Value shown** on **Minimum**, **Maximum** or **Average**, or a press that cycles to them, shows **N/A**; the plugin never substitutes the current value. See [Why do MIN, MAX and AVG show N/A on a key?](faq.html#why-do-min-max-and-avg-show-na-on-a-key) Dial statistics are separate local observations; see [Sensor Dial](sensor-dial.html).

The plugin only reads. The native reader has no command that writes an SMC key or changes a fan, and it exposes no hardware handle to the rest of the plugin.

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

- the first read after keys appear (see [Counter rebaseline](#counter-rebaseline));
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

The table has 61 candidate SMC keys. Keys that the SMC on this Mac does not have are left out.

| Applies to | SMC keys | Readings |
| --- | --- | --- |
| Every Mac | 31 | CPU and GPU diode and proximity, battery and Airport temperatures; memory and DC In voltage; CPU and GPU high side, DC In and battery current; CPU package, GPU, battery, DC In, memory and system power; Fan 1 to Fan 8 |
| Mac computers with Apple silicon | 4 more | Airflow left, Airflow right, NAND and Battery 2 temperatures |
| Mac17,9 with the t6050 chip only | 26 more | CPU super core and performance core temperatures, GPU 1 to GPU 8 temperatures |

On the measured Mac17,9 with an M5 Pro, 38 of the 61 SMC keys answer. Any other model with Apple silicon receives the first two rows, and an Intel Mac the first row only; on both, the plugin log records `This model uses common typed sensors; its generation-specific catalog is not qualified.` A Mac without fans need not report fan readings. For the state of Intel validation, see [Hardware compatibility](hardware.html).

Each kind of reading has a range. A value outside it is withheld, never shown:

| Kind | Unit | Accepted range |
| --- | --- | --- |
| Temperature | °C | -50 to 150 |
| Fan | RPM | 0 to 30,000 |
| Voltage | V | 0 to 100 |
| Current | A | -500 to 500 |
| Power | W | -1,000 to 2,000 |

A successful zero stays zero; an idle power rail or a stopped fan can read 0.

If the `AppleSMC` service is missing or cannot be opened, the SMC readings are left out and the system counters keep working. The support report records the error under `sourceErrors`. A transport failure closes the SMC connection, and the next read opens it again.

These are not offered in 1.0.1: CPU and GPU clocks, GPU usage, per-chip power channels, and HID temperature sensors. The HID registrations had duplicate identities and invalid values, and the power and clock channels found were metadata without a qualified meaning. A value that can be decoded is not offered unless its meaning is known.

### Reading identity

A saved reading is stored by its identity, never by its label or position in the list.

- A system counter's identity is its name, for example `mac:v1:system:cpu-total`. It is the same on every Mac, so a saved CPU usage selection works on another Mac.
- An SMC reading's identity is the Mac model, the four key bytes and a meaning revision, for example `mac:v1:smc:Mac17%2C9:54423154:temp.v1` for the battery temperature on a Mac17,9. A selection saved on one model shows **Sensor missing** on another model. The plugin does not move it to a reading with a similar name.

Labels, list order and the plugin build are not part of the identity, so renaming a label in a later version cannot point a saved key at a different sensor. Two rows that produce the same identity are both withheld. A row whose key bytes are not four printable characters, or whose model name cannot be encoded, is withheld.

The settings panel's picker shows the readings of the latest read, grouped as CPU, GPU, Memory, Storage, Network, Battery, Fans and System. The list updates on its own when a source adds or removes readings; that update does not start an extra read.

## How a read works

One reader serves every Sensor Reading key (including the Back tile), Sensor Dial and detail tile on every connected deck. It starts when the first of them appears and stops when the last one disappears, and the plugin log says, for example, `Started (1000 ms interval)` and `Stopped (no visible actions)`. Sensor Control keys do not keep it running.

Each read asks both sources. Each source runs its hardware calls on its own background slot, so a slow SMC read never blocks the system counters. If a source's previous read has not returned yet, it is not asked again until it has.

Every reading carries its own acquisition time, taken when its read started, not when the answer arrived. A late answer therefore cannot make an older value look newer.

### One publication per read

When a key or dial shows readings from both sources, the source that answers first waits for the other, so the face changes once for that read instead of twice:

- The wait lasts at most 100 ms. If the other source has not answered by then, the first source's readings appear and the other's follow when they arrive.
- After eight reads in a row in which both sources answered within 50 ms of each other, the plugin stops applying the 100 ms limit.
- On the next slow read it waits once for the second source, for up to one **Read every** interval, then applies the 100 ms limit again until there are eight fast reads in a row.
- The 100 ms limit always applies while keys and dials show a status screen, for example **Reading sensors** or **No sensor data**, so a slow source never holds a recovery back.
- The count of fast reads starts over when keys and dials appear after none were visible and when **Read every** changes. A **Read every** change also shows any readings still waiting at once.

Waiting changes only when the face is drawn. It never changes a reading's acquisition time, and each read still adds one sparkline point and one dial observation.

In a traced run of the final 1.0.1 release candidate, measured as a development copy in the Stream Deck app on the M5 Pro at 1 second, the two sources of a read answered a median 11.5 ms apart and at most 40.2 ms apart (PERF.md). In a separate terminal benchmark of the native reader, two windows of 1,000 reads at 1 second, the SMC part of a read had a median of 11.52 ms and 11.10 ms; the slowest read, 66.39 ms, was in the first window (PERF.md, `scripts/bench-native.mjs`). How long SMC reads take on an Intel Mac is unknown; a source that answers more than 100 ms after the other can change the face twice in one read.

### Counter rebaseline

The first system counter read after keys appear only sets the starting point for CPU usage and the rates. About a quarter second later the plugin reads the system counters once more, so those readings appear without waiting a full **Read every** interval:

- The extra read starts 250 ms after the first read started, and never sooner than 200 ms after the first read finished. The kernel counts processor time in 10 ms ticks, so 200 ms covers about twenty.
- It happens once each time keys appear after none were visible, for example when you return to a page or come back from another profile.
- If the regular read is due first, as at **Read every** 250 ms, the regular read takes its place.
- A regular read that starts within 200 ms after the extra read started reads only the SMC, so CPU usage and the rates are never computed over a gap of only a few milliseconds.

Until the extra read, a key that shows only CPU usage or a rate shows **Sensor missing**. In an earlier 1.0.1 release candidate, measured as a development copy in the Stream Deck app on the M5 Pro, CPU usage showed a value a median 253.6 ms after a key appeared, over 40 appearances (PERF.md, 2026-10-16 actual-app entry).

**Check again** in a settings panel reads at once, so CPU usage and rates from that read cover the time since the read before it, which can be a fraction of a second.

## Read every

**Read every** sets how often the plugin reads both sources. It is under **Advanced**, **Connection**, marked **All keys and dials**, in both the Sensor Reading and Sensor Dial panels. It is one setting for the whole plugin, not one per key.

**Connection** also says that the plugin reads available sensors on this Mac and does not change hardware settings, that available readings depend on this Mac and macOS version, and that a saved reading stays selected when it is unavailable. It holds **Sensor setup**, three first steps (see [Status screens](status-screens.html#in-the-settings-panel)). Mac Sensors has no data source setting.

| Option | Notes |
| --- | --- |
| 250 ms | Shortest. Uses the most processor time |
| 500 ms | |
| 1 second | Default |
| 2 seconds | |
| 5 seconds | Longest. Still well inside the 15-second reading lifetime |

The Connection summary shows the effective value, for example "Mac sensors · read every 1 s".

- One read serves every key, dial and detail tile, so this is the plugin's total read rate. Adding keys does not add reads.
- Changing it clears the sparkline history of every key and dial. The plugin log records each change, for example `Read interval set to 500 ms`.
- A blank or non-numeric stored value means 1 second. A stored number outside the range is read as the nearest end, so a value above 5 seconds, for example from a configuration document, runs at 5 seconds, and one below 250 ms runs at 250 ms. A number inside the range that the menu does not offer, such as 1500, is used as stored. The stored setting itself is never rewritten.
- Each read asks both sources for new measurements. How often the SMC itself refreshes a key is unknown, so an SMC value can repeat between reads.

Shorter intervals use more processor time. The final 1.0.1 release candidate, measured as a development copy in the Stream Deck app on the M5 Pro with the development process observer and 32 single-reading keys on a Virtual Stream Deck, used 0.668% of one core at 1 second and 2.478% at 250 ms (PERF.md). An earlier 1.0.1 release candidate in the repository mock host (`scripts/lib/mock-host.mjs`) with six actions used 18 to 19 ms of plugin CPU time per second at 250 ms, about 5 ms at 1 second and about 1 ms at 5 seconds; the app's own drawing cost is not included (PERF.md).

## Freshness and local history

Each reading expires 15 seconds after its own acquisition time and is then removed, at that moment rather than at the next read. Ages are measured on a clock that keeps counting while the Mac sleeps, so changing the system clock cannot extend a reading's life. With **Read every** at most 5 seconds, a source that keeps answering replaces its readings long before they expire.

- A read that fails removes that source's readings at once. The other source keeps serving, with one exception: until a system counter read has succeeded since keys appeared, the font is unchecked, and keys show **Source error**, or **Source busy** after 15 seconds while a read is still out, instead of SMC readings.
- A row that is invalid, out of range, not a finite number or duplicated is withheld.
- An expired or failed reading is never shown as live. The plugin has no held-value state: a reading is current or it is absent, and an absent reading shows **Sensor missing** on its key or **Sensor missing** / **waiting** on its dial (see [Status screens](status-screens.html#key-screens)).
- An unchanged value can be a genuine new measurement. A hardware register that stopped changing internally cannot be told apart from a steady one by reading it.
- Nothing is shown before the first successful read: keys and dials show **Reading sensors** until then.

Sparklines add one point for each new acquisition, not for each redraw, and keep up to 36 points spaced by reads, not by time. A sparkline starts again when its reading is absent or not a finite number, when the reading's unit or type changes, when keys show a status screen, when **Read every** changes, and when the reader stops because no Sensor Reading key, Sensor Dial or detail tile is visible. Returning to a page after no Sensor Reading key, Sensor Dial or detail tile was visible anywhere therefore starts its sparklines over; while one stays visible, a hidden key's sparkline keeps filling.

Dial minimum, maximum and average are local session statistics from genuine observations; a redraw of the same observation does not count again. See [Sensor Dial](sensor-dial.html).

## Sleep and wake

This section describes the code and its software tests. Real sleep and wake on a Mac with a deck attached has not been checked yet; that check is pending.

- **After a sleep longer than 15 seconds**, every reading is past its limit, and the plugin removes them at its first read or expiry check after the wake. Until then the deck can still show the face drawn before the sleep; how long that lasts on a physical deck is unknown. Until the first read after waking returns, keys and dials can then show **No sensor data**. A read that starts from a status screen always uses the 100 ms limit, so system readings return at most 100 ms after their read completes, even when the SMC read is slow. In software tests with a simulated 60-second sleep and a slow first SMC read, the status screen lasted at most 105 ms: a 5 ms system read plus the 100 ms limit. Whether that screen is visible on a physical deck is unknown.
- **After any sleep**, the first system counter read detects the sleep and leaves out CPU usage and the rates for that read, so they return one **Read every** interval later. No extra rebaseline read is made.
- **After a sleep shorter than 15 seconds**, readings taken before the sleep stay current until their own 15 seconds run out or the next read replaces them.

If a screen stays after waking, see [Keys show No sensor data](troubleshooting.html#keys-show-no-sensor-data).

## Where to go next

- [Status screens](status-screens.html) lists every screen these sources can produce and what the settings panel says.
- [Troubleshooting](troubleshooting.html) has the repair path for each screen, the plugin log and the support report.
- [Hardware compatibility](hardware.html) records which Mac and deck combinations were measured.
