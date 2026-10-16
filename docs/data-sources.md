---
layout: default
title: Data sources
nav_order: 10
---

# Data sources

Mac Sensors reads local macOS interfaces. Each read publishes its new readings once, after its public system counters and optional SMC readings have both settled. Public counters wait at most 100 ms for SMC. If SMC takes longer, the public counters publish first and the SMC readings follow when they arrive, so a slow or missing sensor group cannot stall them or make an old value look new.

| Reading family | What it means |
| --- | --- |
| CPU activity | Change in CPU tick counters across observations |
| Memory | Named Mach VM page counts, plus total memory and swap use |
| Startup volume | Total and available space reported for the root filesystem |
| Network | Aggregate byte-rate deltas across eligible Ethernet/Wi-Fi interfaces |
| Storage | Aggregate byte-rate deltas from eligible block-storage drivers |
| SMC | Bounded, typed read-only temperature, fan, power and related keys |

On the measured Mac17,9 with an M5 Pro, the current catalog contains 38 SMC readings and 14 public/derived readings after baselines are established. Another Mac may expose a different set. The first sample, counter resets, interface membership changes and sleep gaps withhold rates until there is a new baseline. When a key or dial appears with no other Mac Sensors action visible, a second read starts at least 250 ms after the first sample starts and at least 200 ms after it completes, unless the next scheduled read comes sooner, so CPU usage and rates appear without waiting a full **Read every** interval.

Memory categories are the named kernel counters. Their sum is not presented as Activity Monitor's Memory Used. Aggregate storage and network rates are not per-application traffic.

CPU/GPU clocks, unqualified private GPU usage and ambiguous HID/IOReport channels are not offered in this release. An interface exposing bytes does not establish a sensor's meaning. Unknown model/chip pairs do not receive the measured M5-specific table.

Successful typed zero values remain zero. An unchanged value can be a genuine new measurement. Failed readings disappear immediately; pending observations expire after 15 seconds. An internally frozen hardware register cannot be identified from an unchanged successful read alone.

Saved SMC identities include the model, key bytes and a semantic revision. A changed catalog order cannot retarget a saved key. Source layout, labels and build numbers are not used as measurement identity.
