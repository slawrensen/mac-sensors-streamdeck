---
layout: default
title: Getting started
nav_order: 3
---

# Getting started

Drag **Sensor Reading** onto a key. In **Reading**, type part of a sensor or reading name and choose the result. Arrow keys browse the picker; Enter selects. Browsing and opening the panel do not save a new reading.

The header shows the same SVG the plugin last drew for that action. Its status distinguishes live data, a missing saved reading and an unavailable source. A missing reading stays saved with its label and colors.

Choose a label if the full sensor name is too long for the key. Under **Readings on this key**, choose one, two, three or four readings. Set **Graph under the value** for a trend, bar or ring where that layout supports it.

Every reading key and dial updates from one shared read. **Read every**, under Advanced, Connection, sets how often: from 250 ms to 5 seconds, one second by default. Changing it clears sparkline history.

Use [thresholds](thresholds.html) for warning and critical colors. Use [sensor details](sensor-details.html) when you want a group of readings behind one key.

![Sensor Reading settings](assets/img/settings-key.png)

*Settings-panel capture of the staged Mac panel in a simulated host with sample data.*
