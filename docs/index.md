---
layout: default
title: Overview
nav_order: 1
description: Temperatures, fan speeds, power, CPU usage, memory, storage and network rates from your Mac, on your Stream Deck. Mac Sensors only reads.
---

<header class="home-intro">
  <h1 id="mac-sensors-for-stream-deck">Mac Sensors <span>for Stream Deck</span></h1>
  <p class="home-lead">Temperatures, fan speeds, power, CPU usage, memory, storage and network rates from your Mac, on your Stream Deck keys and dials. Mac Sensors only reads; it changes no settings and controls no fans.</p>
  <div class="home-actions">
    <a class="button button-primary" href="{{ '/getting-started.html' | relative_url }}">Get started <span aria-hidden="true">→</span></a>
    <a class="button button-secondary" href="{{ '/installation.html' | relative_url }}">Install <span aria-hidden="true">→</span></a>
  </div>
  <p class="home-requirements"><strong>macOS 13.5 or later</strong> · Stream Deck app 7.1 or later and its Node 24 runtime · Tahoma Bold, which ships with macOS. No separate sensor app. <a href="{{ '/installation.html' | relative_url }}">Requirements and installation</a></p>
  <p class="home-release">{% if site.plugin_release.marketplace_version == site.plugin_release.package_version %}Version {{ site.plugin_release.package_version }} is on the <a href="{{ site.plugin_release.marketplace }}">Elgato Marketplace</a> and <a href="https://github.com/slawrensen/mac-sensors-streamdeck/releases/latest">GitHub releases</a>.{% else %}Version {{ site.plugin_release.package_version }} is on <a href="https://github.com/slawrensen/mac-sensors-streamdeck/releases/latest">GitHub releases</a>. The <a href="{{ site.plugin_release.marketplace }}">Elgato Marketplace</a> listing offers {{ site.plugin_release.marketplace_version }}.{% endif %}</p>
</header>

<section class="hero-gallery" data-gallery aria-label="Production-rendered boards">
  <div class="gallery-slides">
    <figure data-gallery-slide data-gallery-title="Every action">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/readme-hero.png' | relative_url }}" aria-label="Enlarge image: Board of Mac Sensors keys and dials: one temperature key in each of the seven themes, a four-reading key, single keys for temperature, fan, power, CPU, memory, network and free space, two- and three-reading keys, a ring and a bar, warning and critical keys, a Back tile, a detail title tile and four dial views" data-image-caption="Production-rendered sample data with custom labels, drawn with Accent colors on Theme accent everywhere.">
        <img src="{{ '/assets/img/crops/readme-hero.png' | relative_url }}" width="1504" height="791" fetchpriority="high" alt="Board of Mac Sensors keys and dials: one temperature key in each of the seven themes, a four-reading key, single keys for temperature, fan, power, CPU, memory, network and free space, two- and three-reading keys, a ring and a bar, warning and critical keys, a Back tile, a detail title tile and four dial views">
      </a>
      <figcaption>Production-rendered sample data with custom labels, drawn with <strong>Accent colors</strong> on <strong>Theme accent everywhere</strong>.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Themes">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/themes.png' | relative_url }}" aria-label="Enlarge image: The same CPU super 1 key at 62.4 °C with a sparkline in each of the seven themes: Void, Graphite, Ultraviolet, Midnight, Forest, Ember and Paper" data-image-caption="Production-rendered sample data. With Theme accent everywhere, each sparkline takes its theme’s accent.">
        <img src="{{ '/assets/img/crops/themes.png' | relative_url }}" width="916" height="472" loading="lazy" decoding="async" alt="The same CPU super 1 key at 62.4 °C with a sparkline in each of the seven themes: Void, Graphite, Ultraviolet, Midnight, Forest, Ember and Paper">
      </a>
      <figcaption>Production-rendered sample data. With <strong>Theme accent everywhere</strong>, each sparkline takes its theme’s accent.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Type accents">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/accents.png' | relative_url }}" aria-label="Enlarge image: Eight Sensor Reading keys whose trend lines take their sensor type’s color: CPU super 1 and GPU 1 in rose, Fan 1 in cyan, System Total in gold, CPU activity in violet, Memory active in magenta, Network RX in blue, and Free space in the Void theme’s sky-blue accent" data-image-caption="Production-rendered sample data with Accent colors on By sensor type, the default.">
        <img src="{{ '/assets/img/crops/accents.png' | relative_url }}" width="916" height="472" loading="lazy" decoding="async" alt="Eight Sensor Reading keys whose trend lines take their sensor type’s color: CPU super 1 and GPU 1 in rose, Fan 1 in cyan, System Total in gold, CPU activity in violet, Memory active in magenta, Network RX in blue, and Free space in the Void theme’s sky-blue accent">
      </a>
      <figcaption>Production-rendered sample data with <strong>Accent colors</strong> on <strong>By sensor type</strong>, the default.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Reading colors">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/reading-colors.png' | relative_url }}" aria-label="Enlarge image: Two Sensor Dial overview faces with rows CPU SUPER 1, GPU 1 and FAN 1: uniform white numbers on the left, blue, rose and green numbers on the right, with the same labels, units and layout" data-image-caption="Production-rendered sample data. Only the number colors differ.">
        <img src="{{ '/assets/img/crops/reading-colors.png' | relative_url }}" width="776" height="224" loading="lazy" decoding="async" alt="Two Sensor Dial overview faces with rows CPU SUPER 1, GPU 1 and FAN 1: uniform white numbers on the left, blue, rose and green numbers on the right, with the same labels, units and layout">
      </a>
      <figcaption>Production-rendered sample data. Only the number colors differ.</figcaption>
    </figure>
    <figure data-gallery-slide data-gallery-title="Value shown">
      <a class="image-link" data-image-viewer data-image-group="home-boards" href="{{ '/assets/img/stat-modes.png' | relative_url }}" aria-label="Enlarge image: Eight key faces. Top row: CPU super 1 with its sparkline at 62.4 °C, then the same key showing MIN 39.9 °C, MAX 63.7 °C and AVG 51.3 °C, each with a small badge. Bottom row: CPU super 1 over GPU 1 at 62.4 and 54.8 °C, then MIN 39.9 and 36.2, MAX 63.7 and 57.3, and AVG 51.3 and 46.1, one shared badge on each divider" data-image-caption="Production-rendered sample data with sample session statistics.">
        <img src="{{ '/assets/img/crops/stat-modes.png' | relative_url }}" width="916" height="472" loading="lazy" decoding="async" alt="Eight key faces. Top row: CPU super 1 with its sparkline at 62.4 °C, then the same key showing MIN 39.9 °C, MAX 63.7 °C and AVG 51.3 °C, each with a small badge. Bottom row: CPU super 1 over GPU 1 at 62.4 and 54.8 °C, then MIN 39.9 and 36.2, MAX 63.7 and 57.3, and AVG 51.3 and 46.1, one shared badge on each divider">
      </a>
      <figcaption>Production-rendered sample data with sample session statistics.</figcaption>
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
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/key-layouts.png' | relative_url }}" aria-label="Enlarge image: Eight key faces: one reading with a sparkline, two stacked readings, three rows, a four-cell grid with small labels, a CPU usage bar and ring with amber and red zones, and Memory active and Network RX keys with sparklines" data-image-caption="Production-rendered sample data: Mac catalog readings, some with custom labels such as CPU super 1 and Network RX, and illustrative values. Rendered with Accent colors set to Theme accent everywhere, so every graph uses the Void accent instead of the default type accents."><img src="{{ '/assets/img/crops/key-layouts-top-row.png' | relative_url }}" width="888" height="216" loading="lazy" decoding="async" alt="Four key faces: CPU super 1 at 62.4 °C with a sparkline, CPU super 1 over GPU 1, three rows for CPU, GPU and Fan, and a four-cell grid labeled CPU, GPU, FAN and CPU"></a>
        <figcaption>Production-rendered sample data.</figcaption>
      </figure>
      <h3><a href="{{ '/sensor-reading.html' | relative_url }}">Sensor Reading <span aria-hidden="true">→</span></a></h3>
      <p>One to four readings on a key, with a sparkline, bar or ring under a single reading. A press cycles current, min, max and average.</p>
      <p class="deck-where"><strong>Where it goes:</strong> Any display key (<a href="{{ '/hardware.html#stream-deck-models' | relative_url }}">Stream Deck models</a>)</p>
    </li>
    <li class="deck-card">
      <figure>
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/dials.png' | relative_url }}" aria-label="Enlarge image: Three Sensor Dial faces: CPU super 1 at 62.4 °C in the one-reading view with its session low 39.9, high 63.7 and a range bar with amber and red zones at the right; the two-row view with CPU super 1 and GPU 1 and their trend lines; and the three-row view with CPU SUPER 1, GPU 1 and FAN 1 under a session line." data-image-caption="Production-rendered sample data with Mac catalog readings under custom labels and illustrative values, drawn with Accent colors set to Theme accent everywhere. The minimum, maximum and session tag are local session statistics."><img src="{{ '/assets/img/crops/dials-two-row.png' | relative_url }}" width="372" height="196" loading="lazy" decoding="async" alt="The two-row Sensor Dial view: CPU super 1 at 62.4 °C and GPU 1 at 54.8 °C, each with a trend line, above the session low 39.9 and high 63.7"></a>
        <figcaption>Production-rendered sample data.</figcaption>
      </figure>
      <h3><a href="{{ '/sensor-dial.html' | relative_url }}">Sensor Dial <span aria-hidden="true">→</span></a></h3>
      <p>One reading, two rows or three rows on the touch strip. Turn the dial to step through a set of readings. Each dial keeps its own local session min, max and average.</p>
      <p class="deck-where"><strong>Where it goes:</strong> A dial on a Stream Deck + or + XL</p>
    </li>
    <li class="deck-card">
      <figure>
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/details.png' | relative_url }}" aria-label="Enlarge image: A 15-key Stream Deck detail page in five columns and three rows: a Back tile with CPU super 1 at 62.4 °C and a small return arrow at top left, a title tile reading Custom set over 1-7 / 7, dimmed Previous and Next chevrons down the left column, reading tiles without trend lines for GPU 1, Fan 1, System Total, CPU usage, Memory active, Network receive and Startup volume available, and four empty cells" data-image-caption="Production-rendered sample data on the bundled 15-key detail layout, with a custom list and a blank title tile text, so the title reads Custom set. Long catalog labels are shortened the way the tile draws them."><img src="{{ '/assets/img/crops/details-top-rows.png' | relative_url }}" width="836" height="332" loading="lazy" decoding="async" alt="The top two rows of a 15-key detail page: a Back tile with CPU super 1 at 62.4 °C, a title tile reading Custom set over 1-7 / 7, a dimmed Previous chevron, and tiles for GPU 1, Fan 1, System Total, CPU usage, Memory active, Network receive and Startup volume available"></a>
        <figcaption>Production-rendered sample data.</figcaption>
      </figure>
      <h3><a href="{{ '/sensor-details.html' | relative_url }}">Sensor details <span aria-hidden="true">→</span></a></h3>
      <p>A <strong>Press</strong> choice on Sensor Reading: a page of tiles for the reading’s group, a filter or your own list, with a Back tile.</p>
      <p class="deck-where"><strong>Where it goes:</strong> Decks with a bundled detail view (<a href="{{ '/hardware.html#sensor-details-support' | relative_url }}">Sensor details support</a>)</p>
    </li>
    <li class="deck-card">
      <figure>
        <a class="image-link deck-image" data-image-viewer href="{{ '/assets/img/settings-control.png' | relative_url }}" aria-label="Enlarge image: The Sensor Control settings panel at its defaults: the header reads Next reading, Sends to every dial; When pressed is on Next reading, Target is empty and shows Every dial, and Advanced is folded" data-image-caption="Settings-panel capture of the 1.0.1.0 panel on a simulated host, not the Stream Deck app’s own window."><img src="{{ '/assets/img/crops/settings-control-header.png' | relative_url }}" width="756" height="300" loading="lazy" decoding="async" alt="The top of the Sensor Control settings panel: the header reads Sensor Control key, Next reading, Sends to every dial, above the action’s description"></a>
        <figcaption>Settings-panel capture.</figcaption>
      </figure>
      <h3><a href="{{ '/dial-controls.html#the-sensor-control-key-action' | relative_url }}">Sensor Control <span aria-hidden="true">→</span></a></h3>
      <p>Steers Sensor Dials: change the reading, show a statistic, pause the auto cycle, pin, or reset statistics.</p>
      <p class="deck-where"><strong>Where it goes:</strong> Any key, pedal or Multi Action step</p>
    </li>
  </ul>
  <p>Which readings appear depends on the Mac and its macOS version. The measured M5 Pro reports 71: 14 from system counters, 51 from the SMC, 3 computed from SMC readings (CPU average, CPU hottest core and Fan average), and battery cycles, battery health and the internal SSD temperature (<a href="{{ '/hardware.html#readings-measured-on-the-m5-pro' | relative_url }}">Readings measured on the M5 Pro</a>). CPU and GPU clock speeds and GPU usage are not offered.</p>
</section>

## What it does not do

Mac Sensors has no fan control and cannot write a sensor register. It installs no privileged helper, daemon or kernel extension and needs no administrator password. It makes no internet requests and sends no telemetry. A support report goes only where you paste it. [Privacy](faq.html#privacy) has the details.

<section class="home-paths" aria-labelledby="find-what-you-need">
  <h2 id="find-what-you-need">Find what you need</h2>
  <ul>
    <li><a href="{{ '/themes.html' | relative_url }}">Compare the seven themes <span aria-hidden="true">→</span></a><span>Pick a theme and set reading colors.</span></li>
    <li><a href="{{ '/troubleshooting.html' | relative_url }}">Fix a status message <span aria-hidden="true">→</span></a><span>Find the exact message and the next step.</span></li>
    <li><a href="{{ '/data-sources.html' | relative_url }}">Understand where readings come from <span aria-hidden="true">→</span></a><span>System counters, SMC readings and freshness.</span></li>
    <li><a href="{{ site.bug_reports }}">Report a bug <span aria-hidden="true">↗</span></a><span>Name Mac Sensors and its version.</span></li>
  </ul>
  {%- comment -%} The release section moved to its own page; its old heading ids stay here so earlier deep links land on the sentence that points there. {%- endcomment %}
  <p class="channel-note"><span id="mac-sensors-1010"></span><span id="what-changed-in-101"></span><span id="what-is-still-pending"></span>Version 1.0.2.0 adds battery and drive health readings, more M5 Pro readings and network rates that carry on past 4 GiB. <a href="{{ '/whats-new-1.0.2.html' | relative_url }}">What changed in 1.0.2</a> has the details.</p>
</section>
