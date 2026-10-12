# Performance

The native collector budget is a 25 ms p99 acquisition time at one-second and 250 ms read intervals. Cold discovery is measured separately. Run `node scripts/bench-native.mjs <output directory>` under the Stream Deck app's Node runtime to reproduce the benchmark, and record external CPU and memory samples.

On an M5 Pro running macOS 27.0.1 and Node 24.13.1, 1,000 reads at each interval measured p99 acquisition of 14.63 ms and 15.01 ms. Every sample contained nine direct system readings and 38 SMC readings. This is native-component evidence in a terminal, not the installed plugin's total rendering cost or a physical Intel measurement.

The sampled process used at most 63.3 MB of RSS during that run. External CPU samples averaged 0.39% and peaked at 1.3%. Background development activity was present. Final app and device measurements will be recorded separately.
