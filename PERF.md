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
| Source observations | Every sample had at least 9 direct system and 38 SMC rows; zero source errors |
| Maximum RSS | About 63.3 MB in each full window |
| Event-loop p99 | About 2.2 ms |

The first window's slow one-second reads occurred near the same wall-clock second once per minute. Their cause is unknown. Both windows are retained; the later pass does not erase the earlier failure. These are native-component timings under background development activity, not a promise of constant latency or the total cost of rendering a deck.

### 2026-10-12: Installed candidate observation in progress

The 1.0.0.0 CI package is 316713 bytes, SHA-256 d8db87c270d5803a7fe0e769326acc5b2142d15bb4918cfe564757386c1f6c89. It was downloaded through Safari, opened from Finder and installed normally over 0.9.90.0. All 37 installed members match the candidate, with manifest JSON compared semantically.

The isolated development identity uses those native bytes and product JavaScript with the documented development UUID/trace prefix. Its 24-hour real-app Virtual Stream Deck observation started 2026-10-12T12:43:22Z. A task-owned plugin kill recovered with fresh system and SMC observations in 2.28 seconds. The window is not yet qualified. Memory slopes, resource samples, acquisition evidence, logs and new diagnostic reports will be assessed after it closes.

Physical deck gestures, sleep/wake, restarting the original app and the physical Intel window remain explicit owner work. A Virtual Stream Deck and Rosetta do not replace those checks.
