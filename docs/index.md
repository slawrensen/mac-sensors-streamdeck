---
layout: default
title: Home
nav_order: 1
description: Temperatures, fan speeds, power, CPU usage, memory, storage and network rates on Stream Deck keys and dials, read through read-only macOS interfaces.
---

<header class="home-intro">
  <h1 id="mac-sensors-for-stream-deck">Mac Sensors <span>for Stream Deck</span></h1>
  <p class="home-lead">Mac Sensors shows temperatures, fan speeds, power, CPU usage, memory, storage and network rates on Stream Deck keys and dials, read through read-only macOS interfaces.</p>
  <div class="home-actions">
    <a class="button button-primary" href="{{ '/getting-started.html' | relative_url }}">Get started <span aria-hidden="true">→</span></a>
    <a class="button button-secondary" href="{{ '/installation.html' | relative_url }}">Installation and requirements <span aria-hidden="true">→</span></a>
  </div>
  <p class="home-requirements"><strong>Needs</strong> macOS 13.5 or later, the Stream Deck app 7.1 or later with the Node 24 runtime it supplies, and Tahoma Bold, which ships with macOS. No separate sensor app. These are declared floors; <a href="{{ '/hardware.html' | relative_url }}">Hardware compatibility</a> lists what has actually run.</p>
  <p class="home-release">Version 1.0.1.0 is published as a GitHub release, and its downloads require repository access. Mac Sensors is not on the Elgato Marketplace yet, so there is no public download link.</p>
</header>

<section class="hero-gallery" data-gallery aria-label="Production-rendered boards">
  <div class="gallery-slides">
    <figure data-gallery-slide data-gallery-title="Every action">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/readme-hero.png' | relative_url }}" aria-label="Enlarge image: Board of Mac Sensors keys and dials: one temperature key in each of the seven themes, a four-reading key, single keys for temperature, fan, power, CPU, memory, network and free space, two- and three-reading keys, a ring and a bar, warning and critical keys, a Back tile, a detail title tile and four dial views" data-image-caption="Production-rendered sample data: Mac catalog readings, several under custom labels (CPU super 1, CPU activity, Network RX, Free space). Rendered with Accent colors set to Theme accent everywhere, so graphs use each theme’s accent instead of the default colors by sensor type. Values are illustrative; this is not a hardware photograph.">
        <img src="{{ '/assets/img/readme-hero.png' | relative_url }}" width="1600" height="1040" fetchpriority="high" alt="Board of Mac Sensors keys and dials: one temperature key in each of the seven themes, a four-reading key, single keys for temperature, fan, power, CPU, memory, network and free space, two- and three-reading keys, a ring and a bar, warning and critical keys, a Back tile, a detail title tile and four dial views">
      </a>
      <figcaption>Production-rendered sample data: Mac catalog readings, several under custom labels (CPU super 1, CPU activity, Network RX, Free space). Rendered with <strong>Accent colors</strong> set to <strong>Theme accent everywhere</strong>, so graphs use each theme’s accent instead of the default colors by sensor type. Values are illustrative; this is not a hardware photograph.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Themes">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/themes.png' | relative_url }}" aria-label="Enlarge image: The same CPU super 1 key at 62.4 °C with a sparkline in each of the seven themes: Void, Graphite, Ultraviolet, Midnight, Forest, Ember and Paper" data-image-caption="Production-rendered sample data: the CPU super core 1 reading with the custom label CPU super 1 and an illustrative value. Rendered with Accent colors set to Theme accent everywhere, so each sparkline shows its theme’s own accent instead of the default temperature accent.">
        <img src="{{ '/assets/img/themes.png' | relative_url }}" width="1280" height="720" loading="lazy" decoding="async" alt="The same CPU super 1 key at 62.4 °C with a sparkline in each of the seven themes: Void, Graphite, Ultraviolet, Midnight, Forest, Ember and Paper">
      </a>
      <figcaption>Production-rendered sample data: the CPU super core 1 reading with the custom label CPU super 1 and an illustrative value. Rendered with <strong>Accent colors</strong> set to <strong>Theme accent everywhere</strong>, so each sparkline shows its theme’s own accent instead of the default temperature accent.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Type accents">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/accents.png' | relative_url }}" aria-label="Enlarge image: Eight Sensor Reading keys whose trend lines take their sensor type’s color: CPU super 1 and GPU 1 in rose, Fan 1 in cyan, System Total in gold, CPU activity in violet, Memory active in magenta, Network RX in blue, and Free space in the Void theme’s sky-blue accent" data-image-caption="Production-rendered sample data with Accent colors on By sensor type, the default.">
        <img src="{{ '/assets/img/accents.png' | relative_url }}" width="1280" height="720" loading="lazy" decoding="async" alt="Eight Sensor Reading keys whose trend lines take their sensor type’s color: CPU super 1 and GPU 1 in rose, Fan 1 in cyan, System Total in gold, CPU activity in violet, Memory active in magenta, Network RX in blue, and Free space in the Void theme’s sky-blue accent">
      </a>
      <figcaption>Production-rendered sample data with <strong>Accent colors</strong> on <strong>By sensor type</strong>, the default.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Reading colors">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/reading-colors.png' | relative_url }}" aria-label="Enlarge image: Two Sensor Dial overview faces with rows CPU SUPER 1, GPU 1 and FAN 1: uniform white numbers on the left, blue, rose and green numbers on the right, with the same labels, units and layout" data-image-caption="Production-rendered sample data: Mac catalog readings, the first with the custom label CPU super 1, and illustrative values. Only the number colors differ. Rendered with Accent colors set to Theme accent everywhere.">
        <img src="{{ '/assets/img/reading-colors.png' | relative_url }}" width="1280" height="720" loading="lazy" decoding="async" alt="Two Sensor Dial overview faces with rows CPU SUPER 1, GPU 1 and FAN 1: uniform white numbers on the left, blue, rose and green numbers on the right, with the same labels, units and layout">
      </a>
      <figcaption>Production-rendered sample data: Mac catalog readings, the first with the custom label CPU super 1, and illustrative values. Only the number colors differ. Rendered with <strong>Accent colors</strong> set to <strong>Theme accent everywhere</strong>.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Value shown">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/stat-modes.png' | relative_url }}" aria-label="Enlarge image: Eight key faces. Top row: CPU super 1 with its sparkline at 62.4 °C, then the same key showing MIN 39.9 °C, MAX 63.7 °C and AVG 51.3 °C, each with a small badge. Bottom row: CPU super 1 over GPU 1 at 62.4 and 54.8 °C, then MIN 39.9 and 36.2, MAX 63.7 and 57.3, and AVG 51.3 and 46.1, one shared badge on each divider" data-image-caption="Production-rendered sample data with sample session statistics, drawn with Accent colors set to Theme accent everywhere.">
        <img src="{{ '/assets/img/stat-modes.png' | relative_url }}" width="1280" height="720" loading="lazy" decoding="async" alt="Eight key faces. Top row: CPU super 1 with its sparkline at 62.4 °C, then the same key showing MIN 39.9 °C, MAX 63.7 °C and AVG 51.3 °C, each with a small badge. Bottom row: CPU super 1 over GPU 1 at 62.4 and 54.8 °C, then MIN 39.9 and 36.2, MAX 63.7 and 57.3, and AVG 51.3 and 46.1, one shared badge on each divider">
      </a>
      <figcaption>Production-rendered sample data with sample session statistics, drawn with <strong>Accent colors</strong> set to <strong>Theme accent everywhere</strong>.</figcaption>
    </figure>
  </div>
  <div class="gallery-controls" hidden>
    <p class="gallery-position" data-gallery-position aria-live="polite" aria-atomic="true"></p>
    <div class="gallery-actions">
      <button type="button" data-gallery-previous aria-label="Previous image" title="Previous image"><span aria-hidden="true">‹</span></button>
      <button type="button" data-gallery-expand aria-label="Expand image" title="Expand image"><span aria-hidden="true">⤢</span></button>
      <button type="button" data-gallery-next aria-label="Next image" title="Next image"><span aria-hidden="true">›</span></button>
    </div>
  </div>
</section>

<section class="home-deck" aria-labelledby="what-goes-on-the-deck">
  <h2 id="what-goes-on-the-deck">What goes on the deck</h2>
  <ul class="deck-grid">
    <li class="deck-card">
      <figure>
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/key-layouts.png' | relative_url }}" aria-label="Enlarge image: Eight key faces: one reading with a sparkline, two stacked readings, three rows, a four-cell grid with small labels, a CPU usage bar and ring with amber and red zones, and Memory active and Network receive keys with sparklines" data-image-caption="Production-rendered sample data: Mac catalog readings, some with custom labels such as CPU super 1 and Network RX, and illustrative values. Rendered with Accent colors set to Theme accent everywhere, so every graph uses the Void accent instead of the default type accents."><img src="{{ '/assets/img/key-layouts.png' | relative_url }}" width="1280" height="720" loading="lazy" decoding="async" alt="Eight key faces: one reading with a sparkline, two stacked readings, three rows, a four-cell grid with small labels, a CPU usage bar and ring with amber and red zones, and Memory active and Network receive keys with sparklines"></a>
        <figcaption>Production-rendered sample data.</figcaption>
      </figure>
      <h3><a href="{{ '/sensor-reading.html' | relative_url }}">Sensor Reading <span aria-hidden="true">→</span></a></h3>
      <p>One to four readings on a key. A single reading can have a sparkline, bar or ring under it. A press cycles current, min, max and average. Themes, warning and critical colors.</p>
      <p class="deck-where"><strong>Where it goes:</strong> A display key on a deck with keys (<a href="{{ '/hardware.html#stream-deck-models' | relative_url }}">Stream Deck models</a>); physical key checks are pending</p>
    </li>
    <li class="deck-card">
      <figure>
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/dials.png' | relative_url }}" aria-label="Enlarge image: Three Sensor Dial faces: CPU super 1 at 62.4 °C in the one-reading view with its session low 39.9, high 63.7 and a range bar with amber and red zones at the right; the two-row view with CPU super 1 and GPU 1 and their trend lines; and the three-row view with CPU SUPER 1, GPU 1 and FAN 1 under a session line." data-image-caption="Production-rendered sample data with Mac catalog readings under custom labels and illustrative values, drawn with Accent colors set to Theme accent everywhere. The minimum, maximum and session tag are local session statistics."><img src="{{ '/assets/img/dials.png' | relative_url }}" width="1280" height="720" loading="lazy" decoding="async" alt="Three Sensor Dial faces: CPU super 1 at 62.4 °C in the one-reading view with its session low 39.9, high 63.7 and a range bar with amber and red zones at the right; the two-row view with CPU super 1 and GPU 1 and their trend lines; and the three-row view with CPU SUPER 1, GPU 1 and FAN 1 under a session line."></a>
        <figcaption>Production-rendered sample data.</figcaption>
      </figure>
      <h3><a href="{{ '/sensor-dial.html' | relative_url }}">Sensor Dial <span aria-hidden="true">→</span></a></h3>
      <p>One reading, two rows or three rows on the touch strip. Turn through a reading set; local session min, max and average.</p>
      <p class="deck-where"><strong>Where it goes:</strong> A dial on a Stream Deck + or + XL</p>
    </li>
    <li class="deck-card">
      <figure>
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/details.png' | relative_url }}" aria-label="Enlarge image: A 15-key Stream Deck detail page in five columns and three rows: a Back tile with CPU super 1 at 62.4 °C and a small return arrow at top left, a title tile reading Custom set over 1-7 / 7, dimmed Previous and Next chevrons down the left column, reading tiles without trend lines for GPU 1, Fan 1, System Total, CPU usage, Memory active, Network receive and Startup volume available, and four empty cells" data-image-caption="Production-rendered sample data on the bundled 15-key detail layout, with a custom list and a blank title tile text, so the title reads Custom set. Long catalog labels are shortened the way the tile draws them."><img src="{{ '/assets/img/details.png' | relative_url }}" width="1280" height="720" loading="lazy" decoding="async" alt="A 15-key Stream Deck detail page in five columns and three rows: a Back tile with CPU super 1 at 62.4 °C and a small return arrow at top left, a title tile reading Custom set over 1-7 / 7, dimmed Previous and Next chevrons down the left column, reading tiles without trend lines for GPU 1, Fan 1, System Total, CPU usage, Memory active, Network receive and Startup volume available, and four empty cells"></a>
        <figcaption>Production-rendered sample data.</figcaption>
      </figure>
      <h3><a href="{{ '/sensor-details.html' | relative_url }}">Sensor details <span aria-hidden="true">→</span></a></h3>
      <p>A <strong>Press</strong> choice on Sensor Reading: a page of tiles for the reading’s group or your own list, with a Back tile</p>
      <p class="deck-where"><strong>Where it goes:</strong> Decks with a bundled detail view (<a href="{{ '/hardware.html#sensor-details-support' | relative_url }}">Sensor details support</a>)</p>
    </li>
    <li class="deck-card">
      <figure>
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/settings-control.png' | relative_url }}" aria-label="Enlarge image: The Sensor Control settings panel at its defaults: the header reads Next reading, Sends to every dial; When pressed is on Next reading, Target is empty and shows Every dial, and Advanced is folded" data-image-caption="Settings-panel capture of the staged 1.0.1.0 panel on a simulated host with sample readings and Accent colors set to Theme accent everywhere. It is not the Stream Deck app’s own window."><img src="{{ '/assets/img/settings-control.png' | relative_url }}" width="756" height="790" loading="lazy" decoding="async" alt="The Sensor Control settings panel at its defaults: the header reads Next reading, Sends to every dial; When pressed is on Next reading, Target is empty and shows Every dial, and Advanced is folded"></a>
        <figcaption>Settings-panel capture.</figcaption>
      </figure>
      <h3><a href="{{ '/dial-controls.html#the-sensor-control-key-action' | relative_url }}">Sensor Control <span aria-hidden="true">→</span></a></h3>
      <p>Steers Sensor Dials: next or previous reading, pause, pin, reset statistics</p>
      <p class="deck-where"><strong>Where it goes:</strong> Any key, pedal or Multi Action step</p>
    </li>
  </ul>
  <p>Which readings appear depends on the Mac and its macOS version. The measured M5 Pro reports 52: 14 from system counters and 38 from the SMC (<a href="{{ '/hardware.html#readings-measured-on-the-m5-pro' | relative_url }}">Readings measured on the M5 Pro</a>). CPU and GPU clock speeds and GPU usage are not offered.</p>
</section>

## What it does not do

Mac Sensors reads. It has no fan control and cannot write a sensor register. It installs no privileged helper, daemon or kernel extension and needs no administrator password. It makes no internet requests and sends no telemetry. You choose when to copy and share a support report. [Privacy](faq.html#privacy) has the details.

## Mac Sensors 1.0.1.0

1.0.0.0 was the first release. 1.0.1.0 ships the same native readers, byte for byte. The [changelog](changelog.html) lists every change.

### What changed in 1.0.1

| Change | What you see | What you need to do |
| --- | --- | --- |
| Key statistics | A Sensor Reading key shows MIN, MAX and AVG instead of N/A, on a press or with **Value shown** on **Minimum**, **Maximum** or **Average**. Mac Sensors keeps them from its reads since the plugin last started reading sensors. Detail tiles show the same numbers. They start over after a gap in that reading. Sensor Dials keep their own session statistics as before. | Nothing. A key already set to a statistic shows numbers from its next read. |
| Page changes keep reading | Changing pages, opening sensor details or pressing Back keeps reading going: key MIN, MAX and AVG, sparklines, CPU usage and the rates carry on, and keys do not show **Reading sensors**. Reading stops 2 seconds after the last Sensor Reading key, Sensor Dial or detail tile leaves the deck. See [When reading starts and stops](data-sources.html#when-reading-starts-and-stops). | Nothing. |
| One redraw per read | A key or dial that shows both system and SMC readings changes once per read instead of twice in quick succession, when both sources answer within 100 ms of each other. | Nothing. |
| **Read every** help | The setting under **Advanced**, **Connection** explains that one shared read updates every reading key and dial, that changing it clears sparkline history, and that shorter intervals use more processor time. | Nothing. |
| **Read every** limits | A blank value means the 1 second default. A stored value above 5 seconds runs as 5 seconds, so readings no longer expire between reads. | Nothing. Pick another interval from the list if you want one. |
| Counter readings sooner | CPU usage and transfer rates appear about a quarter second after reading starts, instead of one full read interval later. Reading starts when the first key, dial or detail tile appears, or a page returns after none was shown for 2 seconds. | Nothing. |
| No old values as live | When every reading lapses or fails before the first SMC read completes, keys and dials show **Reading sensors** instead of keeping old values as live. | Nothing. |
| Missing saved reading | A key whose saved reading this Mac does not report says **Sensor missing** and **pick again**. | Pick another reading under **Reading**, or wait until this Mac reports it again. |
| Intel support reports | When macOS has no translation flag, as on an Intel Mac, the support report's `translation` field now says `native` instead of `unknown`. Physical Intel validation is in progress. | Nothing. |
| Panel wording | Status text in the settings panel no longer names the plugin as the source of sensor data. The Text font line uses the same spacing as other fields. | Nothing. |
| Processor time | PERF.md compares an earlier 1.0.1 candidate, built before key statistics and the 2 second hold, with a rebuild of 1.0.0, each run as a development copy in the Stream Deck app 7.5.0 on the M5 Pro with 32 single-reading keys. The candidate used 0.668% of one core at 1 second against 0.855% for 1.0.0, and 2.478% against 3.164% at 250 ms. The published 1.0.1.0 used 0.704% at 1 second over a 24-hour observation. [Performance and resource use](faq.html#performance-and-resource-use) has the limits. | Nothing. |

### What is still pending

| Item | Status |
| --- | --- |
| Elgato Marketplace | Mac Sensors is not on the Elgato Marketplace yet. |
| Physical Stream Deck keys | Pending: readability at arm's length, alert colors, and the detail view and Back on a physical deck |
| Stream Deck + dials | Pending: turn, push, touch and long touch on a real deck |
| Intel | Physical Intel validation is in progress; [Hardware compatibility](hardware.html) has the hosted evidence. |
| App restart, sleep and wake | Pending: not yet observed with a real app restart or a real sleep |
| Hardware photograph | Pending. The images on these pages are production-rendered sample data or settings-panel captures. |

Unit tests, a mock Stream Deck host and a 24-hour observation on the measured Mac cover software behavior. They do not cover physical readability, dial gestures or Intel hardware behavior. [Hardware compatibility](hardware.html) lists what ran on which Mac and deck.

## License and trademarks

Free and MIT licensed. Not affiliated with Apple or Elgato. Mac and macOS are trademarks of Apple Inc. Stream Deck is a trademark of Corsair Memory, Inc.

<section class="home-paths" aria-labelledby="find-what-you-need">
  <h2 id="find-what-you-need">Find what you need</h2>
  <ul>
    <li><a href="{{ '/installation.html' | relative_url }}">Installation and requirements <span aria-hidden="true">→</span></a><span>Install, check, update and remove the package.</span></li>
    <li><a href="{{ '/getting-started.html' | relative_url }}">Getting started <span aria-hidden="true">→</span></a><span>Your first reading in five steps.</span></li>
    <li><a href="{{ '/themes.html' | relative_url }}">Themes and colors <span aria-hidden="true">→</span></a><span>Pick one of seven themes and set reading colors.</span></li>
    <li><a href="{{ '/thresholds.html' | relative_url }}">Thresholds and alerts <span aria-hidden="true">→</span></a><span>Warning and critical colors.</span></li>
    <li><a href="{{ '/status-screens.html' | relative_url }}">Status screens <span aria-hidden="true">→</span></a><span>What each two-line message means.</span></li>
    <li><a href="{{ '/data-sources.html' | relative_url }}">Data sources <span aria-hidden="true">→</span></a><span>What each reading family means and when a value counts as fresh.</span></li>
    <li><a href="{{ '/troubleshooting.html' | relative_url }}">Troubleshooting <span aria-hidden="true">→</span></a><span>Find the exact message and the next step.</span></li>
    <li><a href="{{ '/faq.html' | relative_url }}">FAQ and privacy <span aria-hidden="true">→</span></a><span>Requirements, statistics, performance and privacy.</span></li>
    <li><a href="{{ site.bug_reports }}">Report a bug <span aria-hidden="true">↗</span></a><span>Name Mac Sensors and its version.</span></li>
  </ul>
</section>
