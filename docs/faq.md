---
layout: default
title: FAQ and privacy
nav_order: 13
---

# FAQ and privacy

## Does it control my fans?

No. It exposes no hardware setter, fan control, privileged helper or background service. The SMC transport accepts read and metadata operations only.

## Why is a reading missing?

The selected Mac may not expose it, its meaning may be unqualified, or a read may have failed or expired. The saved identity is retained. The plugin does not replace it with the nearest name or list position.

## Why does a key statistic show N/A?

Provider-wide historical statistics are unavailable. Key MIN, MAX and AVG stay N/A. Dial statistics are local to the current session and use genuine observations.

## Can I keep settings from another computer?

Themes, display choices and alerts can be carried in a configuration document. A reading that does not exist on this Mac shows Sensor missing. Unknown fields and a saved alternative font choice remain in the document. No silent rebinding or migration is performed.

## Privacy

The plugin runs on the Mac and reads hardware/system values through local macOS interfaces. Settings live in the Stream Deck app. It makes no internet requests, has no telemetry or advertising, and has no update channel of its own. The SDK communicates with the local Stream Deck app over its loopback WebSocket.

A support report contains runtime versions, model/chip information and catalog summary. It excludes user names, serial numbers, hardware UUIDs, raw device identifiers and sensor values. You choose when to copy and share it. Diagnostic tracing is opt-in development work, not telemetry.

## How do updates arrive?

Through the project's GitHub releases, which require repository access, or the Elgato Marketplace when available. The plugin does not download its own updates.
