# Development process observer

This tool is never included in the plugin package. Build with `npm run build:observer`. It reads public macOS process APIs without privileges: resource usage, physical footprint, threads, file descriptors, executable path and process start time. Identity is checked before and after collection; failed reads remain failures.

CPU times are Mach absolute-time ticks and are converted with the host timebase. The test compares an owned busy process against Node's independent `process.cpuUsage()` result, preventing a 41.7-fold unit error on this Apple silicon host. Apple's [task time implementation](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/task.c) provides the clock context; declarations come from the installed public SDK headers. No Apple implementation code is copied here.

Executable paths and raw soak logs remain local development evidence. Public reports must redact home-directory names. UUID bytes from the resource structure are never emitted.
