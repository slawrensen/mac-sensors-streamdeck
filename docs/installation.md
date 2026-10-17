---
layout: default
title: Installation and requirements
nav_order: 2
---

# Installation and requirements

You need macOS 13.5 or later and Stream Deck 7.1 or later. The package includes arm64 and x86_64 readers and requests the app's Node 24 runtime. No separate sensor application is required.

1. Get the `.streamDeckPlugin` file from the project's GitHub releases. Version 1.0.1.0 downloads require repository access. Marketplace submission and availability are separate.
2. Open the downloaded file in Finder and choose **Install** in Stream Deck.
3. Find **Mac Sensors** in the Actions list and drag **Sensor Reading** onto a key.
4. Pick a reading in the settings panel.

Tahoma Bold must be available in Font Book. If a key says **Tahoma needed**, open Font Book, install or download the available Tahoma family, and choose **Check again** in the panel. The plugin includes rendered setup artwork, not a font file.

The binary deployment floor is not a claim that every Mac or older OS combination was tested. Consult the [measured compatibility table](hardware.html). Sensor availability depends on the model and macOS interfaces.

For updates, open a newer package normally. Equal versions may be ignored by the app. Keep a profile backup before development replacement or uninstall work. Removing the plugin does not require removing your profiles.
