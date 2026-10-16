# Performance

The native collector budget is a 25 ms p99 acquisition time at one-second and 250 ms read intervals. Cold discovery is measured separately. Run `node scripts/bench-native.mjs <output directory>` under the Stream Deck app's Node runtime to reproduce the benchmark, and record external CPU and memory samples.

On an M5 Pro running macOS 27.0.1 and Node 24.13.1, 1,000 reads at each interval measured p99 acquisition of 14.63 ms and 15.01 ms. Every sample contained nine direct system readings and 38 SMC readings. This is native-component evidence in a terminal, not the installed plugin's total rendering cost or a physical Intel measurement.

The sampled process used at most 63.3 MB of RSS during that run. External CPU samples averaged 0.39% and peaked at 1.3%. Background development activity was present. Final app and device measurements will be recorded separately.

### 2026-10-12: CI native binaries on the M5 Pro

The release toolchain is Xcode 26.6 with SDK 26.5 and pinned Node 24.13.1headers. Its arm64 addon SHA-256 is 3968022b3f9146fb979202c7e8ab5ebf27a3405070c700bfa1d33c5cd2175bcd; x86_64 is 2055deaf2e759176314d7904d4d9956c50be65135030d28fd9490316a093ca7e. Both hosted architectures produced identical artifacts. The local app's Node 24.13.1ran the same benchmark logic against those downloaded files.

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

The repository mock host (`scripts/lib/mock-host.mjs`) ran the 1.0.1 candidate bundle with the 1.0.0 release native addons (arm64 SHA-256 3968022b3f9146fb979202c7e8ab5ebf27a3405070c700bfa1d33c5cd2175bcd) under Node 24.13.1 on the M5 Pro, macOS 27.0.1. The layout was six contexts: a sparkline key, an SMC key, a dual and a quad key mixing public and SMC readings, and two dials. After 5 seconds of warm-up, the development process observer (`npm run build:observer`) read the plugin process CPU time at the start and end of a 40-second window. Two rounds ran in alternating order.

| Read every | Plugin CPU time per second (two runs) | Frames per second, all six contexts |
| --- | --- | --- |
| 250 ms | 18.1 ms, 19.1 ms | 16.9, 17.1 |
| 1 second | 5.2 ms, 5.4 ms | 5.5, 5.0 |
| 5 seconds | 1.1 ms, 1.2 ms | 1.2, 1.2 |

This supports the panel help line that shorter intervals use more processor time. It is mock-host evidence with the real read-only native reader, not the Stream Deck app: the app's rasterization and device transfer cost is not included. Background development activity was present.

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

The [private GitHub release](https://github.com/slawrensen/mac-sensors-streamdeck/releases/tag/v1.0.0) contains a 316713-byte package with SHA-256 d977a41e86e6ac4542f7bd3e0e00dfe6c01fb914ad0ecc1a9d6cac8a2ec54487. All 37 payload members match the observed CI candidate byte for byte, including both native addons. The ZIP container checksum differs from that candidate. Authenticated published downloads and the native manifest checksums passed.

Safari downloaded the final package with quarantine intact. Finder opening produced the app's AlreadyInstalled result for the equal version. The existing production process continued, and every installed payload file still matched. No additional install or restart is claimed from that no-op. The completed observation and its unexecuted physical/Intel checks above apply to these identical runtime files.
