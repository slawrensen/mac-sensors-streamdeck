---
layout: default
title: What changed in 1.0.1
nav_order: 14.5
description: "What 1.0.1.0 changes on keys and dials: session statistics, reading through page changes and Read every limits."
---

1.0.0.0 was the first release. 1.0.1.0 ships the same native readers, byte for byte. The [changelog](changelog.html) lists every change.

| Change | What you see |
| --- | --- |
| Key statistics | A Sensor Reading key shows MIN, MAX and AVG instead of N/A, on a press or with **Value shown** on **Minimum**, **Maximum** or **Average**. Mac Sensors keeps them from its reads since the plugin last started reading sensors. Detail tiles show the same numbers. They start over after a gap in that reading. Sensor Dials keep their own session statistics as before. A key already set to a statistic shows numbers from its next read. |
| Page changes keep reading | Changing pages, opening sensor details or pressing Back keeps reading going: key MIN, MAX and AVG, sparklines, CPU usage and the rates carry on, and keys do not show **Reading sensors**. Reading stops 2 seconds after the last Sensor Reading key, Sensor Dial or detail tile leaves the deck. See [When reading starts and stops](data-sources.html#when-reading-starts-and-stops). |
| One redraw per read | A key or dial that shows both system and SMC readings changes once per read instead of twice in quick succession, when both sources answer within 100 ms of each other. |
| **Read every** help | The setting under **Advanced**, **Connection** explains that one shared read updates every reading key and dial, that changing it clears sparkline history, and that shorter intervals use more processor time. |
| **Read every** limits | A blank value means the 1 second default. A stored value above 5 seconds runs as 5 seconds, so readings no longer expire between reads. |
| Counter readings sooner | CPU usage and transfer rates appear about a quarter second after reading starts, instead of one full read interval later. Reading starts when the first Sensor Reading key, Sensor Dial or detail tile appears, or when one returns after none was shown for 2 seconds. |
| No old values as live | When every reading lapses or fails before the first SMC read completes, keys and dials show **Reading sensors** instead of keeping old values as live. |
| Missing saved reading | A key whose saved reading this Mac does not report says **Sensor missing** and **pick again**. |
| Intel support reports | When macOS has no translation flag, as on an Intel Mac, the support report's `translation` field now says `native` instead of `unknown`. Physical Intel validation is in progress. |
| Panel wording | Status text in the settings panel no longer names the plugin as the source of sensor data. The Text font line uses the same spacing as other fields. |
| Processor time | PERF.md compares an earlier 1.0.1 candidate, built before key statistics and the 2 second hold, with a rebuild of 1.0.0, each run as a development copy in the Stream Deck app 7.5.0 on the M5 Pro with 32 single-reading keys. The candidate used 0.668% of one core at 1 second against 0.855% for 1.0.0, and 2.478% against 3.164% at 250 ms. The published 1.0.1.0 used 0.704% at 1 second over a 24-hour observation. [Performance and resource use](faq.html#performance-and-resource-use) has the limits. |

Nothing needs doing after the update, except on a key that shows **Sensor missing** / **pick again**: pick another reading under **Reading**.

Unit tests, a mock Stream Deck host and a 24-hour observation on the measured Mac cover software behavior. They do not cover physical readability, dial gestures or Intel hardware behavior. [Hardware compatibility](hardware.html) lists what ran on which Mac and deck and what is still pending.
