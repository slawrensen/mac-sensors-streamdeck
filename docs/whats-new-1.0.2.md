---
layout: default
title: What changed in 1.0.2
nav_order: 14.4
description: "What 1.0.2.0 adds to keys and dials: battery and drive health, more M5 Pro readings, computed averages and network rates past 4 GiB."
---

1.0.2.0 adds readings and changes none: saved keys, dials and their settings keep the readings they had. It ships new native readers for Apple silicon and Intel, and the 1.0.0.0 detail view files unchanged. The [changelog](changelog.html) lists every change.

| Change | What you see |
| --- | --- |
| Battery and drive health | **Battery cycles**, **Battery health** and **Internal SSD** (a temperature) appear under **Reading** on a Mac that reports them. A desktop Mac has no battery readings, and only an internal NVMe drive is read. Battery health is not the Maximum Capacity that macOS shows. See [Battery and drive health](data-sources.html#battery-and-drive-health). |
| More M5 Pro readings | On Mac17,9 with the M5 Pro, seven more temperatures are offered: Airflow top, Charger proximity, Power supply proximity, Thunderbolt left, Thunderbolt right, Trackpad and Trackpad actuator. Fan 1 and Fan 2 also offer their target, minimum and maximum speeds. See [SMC readings](data-sources.html#smc-readings). |
| Computed readings | On the same Mac, **CPU average**, **CPU hottest core** and **Fan average** are computed from the SMC readings of one read. A read where any input is missing leaves the computed reading out. Other models get none. See [Computed readings](data-sources.html#computed-readings). |
| Network rates past 4 GiB | **Network receive** and **Network send** keep their rate when an interface passes 4 GiB of traffic. In 1.0.1.0 both showed **Sensor missing** for one read and their sparklines started over. |
| Status hints | For **Source busy**, **Bridge failed** and **Needs macOS**, the settings panel says what happened and what to do next. See [Status screens](status-screens.html). |
| Panel wording | The alert direction box reads **Alert when the value drops to or below these numbers (for fans and free space)**. The details filter samples are `*fan*` and `*cpu*core*`. Fold and rotation hints name the Option key, and the Bar and Ring range help no longer mentions Yes/No readings. |
| Support reports | The `mac` section counts the health source's readings under `sourceRows` and the computed readings under `computedRows`. |

After the update nothing needs action. The new readings are under **Reading** in a key's or dial's settings.

On the measured Mac17,9 with an M5 Pro the list grew from 52 readings to 71. Unit tests, a mock Stream Deck host and hosted runners for both architectures cover software behavior. They do not cover physical readability, dial gestures or Intel hardware behavior. [Hardware compatibility](hardware.html) lists what ran on which Mac and deck and what is still pending.

[What changed in 1.0.1](whats-new-1.0.1.html) covers the release before this one.
