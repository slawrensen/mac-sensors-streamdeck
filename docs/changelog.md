---
layout: default
title: Changelog
nav_order: 15
description: "Changes in each Mac Sensors release, newest first."
---

## 1.0.2.0 - 2026-11-10

- A Mac with an Apple M1 to M6 or A18 Pro chip gets per-core CPU temperatures and GPU temperatures from a table for its chip family, and CPU average and CPU hottest core computed from the cores that answer. Before, only the M5 Pro had per-core temperatures. The tables are adapted from the Stats project, except the M5 Pro and M5 Max core rows, which follow the measured M5 Pro. Only the M5 Pro has been measured.
- Battery cycles, Battery health and the Internal SSD temperature are new readings on a Mac that reports them. They come from public macOS battery and drive interfaces, asked at most every 1.5 seconds.
- On the M5 Pro the 18 readings named CPU super core 1 to 6 and CPU performance core 1 to 12 in 1.0.1.0 were all sensors on the super core cluster. A saved key keeps reading the same sensor under its new name, CPU super core 1 to 6 or CPU super cluster sensor 1 to 12. CPU performance core 1 to 12 are now the performance cores: pick one again under Reading to show a performance core. The new CPU average and CPU hottest core cover the 6 super cores and 12 performance cores.
- On Mac17,9 with the M5 Pro, 11 more temperatures can go on a key or dial: Airflow top, Charger proximity, Power supply proximity, Thunderbolt left and right, Trackpad, Trackpad actuator and GPU region 1 to 4.
- Every Mac gets each fan's target, minimum and maximum speed, Fan average with two or more fans, and Computer average and Hottest sensor. On Mac17,9 those two cover a fixed list of 37 temperatures, so a CPU super cluster sensor can read higher than Hottest sensor. On another Mac they cover the SMC temperatures between 10 and 120 °C in one read.
- Network receive and Network send keep their rate when an interface passes 4 GiB of traffic. Before, both showed Sensor missing for one read and their sparklines started over.
- **Source busy**, **Bridge failed** and **Needs macOS** say in the settings panel what happened and what to do next.
- The settings panel uses Mac wording: the alert direction box names fans and free space, the details filter samples are `*fan*` and `*cpu*core*`, fold and rotation hints name the Option key, and the Bar and Ring range help no longer mentions Yes/No readings.
- Support reports count the readings of the health source (`sourceRows.health`) and the computed readings (`computedRows`), name the CPU and the chip family table in use, and list which SMC keys answered, by name only.

<div id="1010---2026-10-27"></div>

## 1.0.1.0 - 2026-10-28

- Pressing a Sensor Reading key now cycles MIN, MAX and AVG values that Mac Sensors keeps from the reads since reading started, instead of N/A. They start over after a gap in that reading, and **Value shown** and detail tiles show the same values.
- Changing pages, opening sensor details or pressing Back keeps the reading session, so statistics, sparklines and rates carry on; reading stops 2 seconds after the last Sensor Reading key, Sensor Dial or detail tile leaves the deck.
- Keys and dials that show both system and SMC readings change once per read instead of twice in quick succession when both sources answer within 100 ms of each other.
- **Read every** has its own help: one shared read updates every reading key and dial, changing it clears sparkline history, and shorter intervals use more processor time.
- A blank **Read every** value means the 1 second default. A stored value above 5 seconds is read as 5 seconds, so readings no longer expire between reads.
- CPU usage and transfer rates appear about a quarter second after the first Sensor Reading key, Sensor Dial or detail tile appears, or after a page returns once reading has stopped, instead of one full read interval later.
- Keys and dials show Reading sensors, instead of keeping old values as live, when every reading lapses or fails before the first SMC read completes.
- A key whose saved reading is missing shows Sensor missing / pick again instead of Sensor missing / check again.
- Support reports from Intel-based Mac computers say the plugin runs natively instead of unknown.
- Status text in the settings panel no longer names the plugin as the source of sensor data, and the Text font line uses the same spacing as other fields.

## 1.0.0.0 - 2026-10-13

- Read selected Mac temperature, fan and power measurements, plus CPU activity, memory, storage and transfer counters, without changing hardware settings.
- Show one to four readings per key with sparklines, bars, rings, themes and thresholds.
- Browse reading sets on dials with local session statistics, individual reading colors and configurable controls.
- Open detail pages from a key and return with a configurable Back tile.
- Keep saved selections when a source is missing, and withhold failed or expired values.
- Package separate arm64 and x86_64 native readers for macOS 13.5+ and Stream Deck 7.1+.
- Record M5 Pro and Virtual Stream Deck qualification separately from pending physical Intel, device-gesture and sleep/wake checks.
