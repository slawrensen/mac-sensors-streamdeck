# Native reader validation

The addon reads hardware through three sources: public system counters, SMC, and battery and drive health. Its only SMC transport accepts commands 5, 8 and 9, checks the exact returned structure length and firmware status, and validates the type, size and value before publishing a reading. It exposes no hardware setter, fan control, address or resource handle to JavaScript.

Build with `npm run build:native`. The build pins Node 24.13.1 headers, Node-API 8, warnings as errors and macOS 13.5. It creates separate arm64 and x86_64 production, test and wrong-protocol artifacts. `binding.gyp` describes the same source and deployment floor for development tools; release artifacts come from the checked build script, including deterministic UUID assignment and signing.

Run `npm run test:native` with the app's Node runtime and with an x86_64 Node runtime under Rosetta. Run `npm run test:mac` for provider, identity, freshness and rendering seams. `node scripts/validate-native.mjs` independently inspects both Mach-O metadata sections and signatures, rejecting test builds even when renamed. `node scripts/abi-check.mjs` loads and reads the same prebuilt bytes under its calling runtime. No rebuild occurs in the ABI check.

The test backend exists only in separate test artifacts. It exercises the read-command allowlist before transport, signed/fractional/zero/nonfinite decoding, transport/firmware/length failures, network counter aggregation across a 4 GiB boundary with unchanged interface eligibility, opaque receiver checks, queued/running close, bounded work across replacement sessions, delayed optional work, environment teardown,10,000 reads and2,000 open/close cycles. The resource bounds are 64 MiB final RSS growth and at most 2 additional file descriptors after warmup and garbage collection. This is a bounded regression test, not proof against every possible kernel stall.

Acquisition ages use the start of the actual read. Public counter batches use their earliest acquisition boundary, so a delayed later call cannot make earlier values look new. Only completed, successful reads become observations.

Each source owns one asynchronous work slot across all sessions in the Node environment. A queued job can be cancelled; a running kernel call cannot. Jobs retain their session and native resources until completion. An asynchronous environment cleanup hook suppresses JavaScript delivery and waits for actual completion before releasing its reference. See the [Node-API lifetime documentation](https://nodejs.org/api/n-api.html#finalization-on-the-exit-of-the-nodejs-environment).

`node scripts/bench-native.mjs <output directory>` records 1,000 steady-state acquisitions at 1 second and then 1,000 at 250 ms. Cold discovery is recorded separately. The gate is p99 total acquisition time at or below 25 ms, with no source-level errors and a median at or below 25 ms. With `--control <file.node>`, the shipped reader for the same architecture, the candidate and the control read in turn, 1,000 acquisitions each per interval, each tick 3 ms later than the interval so both readers meet every phase of another app's periodic SMC load. A candidate p99 over 25 ms then passes only when the control's p99 in the same run is over 25 ms too and the candidate's is at most 1.25 times the control's; a control within budget leaves the absolute gate in force. An external process sampler supplies CPU, memory and thread evidence. Run the benchmark on both physical architectures; Rosetta is additional ABI evidence and never substitutes for the Intel host.

## Catalog and exclusions

The bounded table lists 245 rows; one Mac is asked for at most 108. Rows apply to every Mac, to every Apple silicon Mac, to one chip family (M1 to M6 and A18 Pro, chosen by the exact CPU brand string, with the measured model keeping its family when a translated process reads another name), or to the one measured model, Mac17,9 with t6050. Chip family rows come from the pinned Stats table and are measured only on that model; on any other Mac they accept 10 to 120 °C, and the measured model keeps -50 to 150. The test build reads every family's rows through a scripted SMC transport that answers as that Mac would; no SMC other than the measured one has been read. An unknown CPU name, a virtual machine and an Intel Mac keep the common rows. Readings identify the exact model, four key bytes and a semantic revision. Display labels and build identifiers are not part of measurement identity. Selected names/key associations are documented in provenance.json and NOTICE.md.

On the development M5 Pro, the initial native provider observed 38 SMC readings and 14 public/derived readings. That is one host observation, not a promise that another Mac offers the same catalog. The public readings are CPU activity, named VM page counts, swap use, startup-volume space and aggregate network/storage rates. Network rates sum each eligible interface's 64-bit byte counters from the IFMIB interface table (if_data64); the getifaddrs if_data counters are 32-bit and wrap every 4 GiB. The first sample, counter resets, membership changes and a detected sleep gap withhold derived rates until a new baseline exists. Memory fields are the named Mach counters, not an imitation of Activity Monitor's Memory Used.

The discovery probe enumerated 3,573 SMC metadata keys. It attempted 530 numeric-prefix reads, 486 of which were finite; 38 of those appear in the initial production sample. The remaining 448 finite values have no qualified meaning/type assignment in this bounded release table; 44 probe reads failed or had no finite value; 3,043 entries were metadata only. No opaque or control field is offered merely because its bytes can be decoded. The private qualification ledger records an individual disposition for every discovered key.

All 76 HID temperature registrations are excluded: duplicate Product/Location identities and invalid values were observed. They do not prove 76 physical sensors, and ordinal suffixes would create unstable identities. The 11,391 IOReport channel entries were metadata, not qualified clock or power observations. CPU/GPU clocks and unqualified per-chip power channels therefore remain unavailable. Private GPU usage fields were observed but are excluded until adapter identity, power-off, reset and absence behavior are qualified. Other sensor categories remain available when these optional sources are absent.

The fixed setup images contain rendered text, not font binaries. Tahoma presence is checked by exact PostScript name with automatic font activation disabled. If the font is missing, ordinary measurement faces are withheld. No font or Qt framework is included in the package.

## Battery and drive health source

The `health` source uses public SDK interfaces only. `IOPSCopyPowerSourcesInfo` decides whether a present internal battery exists; without one there are no battery rows. `AppleSmartBattery` gives `CycleCount` (`kIOPMPSCycleCountKey` in IOPM.h) and battery health as `NominalChargeCapacity` in percent of `DesignCapacity`, read from the `BatteryData` dictionary, where macOS 27.0.1 keeps both, or from the entry itself. The internal NVMe drive's composite temperature comes from the NVMeSMARTLib plug-in declared in `IOKit/storage/nvme/NVMeSMARTLibExternal.h`: the `IOBlockStorageDevice` with `NVMe SMART Capable` and a `Protocol Characteristics` location of `Internal` (matching the property alone walks the whole registry, 2 to 4 ms), `IOCreatePlugInInterfaceForService`, `QueryInterface` and `SMARTReadData`, then kelvin minus 273.15. The user client is opened and closed for every read, and no handle is kept. A Mac with two internal SMART drives gets an invalid row instead of a value. Nothing is written, and no IOHID event or IOReport API is used. Unknown: whether Intel and T2 Macs publish `NVMe SMART Capable` on a block storage device, and the battery fields before macOS 27; where they do not, that reading is absent, never guessed.

Before building on SMART, a standalone read-only C program over the same public calls ran as uid 501 without sudo on the development M5 Pro (macOS 27.0.1): one internal `IOEmbeddedNVMeBlockDevice`, plug-in creation 2.46 ms the first time, `SMARTReadData` 0.12 to 0.20 ms, and open, read and close 0.19 ms on average over 20 cycles, temperature 309 K. The same run showed that this macOS publishes no `BatteryHealth` or `BatteryHealthCondition` in the IOPowerSources dictionary, so no condition text is offered. The battery health percent is not the Maximum Capacity that macOS shows (96 % against 92.1 % on that Mac); Apple does not publish that method.

`node scripts/bench-native.mjs` with native 1.1.0 (sourceId 86e3c77a) reads all three sources on every sample, more often than the provider asks health. At 1 second, 1,000 reads took p50 13.57 ms and p99 16.23 ms in total (health p50 1.90 ms, p99 4.27 ms), with 51 SMC, 9 public and 3 health rows valid in every sample and no errors. At 250 ms the total p99 was 40.85 ms and the run did not pass: all 112 samples over 25 ms fell on every eighth sample, 2 seconds apart, where the SMC read took up to 43.83 ms while health took at most 5.54 ms. TG Pro, Stats and the installed Mac Sensors held their own SMC connections on that Mac, and in one of two runs of 240 SMC-only reads at 250 ms, with no health read, 30 reads over 25 ms fell on the same 2-second beat, so the slow reads are SMC contention outside this source.

The read name `health` did not need protocol 2. The exported functions, the session methods and the packet fields are unchanged, and the loader refuses a native reader whose version or sourceId differs from the plugin's contract, so JavaScript and native always ship as one pair and neither can meet a peer without the new name. The native version is 1.1.0 for the added source.

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
