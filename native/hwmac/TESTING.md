# Native reader validation

The addon reads hardware. Its only SMC transport accepts commands 5, 8 and 9, checks the exact returned structure length and firmware status, and validates the type, size and value before publishing a reading. It exposes no hardware setter, fan control, address or resource handle to JavaScript.

Build with `npm run build:native`. The build pins Node 24.13.1 headers, Node-API 8, warnings as errors and macOS 13.5. It creates separate arm64 and x86_64 production, test and wrong-protocol artifacts. `binding.gyp` describes the same source and deployment floor for development tools; release artifacts come from the checked build script, including deterministic UUID assignment and signing.

Run `npm run test:native` with the app's Node runtime and with an x86_64 Node runtime under Rosetta. Run `npm run test:mac` for provider, identity, freshness and rendering seams. `node scripts/validate-native.mjs` independently inspects both Mach-O metadata sections and signatures, rejecting test builds even when renamed. `node scripts/abi-check.mjs` loads and reads the same prebuilt bytes under its calling runtime. No rebuild occurs in the ABI check.

The test backend exists only in separate test artifacts. It exercises the read-command allowlist before transport, signed/fractional/zero/nonfinite decoding, transport/firmware/length failures, opaque receiver checks, queued/running close, bounded work across replacement sessions, delayed optional work, environment teardown,10,000 reads and2,000 open/close cycles. The resource bounds are 64 MiB final RSS growth and at most 2 additional file descriptors after warmup and garbage collection. This is a bounded regression test, not proof against every possible kernel stall.

Acquisition ages use the start of the actual read. Public counter batches use their earliest acquisition boundary, so a delayed later call cannot make earlier values look new. Only completed, successful reads become observations.

Each source owns one asynchronous work slot across all sessions in the Node environment. A queued job can be cancelled; a running kernel call cannot. Jobs retain their session and native resources until completion. An asynchronous environment cleanup hook suppresses JavaScript delivery and waits for actual completion before releasing its reference. See the [Node-API lifetime documentation](https://nodejs.org/api/n-api.html#finalization-on-the-exit-of-the-nodejs-environment).

`node scripts/bench-native.mjs <output directory>` records 1,000 steady-state acquisitions at 1 second and then 1,000 at 250 ms. Cold discovery is recorded separately. The gate is p99 total acquisition time at or below 25 ms, with no source-level errors. An external process sampler supplies CPU, memory and thread evidence. Run the benchmark on both physical architectures; Rosetta is additional ABI evidence and never substitutes for the Intel host.

## Catalog and exclusions

The bounded table has 74 candidate SMC keys. The generation-specific table is qualified only for the observed Mac17,9/t6050 model/chip pair; unknown pairs retain common typed keys. Readings identify the exact model, four key bytes and a semantic revision. Display labels and build identifiers are not part of measurement identity. Selected names/key associations are documented in provenance.json and NOTICE.md.

On the development M5 Pro, the initial native provider observed 38 SMC readings and 14 public/derived readings. That is one host observation, not a promise that another Mac offers the same catalog. The public readings are CPU activity, named VM page counts, swap use, startup-volume space and aggregate network/storage rates. The first sample, counter resets, membership changes and a detected sleep gap withhold derived rates until a new baseline exists. Memory fields are the named Mach counters, not an imitation of Activity Monitor's Memory Used.

The discovery probe enumerated 3,573 SMC metadata keys. It attempted 530 numeric-prefix reads, 486 of which were finite; 38 of those appear in the initial production sample. The remaining 448 finite values have no qualified meaning/type assignment in this bounded release table; 44 probe reads failed or had no finite value; 3,043 entries were metadata only. No opaque or control field is offered merely because its bytes can be decoded. The private qualification ledger records an individual disposition for every discovered key.

All 76 HID temperature registrations are excluded: duplicate Product/Location identities and invalid values were observed. They do not prove 76 physical sensors, and ordinal suffixes would create unstable identities. The 11,391 IOReport channel entries were metadata, not qualified clock or power observations. CPU/GPU clocks and unqualified per-chip power channels therefore remain unavailable. Private GPU usage fields were observed but are excluded until adapter identity, power-off, reset and absence behavior are qualified. Other sensor categories remain available when these optional sources are absent.

The fixed setup images contain rendered text, not font binaries. Tahoma presence is checked by exact PostScript name with automatic font activation disabled. If the font is missing, ordinary measurement faces are withheld. No font or Qt framework is included in the package.

## Host conditions still requiring direct evidence

| Condition | Required evidence |
| --- | --- |
| Physical Intel Mac | Native and provider live tests, ABI, 25 ms budget, installed app load and qualification on that host |
| Sleep and wake | Real sleep/wake event, old values removed before redraw, source recovery and counter baseline reset |
| Deck gestures and reconnect | Installed exact package, action/encoder/touch traces and before/after acquisition evidence |
| Font missing and recovery | Deterministic tests first; optional controlled user-font fixture, never removing a system font |
| Addon replacement | Stop the owned plugin process, copy to a new inode and rename; do not overwrite a mapped Mach-O |
| Long soak | At least 24 elapsed hours, exact hashes, external resource samples and actual event ledger |
| Device rendering | App renderer census matched to a physical-device photograph |

CI and simulated-host tests cannot close these physical evidence rows. A load failure does not by itself prove a signing, security-software or permission cause.

## Current host-condition record

Development host: Mac17,9, Apple M5 Pro, 64 GB, 18 logical CPUs, macOS 27.0.1 build 26A434. App 7.5.0.22885 is universal; the app's selected Node runtime is 24.13.1. The measured connected surface is Virtual Stream Deck, 8 by 4; no physical Elgato USB device was attached. Physical firmware and dial rows therefore remain unexecuted. Runtime paths use the app's NodeJS directory under Application Support; no user name or serial number is included here.

| Row | Condition | Current evidence/status |
| --- | --- | --- |
| 1 | Standard user, app running | Actual app/dev Virtual Stream Deck publishes 14 system and 38 SMC readings; physical keys/dials not executed |
| 2 | App restart | Not executed: original app predates the task; owner session required |
| 3 | Plugin kill / app quit | Owned plugin SIGKILL recovered in 2.28 s with fresh sources; original-app quit is owner-only |
| 4 | Sleep/resume at least 2 minutes | Not executed: owner wake required; continuous/awake clock observer prepared |
| 5 | Clamshell | Not executed: physical lid/wake action |
| 6 | Fast User Switching | Not executed: owner session |
| 7 | Screen Sharing | Not executed: owner settings/session |
| 8 | Sign out/in | Not executed: owner session |
| 9 | Replacement while loaded | Dev promotion refused; old native hash unchanged |
| 10 | Replacement after exit | Owned dev unlinked, stopped, replaced by rename and relinked with exact CI hashes |
| 11 | Browser package route | Safari quarantine retained on download; normal Finder/app install and upgrade; installed hashes verified |
| 12 | Marketplace DRM route | Not executed: submission and approval are owner-only |
| 13 | Low Power Mode, battery/AC | Not executed: owner controls; original settings recorded |
| 14 | Sustained CPU load | Six owned workers raised measured temperatures and both automatic fan readings; no actuator calls. Physical alert-color check remains owner-only |
| 15 | App hidden for hours | Ended early at the owner's request after 13 hidden/fresh samples; not a completed hours-long check |
| 16 | Second physical deck | Not executed: device attach/detach required |
| 17 | Detail profiles | Software archive/navigation tests and real-app isolated profile install/switch/restore; physical managed-detail route remains owner-only |
| 18 | Dial/control gestures | Software traces pass; physical gestures not executed |
| 19 | Fanless Mac | Not executed: no such host available in this session |
| 20 | Rosetta | x86_64 Node 20/22/24 live ABI passes on M5 Pro; whole-app Rosetta setting remains owner-only |
| 21 | Missing Tahoma | Deterministic production-path fallback/recovery tests pass; no system font was removed |
| 22 | Two-GPU Intel laptop | Not executed: physical Intel inventory is pending |
| 23 | Energy on battery | External CPU/wakeup metrics recorded on this host; battery-condition comparison not executed |
| 24 | OS point update during program | Not executed: no update performed during qualification |
| 25 | Offline notarized first load | Not applicable: Developer ID/notarization was not selected |

The 24.017-hour development-identity window completed on 2026-10-13 with 1,442 samples, a 0.280 MiB per 30 minutes RSS slope, no unexplained flags and no new diagnostic reports. See PERF.md for the full scope and retained owner-only events. The installed production UUID also returned live readings after the window.
