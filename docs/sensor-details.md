---
layout: default
title: Sensor details
nav_order: 5
description: "Press a Sensor Reading key to open related readings on a detail page. The key you pressed stays live on the page as a Back tile."
---

Press a Sensor Reading key to open related readings on a detail page. The key you pressed stays live on the page as a Back tile.

**Set it up:** open the key's **Press** section, choose **Opens sensor details** under **A press**, then choose a **Details list**. The first time details open on each kind of deck, Stream Deck asks to install the bundled detail view.

Opening details, installing the detail profile and pressing Back have not yet been checked on a physical Stream Deck. What this page describes is what the code implements and its tests check. See [Sensor details support](hardware.html#sensor-details-support).

## What it is (and is not)

The detail view is a **plugin-managed profile**, not a Stream Deck folder. A plugin cannot place keys inside your folders or profiles, so Mac Sensors ships one editable, one-page profile per supported deck type, named **Mac Sensors Details** in the app's profile list, and switches to it when you press the opener. Pressing Back asks the Stream Deck app to return to the profile you came from.

- The first time you open details on a deck type, the Stream Deck app asks to install that deck's detail profile. Accept once; later entries switch without asking. If the install is declined, or not accepted within 30 seconds, that entry lapses and the next press tries again. If you accept later, up to 10 minutes after the entry lapsed, the plugin switches the deck back to the profile you came from. Press the opener again to open details.
- The page is a normal, editable profile, but it ships with every cell filled: the Back tile, the title, the pagers and the reading tiles. Adding a key of your own means replacing one of those. The plugin never repairs or overwrites what you change. The shipped page holds no sensor choice of yours: every tile asks the plugin what to show while it is open.
- What you change on that page is shared. There is one detail page per deck type, so a key you add or a tile you replace appears on every detail page you open on that deck, whichever key you pressed. What still follows the key you pressed is the live content: the reading tiles, the title, the page range and, until you pick a reading for it, the Back tile's face.
- The plugin has no reset for the page, because a plugin cannot edit a profile you already have installed. Whether removing the **Mac Sensors Details** profile in the Stream Deck app brings the install prompt back on the next detail entry has not been checked.
- If you want a page you lay out yourself, with your own multi-reading keys on it, use a Stream Deck folder instead. That is the app's own feature, and unlike the detail page it belongs to one key. A folder's opener key shows a static icon; a detail opener shows a live reading.
- The Stream Deck app never updates a profile that is already installed. When a plugin update changes the page itself, the change ships as a new profile revision with a new internal identity, the next detail entry asks once to install it, and the copy you already have stays in your profile list untouched.
- Back asks the app for its previous profile; the plugin stores no profile history of its own, so where Back lands after a Stream Deck app restart is unknown.
- Opening details and pressing Back do not restart reading. MIN, MAX and AVG, sparklines, CPU usage and the rates carry on, and keys show readings at once ([When reading starts and stops](data-sources.html#when-reading-starts-and-stops)).

## Turning it on

Open **Press** in the Sensor Reading settings ([Pressing the key](sensor-reading.html#pressing-the-key) covers the other choices):

![The Press section of the Sensor Reading settings with A press on Opens sensor details, Readings per tile on One, an empty Title tile text, Also go back from this key's own position ticked, and Details list on Every reading from this reading's sensor](assets/img/settings-press-details.png)

*Settings-panel capture of the staged 1.0.1.0 panel on a simulated host with sample readings and **Accent colors** set to **Theme accent everywhere**. It is not the Stream Deck app's own window.*

| Setting | Choose |
| --- | --- |
| **A press** | **Opens sensor details** (acts as the key goes down), or **Tap cycles; hold opens details** (a tap cycles the statistic when you let go; holding half a second opens details once). **Cycles current, min, max, avg** remains the default. |
| **Readings per tile** | **One** (default), **Two, stacked**, **Three, rows** or **Four, quad grid**. A page's last tile uses however many readings remain. Pressing a tile cycles all its readings together. |
| **Title tile text** | A name for the page. Leave it blank for the sensor group name, the filter pattern, or **Custom set**. |
| **Also go back from this key's own position** | Keeps a second Back tile at the opener's position. On by default. |
| **Details list** | **Every reading from this reading's sensor** (default), **A custom list**, or **Readings matching a filter**. See [Choosing the list](#choosing-the-list). |

A custom list can mix tile sizes, labels and colors; see [Editing custom tiles](#editing-custom-tiles). Sensor and filter lists follow what this Mac reports and cannot hold fixed tile groups.

Keys without a saved **A press** choice keep cycling current, MIN, MAX and AVG, from the statistics Mac Sensors keeps for each reading ([how they are calculated](faq.html#how-are-min-max-and-avg-calculated-on-a-key)).

### Choosing the list

**Every reading from this reading's sensor** lists the other readings in the opener's sensor group (CPU, GPU, Memory, Storage, Network, Battery, Fans or System), in the order the reading picker lists them. The opener's own reading appears on Back and is left out of the list and its count. The list follows what this Mac reports: readings that appear or disappear change it while the page is open.

**A custom list** uses the readings and the order you choose, with individual tile sizes, labels and colors. Add readings with the **Add readings** search under **Details list**: *Tick readings to add or remove them.* A listed reading that is the opener's own reading is not given a tile, because the Back tile shows it; the editor marks it **(Back tile)**. A listed reading this Mac does not report right now keeps its place, and its tile shows **Sensor missing**. The list holds up to 128 readings.

**Readings matching a filter** matches the sensor group name and the reading label together, across every group. Matches update with each read. The panel shows a live count, such as *Matches 12 readings right now.*, and the pattern becomes the page title unless you set **Title tile text**. See [Filter patterns](#filter-patterns).

### Editing custom tiles

The custom-list editor shows the list as the tiles the page will draw:

- Click a tile's size to cycle it through 1, 2, 3 and 4 cells. Click a cell's name to set its label on the tile; an empty label keeps the reading's own name. On a full four-reading tile each cell has a color well for its identity color, and the **Abc** button switches to color-coded bare values (it then reads **123**) and back.
- Readings without a tile of your own follow **Readings per tile**. Resizing or shrinking such a tile saves it as a tile of your own.
- The up and down arrows on a reading move it through the list; the drag handle on a tile moves the whole tile, and arrow keys move it too. Dragging a reading into another tile shrinks the tile it left and grows the one it lands in, at the spot marked by the blue caret. A full four-reading tile cannot take another cell; the reading becomes its own tile beside it.
- Labels and colors move with the reading. Other readings keep theirs. If two readings end up with the same color, change one with its color well.
- Removing a reading shrinks its tile; the next tile's readings do not move up to fill it. Press a tile's **+** to send the next readings you tick into that tile, up to four cells; the **+** after the last tile starts a new one.

The note under the editor counts what the page lists, for example *7 readings across 3 tiles. Grouping is positional: readings flow through the tile sizes in list order, and readings past your groups follow Readings per tile.*

## The detail page

![A 15-key Stream Deck detail page in five columns and three rows: a Back tile with CPU super 1 at 62.4 °C and a small return arrow at top left, a title tile reading Custom set over 1-7 / 7, dimmed Previous and Next chevrons down the left column, reading tiles without trend lines for GPU 1, Fan 1, System Total, CPU usage, Memory active, Network receive and Startup volume available, and four empty cells](assets/img/details.png)

*Production-rendered sample data on the bundled 15-key detail layout, with a custom list and a blank title tile text, so the title reads Custom set. Long catalog labels are shortened the way the tile draws them.*

Every detail page has these controls:

- **Back** (always top left, where a folder's back key sits): a real Sensor Reading key whose press is fixed to leaving the view; a small return arrow in the tile's lower-left corner marks it. Fresh from the install it shows the reading you opened the page from, live, with that key's theme, text color, units, decimals and thresholds. It stays pressable while sensor data is unavailable, while the reading is missing, and right after a plugin restart.
- **A second Back under your finger**, on by default. When the opener key's cell falls on a reading cell of the page, that cell becomes a second Back tile showing the same opener face with the return arrow, so you can go back without moving your hand. The readings flow around it; none are hidden, and it costs one tile per page. Untick **Also go back from this key's own position** on the opener to keep only the top-left Back.
- **Title** (every deck except the Mini): the sensor group name, the filter pattern, **Custom set** or your **Title tile text**, over the visible range, such as `CPU` over `1-11 / 18` (a CPU opener on the measured M5 Pro, on a 15-key deck with the second Back off). The range counts readings, not tiles. Pressing the title does nothing.
- **Previous** and **Next**: page through long lists. A chevron dims at either end; paging does not wrap. Paging happens inside the one profile page; nothing stacks.
- **Reading tiles**: live readings in the opener's theme. At one reading per tile, each tile carries its own reading's type accent; a denser tile carries its first reading's accent. Pressing a tile cycles current, MIN, MAX and AVG for everything on it, for this visit; leaving the view resets that. On MIN, MAX or AVG a tile shows each reading's statistics since the plugin last started reading sensors, the same numbers a Sensor Reading key shows for that reading. Reading tiles do not take the opener's thresholds, because a temperature limit means nothing on a power or fan tile. The Back tile keeps its own.
- **No trend lines on reading tiles.** A trend line needs history that fills over many reads, and a detail page shows many readings (up to 128 on a + XL at four per tile) that change with every page turn and filter. The opener key keeps its own graph on your page.

If sensor data becomes unavailable while the page is open, the tiles show the same status screens as ordinary keys ([Status screens](status-screens.html)) and recover on their own; Back keeps working throughout. If a listed reading disappears from a custom list, its tile shows **Sensor missing** in place, and the other tiles do not shift.

## Configuring the Back tile

The Back tile is an ordinary Sensor Reading key with one fixed job. Select it in the Stream Deck app and its settings panel opens with everything a normal key has: the **Reading** picker, **Label on the key**, **Readings on this key** (one to four readings), the theme strip, **Text color**, **Value shown**, **Decimals**, **°F**, **Graph under the value**, and **Warn at** and **Critical at**. Its header reads *Back tile · sensor detail view*. Two things differ, and the panel says both:

- Pressing it always returns to the previous profile. A note under the header says so: *This is the Back tile of the sensor detail view. Set its reading, layout and look like any key; pressing it always returns to the profile you came from, so press settings do not apply here.* The **Press** section holds only a note in place of **A press**; press settings stored on the tile are kept, unused. The return arrow stays visible on every layout.
- Until you pick a reading, the tile shows the reading you opened the page from, so a fresh page needs no setup. Once you pick one, the tile shows your pick, and a missing pick shows **Sensor missing** like any key would.

Copying the Back tile elsewhere copies its fixed role too: a pasted copy still returns to the previous profile when pressed. For an ordinary key, add a new Sensor Reading from the actions list instead.

The other cells (title, pagers and reading tiles) are **Sensor Detail Slot** actions, which do not appear in the actions list. Selecting one opens a panel that says the tile belongs to the plugin-managed sensor detail view and has no settings of its own. A tile whose role this version does not know, for example from a detail profile made by another version, says **Unrecognized detail tile**; it shows an empty face and does nothing when pressed. To change what the view lists, its title or its look, go back and select the Sensor Reading key that opened it.

## Filter patterns

The filter is a glob, not a regular expression: `*` spans anything, `?` matches exactly one character, everything else is literal, and case never matters. Every reading is tested against one text: the sensor group name, a single space, then the reading label. For the first fan that text is `Fans Fan 1`; for a memory reading it is `Memory Memory free`. That is why one pattern can select a whole group or a kind of reading across groups, and why an anchored pattern must allow for the group name at the front. Three rules cover it:

1. **Plain text matches anywhere.** A pattern with no wildcard behaves as if wrapped in `*...*`, so `fan` and `*fan*` are the same filter.
2. **One wildcard anchors the whole pattern.** As soon as a pattern contains `*` or `?`, the automatic wrapping is off and the pattern must cover the entire text. `core*` matches nothing, because the text starts with the group name, not with "core"; `*core*` is the form you want.
3. **Spaces are literal.** Multi-word plain text works only when the words sit next to each other: `fan 1` finds `Fans Fan 1`, but `cpu core` finds nothing because the core readings are named like `CPU super core 1`. Span the gap with a star: `*cpu*core*`.

Examples, by these rules:

| Pattern | What it gathers |
| --- | --- |
| `fans` | every reading in the Fans group |
| `memory` | every reading in the Memory group, plus any reading whose label contains Memory |
| `storage*` | every reading in the Storage group (the text starts with Storage) |
| `network` | the Network readings, such as Network receive and Network send |
| `*total*` | every reading whose group or label contains total, such as Memory total |
| `*core*` | per-core CPU temperatures, on a Mac whose catalog lists them |
| `?PU*` | readings in groups whose name is one character plus PU: CPU and GPU (anchored start) |
| `*` | every reading, paged |

The **Filter** field's sample text, `*4090*`, and the help's example, `*gpu*fan*`, match no Mac reading. Start from a pattern in the table above.

Which readings exist depends on the Mac model and macOS version, so a pattern's matches differ from one Mac to another; the panel's count shows what this Mac reports now. See [Data sources](data-sources.html).

An empty pattern refuses entry with the Stream Deck alert triangle, and the panel says *Type a pattern; the view refuses to open while it is empty.* A pattern that matches nothing opens an empty view reading `0 / 0`, and the panel warns *Matches nothing right now; the view would open empty (0 / 0).* Leading and trailing spaces are trimmed, and everything past 128 characters is cut. The panel's live count reflects all of this before you press.

## When a press does not open the page

A press that cannot open details keeps the key as it was, with no statistic cycled in its place, and shows the Stream Deck alert triangle:

- The deck has no bundled detail profile (see [Supported decks](#supported-decks)).
- The list cannot be built yet: **Every reading from this reading's sensor** and **Readings matching a filter** need sensor data, and the sensor list also needs the opener's own reading. A custom list opens even while sensor data is unavailable, as long as the key has a reading selected.
- The filter pattern is empty.
- The key has no **Reading** selected. Every **Details list** needs the key's own reading, because it goes on the Back tile.
- The detail page is already open on that deck, or the switch to it was sent moments ago.

For the log line and the first-press install prompt, see [Detail view problems](troubleshooting.html#detail-view-problems).

## Supported decks

One bundled profile per deck type. The layouts are generated from one table and checked by tests; reading tiles fill left to right, top to bottom around the navigation tiles.

| Deck | Grid | Reading tiles per page |
| --- | --- | --- |
| Stream Deck Mini | 3 by 2 | 3 (no title tile) |
| Stream Deck (15 keys) | 5 by 3 | 11 |
| Stream Deck Neo | 4 by 2 keys | 4 |
| Stream Deck + | 4 by 2 keys | 4 (the page puts no actions on the dials) |
| Stream Deck XL | 8 by 4 | 28 |
| Stream Deck + XL | 9 by 4 keys | 32 (the page puts no actions on the dials) |
| Virtual Stream Deck | your size | by fit (see below) |

**Readings per tile** multiplies those counts without changing the page: the tiles stay where they are and each carries up to four readings, so a + XL page lists up to 128 readings at once, and paging steps by readings, not tiles. The second Back, on by default, costs one tile per page.

The Virtual Stream Deck's grid is the size you gave it, so it borrows a layout instead of owning one: entry picks the layout with the most reading tiles that fits its grid. A 10 by 10 virtual deck runs the + XL layout (32 tiles per page; the page holds no dials), an 8 by 4 one the XL layout, a 5 by 3 one the 15-key layout, down to the Mini layout at 3 by 2. Below 3 by 2 there is no room for Back and the pagers, and entry refuses with the Stream Deck alert triangle.

Stream Deck Mobile, Stream Deck Studio, Galleon 100 SD, Corsair Voyager, Stream Deck Pedal and G-keys have no bundled detail profile. A press set to open details shows the Stream Deck alert triangle instead of switching, and the **Press** section says *Sensor details are not available on this deck*, followed by the device in parentheses (Studio and Galleon 100 SD appear as an unknown device type). Everything else on the key keeps working. This does not establish support for the other actions on those devices; see [Hardware compatibility](hardware.html). A pedal or G-key can carry a [Sensor Control](dial-controls.html#the-sensor-control-key-action) key instead; those devices have not been checked on hardware.

## Privacy

Detail pages add no telemetry and no internet requests. The bundled profiles are static layout files that carry no sensor selection; your reading choices stay in the key's own settings, which the Stream Deck app already saves and exports with your profiles.

## Where to go next

- [Sensor Reading](sensor-reading.html) for the opener key and the Back tile's own settings.
- [Detail view problems](troubleshooting.html#detail-view-problems) if a press does not open the page.
- [Sensor details support](hardware.html#sensor-details-support) for what has been checked on which decks.
