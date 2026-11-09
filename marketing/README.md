# Marketing assets

Plugin-rendered boards for the README and the Marketplace listing. They use the production Mac renderers with fixed sample values. Readings come from the measured Mac catalog, and boards that show custom labels say so in their footer. They are not photographs. Panel images are captures of the shipped panel in Chromium with a simulated host. `provenance.json` records sources and output hashes. Faces are rasterized through the installed app's measured Qt renderer in Tahoma.

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
| shot-5-dials.png | Dial board | 1920 by 960 |

Elgato asks listings to show its hardware only through its official resources. The live listing therefore shows these faces on Elgato's own device images; those composites are not in this repository.

Rebuild with `npm run docs:assets`, `npm run capture:panels`, then `npm run marketing:shots`. The renderer adapter is a local tool input; no font or Qt framework is distributed. Read every caption in the generated images before publishing them.
