# Marketing assets

The boards use the production Mac renderers with fixed sample values. Readings come from the measured Mac catalog, and boards that show custom labels say so in their footer. They are not physical photographs. Panel images are captures of the staged Mac panel in Chromium with a simulated host. Provenance records source and output hashes. Faces are rasterized through the installed app's measured Qt renderer in Tahoma.

| File | Use | Dimensions |
| --- | --- | --- |
| app-icon-288.png | App icon | 288 by 288 |
| thumbnail.png | Listing thumbnail | 1920 by 960 |
| shot-1-hero.png | Hero | 1920 by 960 |
| shot-6-multi.png | Multiple readings | 1920 by 960 |
| shot-8-drilldown.png | Sensor details | 1920 by 960 |
| shot-4-settings.png | Settings | 1920 by 960 |
| shot-7-dial-views.png | Dial views | 1920 by 960 |
| shot-3-themes.png | Themes | 1920 by 960 |
| shot-5-dials.png | Optional dial board | 1920 by 960 |

The gallery order is hero, multiple readings, details, hardware photo, settings, dial views, themes. Drop themes first if the portal limits the gallery to six. The hardware photo is owner-only and has not been substituted with a render. The demo video is also owner-only.

Rebuild with `npm run docs:assets`, `npm run capture:panels`, then `npm run marketing:shots`. The renderer adapter is a local tool input; no font or Qt framework is distributed. Read every caption in the generated images before publication.

For the hardware photograph, use the fixed warning and critical colors as targets: #E8940D and #CB2114. Keep both patches unclipped, record the white balance and exposure, and measure the captured RGB difference before grading. Preserve the original photograph in the local-only evidence folder; publish a prepared copy without location metadata.
