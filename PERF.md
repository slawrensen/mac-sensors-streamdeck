# Performance

The native collector budget is a 25 ms p99 acquisition time at one-second and 250 ms read intervals. Cold discovery is measured separately. Run `node scripts/bench-native.mjs <output directory> --control <shipped reader>` under the Stream Deck app's Node runtime to reproduce the benchmark, and record external CPU and memory samples. The control is the published package's reader for the same architecture, `bin/hwmac-arm64.node` or `bin/hwmac-x86_64.node`. Another app that reads the SMC on a schedule can push both readers over 25 ms, so a candidate p99 over budget passes only when the control in the same run is over budget too and the candidate stays within 1.25 times the control's p99.

On an M5 Pro running macOS 27.0.1 and Node 24.13.1, 1,000 reads at each interval measured p99 acquisition of 14.63 ms and 15.01 ms. Every sample contained nine direct system readings and 38 SMC readings. This is native-component evidence in a terminal, not the installed plugin's total rendering cost or a physical Intel measurement.

The sampled process used at most 63.3 MB of RSS during that run. External CPU samples averaged 0.39% and peaked at 1.3%. Background development activity was present. Final app and device measurements will be recorded separately.

### 2026-10-12: CI native binaries on the M5 Pro

The release toolchain is Xcode 26.6 with SDK 26.5 and pinned Node 24.13.1 headers. Its arm64 addon SHA-256 is 3968022b3f9146fb979202c7e8ab5ebf27a3405070c700bfa1d33c5cd2175bcd; x86_64 is 2055deaf2e759176314d7904d4d9956c50be65135030d28fd9490316a093ca7e. Both hosted architectures produced identical artifacts. The local app's Node 24.13.1 ran the same benchmark logic against those downloaded files.

| Window | Measured result |
| --- | --- |
| First, 1,000 reads at 1 s | p99 total 37.97 ms; uniform 25 ms check failed |
| First, 1,000 reads at 250 ms | p99 total 12.88 ms |
| Second, 1,000 reads at 1 s | p99 total 12.52 ms |
| Second, 1,000 reads at 250 ms | p99 total 12.67 ms |
| SMC read time at 1 s | First window: p50 11.52 ms, slowest 66.39 ms. Second window: p50 11.10 ms, slowest 12.46 ms |
| Source observations | Every sample had at least 9 direct system and 38 SMC rows; zero source errors |
| Maximum RSS | About 63.3 MB in each full window |
| Event-loop p99 | About 2.2 ms |

The first window's slow one-second reads occurred near the same wall-clock second once per minute. Their cause is unknown. Both windows are retained; the later pass does not erase the earlier failure. These are native-component timings under background development activity, not a promise of constant latency or the total cost of rendering a deck.

### 2026-10-16 UTC: Plugin CPU time by Read every, mock host

The repository mock host (`scripts/lib/mock-host.mjs`) ran the 1.0.1 candidate bundle with the 1.0.0 release native addons (arm64 SHA-256 3968022b3f9146fb979202c7e8ab5ebf27a3405070c700bfa1d33c5cd2175bcd) under Node 24.13.1 on the M5 Pro, macOS 27.0.1. The layout was six contexts: a sparkline key, an SMC key, a dual and a quad key mixing public and SMC readings, and two dials. After 5 seconds of warm-up, the development process observer (`npm run build:observer`) read the plugin process CPU time at the start and end of a 40-second window. Two rounds ran in alternating order. The script that set up the six contexts and timed the windows is an uncommitted development harness, so this entry cannot be reproduced from the repository alone.

| Read every | Plugin CPU time per second (two runs) | Frames per second, all six contexts |
| --- | --- | --- |
| 250 ms | 18.1 ms, 19.1 ms | 16.9, 17.1 |
| 1 second | 5.2 ms, 5.4 ms | 5.5, 5.0 |
| 5 seconds | 1.1 ms, 1.2 ms | 1.2, 1.2 |

This supports the panel help line that shorter intervals use more processor time. It is mock-host evidence with the real read-only native reader, not the Stream Deck app: the app's rasterization and device transfer cost is not included. Background development activity was present.

### 2026-11-10 UTC: 1.0.2 candidate, native benchmark and actual app against 1.0.1

Both measurements used the arm64 package that hosted CI built for payload commit 068f0c5, SHA-256 e2f58b7823d1ebea0f5f4f79c8f10bad1b673df9916f4cd4efe50c44b2c8261f, 333,461 bytes, 37 members, on Mac17,9 with an M5 Pro and macOS 27.0.1. The hosted Intel runner's package has the same 37 member hashes. The control is the published 1.0.1 reader, arm64 SHA-256 3968022b3f9146fb979202c7e8ab5ebf27a3405070c700bfa1d33c5cd2175bcd.

The native benchmark ran 1,000 reads at each interval, under Node 24.13.1, with the shipped reader sampled in the same run.

| Read every | p50 total, 1.0.2 / 1.0.1 | p99 total, 1.0.2 / 1.0.1 | p99 ratio | SMC rows, 1.0.2 / 1.0.1 | Source errors |
| --- | --- | --- | --- | --- | --- |
| 1 second | 12.58 / 11.47 ms | 44.67 / 39.39 ms | 1.134 | 67 / 38 | 0 |
| 250 ms | 12.69 / 11.56 ms | 43.84 / 39.89 ms | 1.099 | 67 / 38 | 0 |

TG Pro and Stats, which also read the SMC, were running. Neither reader met the uniform 25 ms budget in this window, so the control gate decides, and both intervals are inside its 1.25 margin. The result is recorded as a pass under outside load, not as a pass of the 25 ms budget.

The app comparison ran four 10-minute arms in the order 1.0.2, 1.0.1, 1.0.1, 1.0.2 on Stream Deck 7.6.0 and its Node 24.22.1, with the 32-key Dev Bench on a Virtual Stream Deck at the default 1 second, from quiet development clones of the frozen 1.0.2 package and the published 1.0.1 package.

| Arm | Plugin CPU, percent of one core | RSS start / end |
| --- | --- | --- |
| 1.0.2, first | 0.841% | 88.2 / 99.5 MiB |
| 1.0.1, first | 0.689% | 83.8 / 94.1 MiB |
| 1.0.1, second | 0.692% | 83.1 / 95.1 MiB |
| 1.0.2, second | 0.847% | 84.3 / 100.1 MiB |

1.0.2 used 0.154 percentage points of one core more than 1.0.1 (0.844% against 0.690%, or 22.3% more), with 67 SMC rows and three health rows where 1.0.1 has 38 SMC rows. The benchmark's 1.1 ms longer median read accounts for about 0.11 of those points at one read a second. File descriptors stayed at 49 in every arm. Ten minutes does not establish a memory slope; the 24-hour observation of these bytes does that.

### 2026-10-28 to 2026-10-29: Published 1.0.1.0, 24-hour observation

Command: `npm run soak -- --plugin <frozen dev directory> --out <evidence directory> --hours 24 --interval-ms 60000`. Package SHA-256: 5642f80fa6e4e1833bd7c50382c45b68c9390dce3ba279c9026e3ceedc82814b (316655 bytes). Development bundle SHA-256: eb13eb0f76976c487450d1d73fd87e8114f7adc72ad5a77e05215ed5921a5819.

| Measure | Result |
| --- | --- |
| Window | 2026-10-28T00:48:11.017Z to 2026-10-29T00:49:11.312Z; 24.017 hours, 1442 samples |
| Maximum measured RSS slope | -0.944 MiB per 30 minutes |
| RSS start / close | 85.11 MiB / 50.41 MiB |
| Maximum RSS | 92.55 MiB |
| Maximum footprint | 35.32 MiB |
| File descriptors start / close / maximum | 49 / 49 / 50 |
| Maximum threads | 12 |
| CPU time across measured process segments | 609.00 seconds |
| Observed process identity changes | 0 |
| WARN / ERROR lines | 0 / 0 |
| Sampling gaps / freshness flags | 0 / 0 |
| Unexplained flags | 0 |
| Resource/freshness gate | NOT PASSED |

Each observed process segment is kept, including warm-up. A segment shorter than 30 minutes has no fitted slope.

| Segment | Samples | Hours | RSS start / close | MiB per 30 minutes |
| --- | --- | --- | --- | --- |
| 1 | 1442 | 24.017 | 85.11 MiB / 50.41 MiB | -0.944 |

Scope: actual app development identity. Physical gestures, Intel hardware and owner-only events require separate evidence. Event records: 0; their presence alone does not verify recovery. New diagnostic reports: 2; scan errors: 0; review: REVIEW REQUIRED. The observer completed its requested window.

The gate line reads NOT PASSED for one reason: the observer scans every process for new crash reports, and it found two, both non-fatal faults of the macOS text service nsattributedstringagent raised for the Software Update notifier at 22:11 UTC. None came from Stream Deck, Node or Mac Sensors, and every plugin measure above stayed within its limit, so 1.0.1.0 was released on that review. RSS fell from 92.55 to 50.41 MiB while the Mac was under memory pressure; the maximum footprint, 35.32 MiB, is lower than the 42.82 MiB of the 088ad51 observation below.

Host: Mac17,9, M5 Pro, macOS 27.0.1, Stream Deck 7.6.0.23012, app Node 24.22.1, 32 single-reading keys on the 8 by 4 Virtual Stream Deck at the default 1 second interval. The development bundle is the a6e7283 release bundle with the development identity and trace switch; the published package's 37 members equal that freeze.

### 2026-10-18 to 2026-10-19: Final 1.0.1 candidate, 24-hour observation

Command: `npm run soak -- --plugin <frozen dev directory> --out <evidence directory> --hours 24 --interval-ms 60000`. Package SHA-256: 7129b0adc980a89a9f2ab863fbd3b7e3f663cdbe0679913f8bfbf5e0e8d3e414 (316324 bytes). Development bundle SHA-256: 7c24b65d78d8dc53e053190d924338614e30cc7fe4a0a3ce10e3a4151f0fd6b1.

| Measure | Result |
| --- | --- |
| Window | 2026-10-18T04:05:25.047Z to 2026-10-19T04:06:25.391Z; 24.017 hours, 1442 samples |
| Maximum measured RSS slope | -0.011 MiB per 30 minutes |
| RSS start / close | 76.94 MiB / 82.08 MiB |
| Maximum RSS | 89.25 MiB |
| Maximum footprint | 42.82 MiB |
| File descriptors start / close / maximum | 49 / 49 / 50 |
| Maximum threads | 12 |
| CPU time across measured process segments | 574.97 seconds |
| Observed process identity changes | 0 |
| WARN / ERROR lines | 0 / 0 |
| Sampling gaps / freshness flags | 0 / 0 |
| Unexplained flags | 0 |
| Resource/freshness gate | PASS |

Each observed process segment is kept, including warm-up. A segment shorter than 30 minutes has no fitted slope.

| Segment | Samples | Hours | RSS start / close | MiB per 30 minutes |
| --- | --- | --- | --- | --- |
| 1 | 1442 | 24.017 | 76.94 MiB / 82.08 MiB | -0.011 |

Scope: actual app development identity. Physical gestures, Intel hardware and owner-only events require separate evidence. Event records: 0; their presence alone does not verify recovery. New diagnostic reports: 0; scan errors: 0; review: No new report filenames found in both inspected directories. The observer completed its requested window.

Host: Mac17,9, M5 Pro, macOS 27.0.1, Stream Deck 7.5.0.22885, app Node 24.13.1, 32 single-reading keys on the 8 by 4 Virtual Stream Deck at the default 1 second interval. The development bundle is the 088ad51 release bundle with the development identity and trace switch. For comparison, the 1.0.0 observation on 2026-10-12 recorded RSS start, close and maximum of 83.47, 191.48 and 197.59 MiB under the same harness in a different session; this run stayed between 76.94 and 89.25 MiB. The earlier 16c21a7 observation stopped at 22.25 hours when its launching session ended and is not counted.

### 2026-10-18 UTC: Actual app, final 1.0.1 against 1.0.0, back to back

Host and method as in the 2026-10-16 entry below: development clones on the 32-key Mac Sensors Dev Bench, 1.0.0 release addons, quiet arms without trace switches, interval forced by the measurement-only switch. The 1.0.1 build is the final candidate 088ad51 (release bundle bin/plugin.js SHA-256 fe905d3f494bb31ba079aa24c9d88a97448a690d387a397c03f274ebff494c82); the 1.0.0 build was rebuilt from tag v1.0.0 and its unpatched plugin.js equals the installed production file. Each interval ran two back-to-back pairs in opposite order, so drift between sessions cancels.

| Read every | Plugin CPU, one core: 1.0.0 / 1.0.1 (means of two arms) | Paired difference | Interrupt wakeups per second: 1.0.0 / 1.0.1 | RSS maximum, MiB: 1.0.0 / 1.0.1 |
| --- | --- | --- | --- | --- |
| 1 second | 0.855% / 0.668% | -0.187 points (-21.9%), pairs within 0.001 | 5.11 / 5.14 | 97.7 and 90.2 / 88.2 and 89.3 |
| 250 ms | 3.164% / 2.478% | -0.686 points (-21.7%), pairs within 0.076 | 18.07 / 17.78 | 109.6 and 107.8 / 95.9 and 94.6 |

- Threads stayed at 12 and file descriptors at 49 in every arm.
- The traced arm at 1 second showed the settle timer armed for the first eight reads after keys appeared and skipped on all 631 later reads; the wait between sources had a median of 11.5 ms and a maximum of 40.2 ms. No key received two frames for one read after the first read, and no identical frame twice in a row. In the first read after keys appear, keys with counter readings get a second frame when the rebaseline read brings CPU usage or a rate.
- Ten show and hide cycles balanced poller start and stop, did no work while hidden, and restarted the fast-read count each time.
- The arms cannot separate the causes of the CPU saving: one publication per read, measurement keys built once per packet and one snapshot accept per tick all changed together.
- Not covered here: a slow read after a fast run, a status screen during reads and a Read every change during a wait (unit and mock-host tests only), keys that mix system and SMC readings (no app editor access), dials and the detail view.

### 2026-10-16 UTC: Actual app, 1.0.0 and 1.0.1 development clones

Host: Mac17,9, M5 Pro, macOS 27.0.1, Stream Deck 7.5.0.22885, app Node 24.13.1. Both builds ran as the development identity with the 1.0.0 release native addons on the 32-key Mac Sensors Dev Bench (an 8 by 4 Virtual Stream Deck, 20 system and 12 SMC single-reading keys). The development process observer sampled every 5 seconds. "Quiet" arms ran without any trace switch; the interval was forced by a measurement-only switch that is not part of either release build. Other development test runs were active during parts of both sessions (load average about 2 to 5). The 1.0.1 columns are measurement builds of the 1.0.1 candidate at 16c21a7, whose release bundle is bin/plugin.js SHA-256 ef3ae8666320435e286940c96a668c08494c94c8088e446af445ee33d0ab07e4; the candidate armed a 100 ms settle timer on every read. The final 1.0.1 build waits for fast reads without that timer and has not been measured in the app yet; the next section has mock-host figures for that change.

| Read every | Plugin CPU, one core: 1.0.0 / 1.0.1 | Interrupt wakeups per second: 1.0.0 / 1.0.1 | Bytes sent to the app per second: 1.0.0 / 1.0.1 |
| --- | --- | --- | --- |
| 250 ms | 2.53% / 2.92% | 17.9 / 25.6 | 126,054 / 104,394 |
| 500 ms | 1.52% / 1.56% | 9.6 / 13.3 | 65,951 / 55,434 |
| 1 second | 0.72% / 0.82% | 5.1 / 6.9 | 37,458 / 30,650 |
| 2 seconds | 0.44% / 0.44% | 2.9 / 3.9 | 18,488 / 15,271 |
| 5 seconds | 0.20% / 0.21% | 1.2 / 1.6 | 7,041 / 5,888 |
| 1 second, back to back | 0.97% / 0.85% | 5.0 / 7.1 | 30,360 / 31,369 |

- The same 1.0.0 build measured 0.72% in the first session and 0.97% in the second, a 35% swing between sessions. CPU differences between the builds are within that drift and are not attributed to either build. Bytes sent follow how often the shown values changed in each session.
- The 16c21a7 candidate added about two interrupt wakeups per read at every interval. The cause was its 100 ms settle timer that lets system and SMC readings publish together: Node still wakes for the cleared timer. This was reproduced in Node alone, without Stream Deck or hardware. The final 1.0.1 build arms that timer only until eight reads in a row have their two sources settle within 50 ms of each other. Any read that is not fast, a Read every change and keys reappearing after none were visible start that count over, and every read that waits is timed while sensor data is unavailable, for example while keys show Reading sensors or No sensor data.
- With the traced 16c21a7 variant at 1 second, 1.0.1 composed faces about half as often (19,360 against 38,976 attempts in 10 minutes), and in both builds no key received more than one frame per read or two identical frames in a row. The settle window never reached its 100 ms limit; it waited a median 11.8 ms and at most 48 ms.
- After a key appeared, CPU usage showed a value after a median 253.6 ms with 1.0.1 (range 251.7 to 255.1 ms over 40 appearances) against about one second with 1.0.0.
- Threads stayed at 12 and file descriptors at 49 in every arm, including ten show and hide cycles; no reads, ticks or frames occurred while the bench was hidden. RSS ranged from about 78 to 111 MiB. With 1.0.0 at 250 ms it rose from 90.7 to 111.1 MiB in five minutes and then held; 1.0.1 at 250 ms peaked at 109.3 MiB.
- Production 1.0.0.0 itself, on the 32-key Mac Sensors Bench at its saved 1 second interval, used 0.82% of one core, 5.3 interrupt wakeups and 37,397 bytes per second over five minutes, with 12 threads and 49 file descriptors.

Not measured in the app: keys that mix system and SMC readings (the profiles that hold them could not be created without the app's editor), dials, the detail view, key presses and settings edits. The mock host covers mixed keys: 2 frames per read before and 1 after at every interval.

### 2026-10-16 UTC: Settle timer wakeups, mock host

The repository mock host (`scripts/lib/mock-host.mjs`) ran two builds in a plain Node 24.13.1 process with the 1.0.0 release native addons on the M5 Pro, macOS 27.0.1: the 16c21a7 release bundle (bin/plugin.js ef3ae866, built at 215b8e8, which differs from 16c21a7 only in PERF.md), which arms the 100 ms settle timer on every read, and 802e604 (bin/plugin.js SHA-256 23c5f6008fe92eee6dc77fa3afdb25165403e0dea30f3e88a3c2fce5877505fc), which waits for fast reads without it. The layout was six contexts: a CPU usage sparkline key, an SMC temperature key, a dual key with CPU usage and an SMC temperature, a quad key with memory, network receive, an SMC fan and SMC power, an SMC dial and a CPU usage dial. After a warm-up of at least 5 seconds and 10 reads, so that a run of fast reads had built up, the development process observer read a 60-second window. Three rounds ran in alternating order with load average 1.8 to 2.7. The script that set up the six contexts and timed the windows is an uncommitted development harness, so this entry cannot be reproduced from the repository alone.

| Read every | Interrupt wakeups per second, mean of three rounds: 16c21a7 / 802e604 | Plugin CPU time per second, mean: 16c21a7 / 802e604 |
| --- | --- | --- |
| 1 second | 6.89 / 4.89 | 6.06 ms / 6.12 ms |
| 250 ms | 25.60 / 17.65 | 22.29 ms / 21.94 ms |

Every 802e604 round had fewer interrupt wakeups than every 16c21a7 round, about two fewer per read at both intervals. CPU time differences are within the spread between rounds. Neither build sent two frames to one context within 60 ms, and the mixed keys averaged at most one frame per read in both. This is mock-host evidence, not the Stream Deck app: the app's rendering pipeline is not included, and the layout has six contexts instead of 32. The final 1.0.1 build adds later changes on top of 802e604 and has not been measured in the app yet.

### 2026-10-12: Installed Mac candidate, 24-hour observation

Harness: `npm run soak -- --hours 24 --interval-ms 60000`, with the frozen development directory and a separate private evidence destination. CI package SHA-256: d8db87c270d5803a7fe0e769326acc5b2142d15bb4918cfe564757386c1f6c89 (316713 bytes). Development bundle SHA-256: 9a2f9133d43927ced59fff82d0b3ec7874502cd356d4afb598d3a83c5dd6ad43.

Host: Mac17,9, M5 Pro, macOS 27.0.1, Stream Deck 7.5.0.22885, app Node 24.13.1. The actual app exercised 32 keys on an 8 by 4 Virtual Stream Deck. The dev identity used the product JavaScript and native files with its declared UUID/trace transformation.

| Measure | Result |
| --- | --- |
| Window | 2026-10-12 12:43:22 UTC to 2026-10-13 12:44:22 UTC; 24.017 hours |
| External samples | 1,442, at one-minute intervals |
| RSS fitted slope | 0.280 MiB per 30 minutes in the restarted process; first process had one sample and no fitted slope |
| RSS start / close / maximum | 83.47 / 191.48 / 197.59 MiB |
| Maximum physical footprint | 166.01 MiB |
| File descriptors start / close / maximum | 49 / 49 / 49 |
| Maximum threads | 12 |
| Measured process CPU time | 663.88 seconds across process segments |
| Plugin restart | One injected kill; fresh system and SMC observations recovered in 2.28 seconds |
| WARN / ERROR lines | 0 / 0 |
| Sampling gaps / freshness flags | 0 / 0 |
| Explained process-missing samples | One during the verified kill |
| Unexplained flags | 0 |
| New crash or panic reports | 0; both diagnostic directories also checked recursively |
| Resource and freshness gates | PASS |

All samples, including warm-up, are retained. RSS rose in steps during the first two hours, then remained near 198 MiB before settling near 191 MiB. The full-window fit meets the declared gate; this does not establish the cause of the initial allocations or prove that every workload is leak-free. No inspector, forced collection or runtime replacement was used to alter the measured process.

The production UUID was installed through Safari/Finder over 0.9.90.0, with download quarantine retained. All 37 installed members matched the CI candidate exactly. After the dev observation, the production bench reported 14 public/derived and 38 SMC readings, no source errors and changing live CPU values through the actual app inspector, with zero settings writes during the diagnostic requests. Its mapped native addon matched the qualified file.

The owner requested a visible bench, so a separate hidden-window check ended after 13 samples and is not a completed hidden-for-hours test. App restart, two-minute sleep/wake, physical deck gestures and the physical Intel observation remain owner-only work. A Virtual Stream Deck and Rosetta do not replace those checks.

### 2026-10-13: Published 1.0.0.0 artifact

The [GitHub release](https://github.com/slawrensen/mac-sensors-streamdeck/releases/tag/v1.0.0) contains a 316713-byte package with SHA-256 d977a41e86e6ac4542f7bd3e0e00dfe6c01fb914ad0ecc1a9d6cac8a2ec54487. All 37 payload members match the observed CI candidate byte for byte, including both native addons. The ZIP container checksum differs from that candidate. Authenticated published downloads and the native manifest checksums passed.

Safari downloaded the final package with quarantine intact. Finder opening produced the app's AlreadyInstalled result for the equal version. The existing production process continued, and every installed payload file still matched. No additional install or restart is claimed from that no-op. The completed observation and its unexecuted physical/Intel checks above apply to these identical runtime files.
