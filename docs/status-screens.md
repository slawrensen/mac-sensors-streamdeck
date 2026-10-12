---
layout: default
title: Status screens
nav_order: 11
---

# Status screens

Status text names the condition the plugin can establish. Opening a provider does not make a value live.

![Status screens](assets/img/status.png)

*Production-rendered sample scenarios.*

| Screen | Meaning and next step |
| --- | --- |
| Reading sensors | The first successful sample has not arrived yet |
| Source busy | A source is still occupied; the plugin retries |
| No sensor data | No recent readable observations; copy a support report |
| Sensor missing | The saved identity is absent; settings remain saved |
| Access denied | macOS denied a read; copy a support report |
| Needs macOS | The runtime does not meet the supported platform requirements |
| Bridge failed | The native reader could not load; reinstall and copy a report if it persists |
| Tahoma needed | Install Tahoma Bold in Font Book, then choose Check again |
| Source error | A source failed without a more specific established cause |
| Not updating | No recent measurement is available |

**Check again** requests another eligible read. Automatic catalog refresh updates the picker when independently arriving sources change its membership. It does not accelerate the hardware polling cadence.

The fixed Tahoma setup image stays legible when the font is missing. It contains rendered pixels and keeps the Back mark where needed.
