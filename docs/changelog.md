---
layout: default
title: Changelog
nav_order: 15
description: "Changes in each Mac Sensors release, newest first."
---

## 1.0.2.0 - 2026-11-10

- A Mac with an Apple M1 to M6 or A18 Pro chip gets per-core CPU temperatures and GPU temperatures from a table for its chip family, and CPU average and CPU hottest core computed from the cores that answer. Before, only the M5 Pro had them. The tables are adapted from the Stats project and are measured only on the M5 Pro.
- Battery cycles, Battery health and the Internal SSD temperature are new readings on a Mac that reports them. They come from public macOS battery and drive interfaces, asked at most every 1.5 seconds.
- On Mac17,9 with the M5 Pro, seven more temperatures can go on a key or dial: Airflow top, Charger proximity, Power supply proximity, Thunderbolt left and right, Trackpad and Trackpad actuator. Fan 1 and Fan 2 also offer their target, minimum and maximum speeds.
- On the same Mac, CPU average, CPU hottest core and Fan average are computed from the SMC readings of one read. A read where any input is missing leaves the computed reading out.
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
