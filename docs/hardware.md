---
layout: default
title: Hardware compatibility
nav_order: 12
---

# Hardware compatibility

These are measured facts and explicit gaps, not a list of every Mac that might work.

| Environment | Evidence |
| --- | --- |
| Mac17,9, M5 Pro, 64 GB, macOS 27.0.1 | Live public/SMC reads, native and provider tests, actual app installation and a completed 24-hour resource/freshness window |
| Stream Deck 7.5.0.22885, app Node 24.13.1 | Browser/Finder package install, upgrade and isolated development link |
| Virtual Stream Deck, 8 by 4 | Real-app production/dev reading publication, visible-reference lifecycle and the completed development soak |
| x86_64 Node under Rosetta on the M5 Pro | Same-artifact ABI and live reads on Node 20, 22 and 24 |
| Hosted arm64 and Intel macOS runners | Clean software qualification and the same-artifact ABI matrix |
| Physical Intel Mac | Not executed; separate owner session required |
| Physical keys, dials and touch | Not executed in this session; owner device checks required |

The package targets macOS 13.5 or later and app 7.1 or later. Older supported OS versions are deployment targets, not measured rows. Intel hardware support is limited to macOS 26 and earlier and remains subject to the app's own requirements.

Sensor availability varies by model. A fanless Mac need not have fan rows. Discrete-GPU power-off behavior on a two-GPU Intel laptop is not yet physically qualified.

The app's Qt 6.11.1 renderer was used for the face census. Physical photograph calibration remains pending, so device-equivalence and legibility claims are marked INFERRED. The hardware photograph will be added after the owner captures the prepared scene.

Measured performance windows and their limits are recorded in PERF.md in the source repository, which requires repository access.
