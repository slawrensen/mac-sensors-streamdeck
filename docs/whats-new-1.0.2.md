---
layout: default
title: What changed in 1.0.2
nav_order: 14.4
description: "What 1.0.2.0 adds to keys and dials: CPU and GPU temperatures on M1 to M6 chips, battery cycles and health, the internal SSD temperature, and network rates past 4 GiB."
---

1.0.2.0 adds readings, and corrects the names of the core readings on the M5 Pro. Saved keys, dials and their settings keep reading the same sensors. The native readers for Apple silicon and Intel are new, and the detail view files are the same as in 1.0.0.0. The [changelog](changelog.html) lists every change.

| Change | What you see |
| --- | --- |
| CPU and GPU temperatures on more chips | A Mac with an Apple M1 to M6 or A18 Pro chip gets per-core CPU temperatures and GPU temperatures from a table for its chip family, plus **CPU average** and **CPU hottest core** computed from the cores that answer. In 1.0.1.0 only the M5 Pro had per-core temperatures, and no Mac had **CPU average** or **CPU hottest core**. The tables come from the Stats project, except the M5 Pro and M5 Max core rows, which follow the measured M5 Pro. I have measured only the M5 Pro, so a name can be wrong on another chip. See [SMC readings](data-sources.html#smc-readings) and [Send a reading report from your Mac](hardware.html#send-a-reading-report-from-your-mac). |
| Battery and drive health | **Battery cycles**, **Battery health** and **Internal SSD** (a temperature) appear under **Reading** on a Mac that reports them. A desktop Mac has no battery readings, and only an internal NVMe drive is read. Battery health is not the Maximum Capacity that macOS shows. See [Battery and drive health](data-sources.html#battery-and-drive-health). |
| Fan limits on every Mac | Each fan offers its target, minimum and maximum speed, and a Mac with two or more fans gets **Fan average**. See [SMC readings](data-sources.html#smc-readings). |
| M5 Pro core names | In 1.0.1.0 the 18 readings named **CPU super core** 1 to 6 and **CPU performance core** 1 to 12 were all sensors on the super core cluster. A saved key keeps reading the same sensor under its new name, **CPU super core** 1 to 6 or **CPU super cluster sensor** 1 to 12: 1.0.1.0's **CPU super core 1** is now **CPU super cluster sensor 1**, and its **CPU performance core 1** is now **CPU super cluster sensor 5**. **CPU performance core 1** to **12** are now the performance cores. The new **CPU average** and **CPU hottest core** cover the 6 super cores and 12 performance cores. See [SMC readings](data-sources.html#smc-readings). |
| More M5 Pro readings | On Mac17,9 with the M5 Pro, 11 more temperatures are offered: Airflow top, Charger proximity, Power supply proximity, Thunderbolt left, Thunderbolt right, Trackpad, Trackpad actuator and GPU region 1 to 4. |
| Whole-Mac readings | **Computer average** and **Hottest sensor** are new on every Mac. On Mac17,9 with the M5 Pro they cover a fixed list of 37 temperatures, and a read in which one of them is missing leaves them out. **CPU super cluster sensor** 1 to 12 and **GPU** 1 to 8 are not in that list, so one of them often reads higher than **Hottest sensor**. On another Mac they cover the SMC temperatures between 10 and 120 °C in one read, when there are at least two. See [Computed readings](data-sources.html#computed-readings). |
| Network rates past 4 GiB | **Network receive** and **Network send** keep their rate when an interface passes 4 GiB of traffic. In 1.0.1.0 both showed **Sensor missing** for one read and their sparklines started over. |
| Status hints | For **Source busy**, **Bridge failed** and **Needs macOS**, the settings panel says what happened and what to do next. See [Status screens](status-screens.html). |
| Panel wording | The alert direction box reads **Alert when the value drops to or below these numbers (for fans and free space)**. The details filter samples are `*fan*` and `*cpu*core*`. Fold and rotation hints name the Option key, and the Bar and Ring range help no longer mentions Yes/No readings. |
| Support reports | The `mac` section counts the health source's readings under `sourceRows` and the computed readings under `computedRows`. It names the CPU, the chip family table in use and whether that table was measured on this model, and lists which SMC keys answered, by name only. |

After the update nothing needs action. The new readings are under **Reading** in a key's or dial's settings. On the M5 Pro, a key or dial set to a CPU core reading in 1.0.1.0 keeps its sensor under a new name, and a label you typed stays. To show a performance core, open its settings and pick **CPU performance core** 1 to 12 under **Reading**.

On the measured Mac17,9 with an M5 Pro the list grew from 52 readings to 89. Unit tests, a scripted SMC for each chip family, a mock Stream Deck host and hosted runners for both architectures cover software behavior. They do not cover a physical Mac other than the M5 Pro, physical readability, dial gestures or Intel hardware behavior. [Hardware compatibility](hardware.html) lists what ran on which Mac and deck and what is still pending.

[What changed in 1.0.1](whats-new-1.0.1.html) covers the release before this one.
