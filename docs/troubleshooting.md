---
layout: default
title: Troubleshooting
nav_order: 14
---

# Troubleshooting

Start with the panel's status message. **Check again** requests a new check while the action is visible. A missing selected reading stays saved, so a temporary absence does not rewrite the profile.

For **Bridge failed**, reinstall the package from the release page. The reader validates the selected native file's bytes, architecture and protocol before loading it. A load failure alone does not identify a signing or permission cause.

For **Tahoma needed**, install or download Tahoma Bold through Font Book and choose Check again. Do not remove system fonts to test recovery.

If a detail key does not switch profiles, confirm the matching managed profile is installed. Development links need a separate profile installation. Keep a profile backup before reinstalling or replacing development files.

## Copy a support report

Open **Advanced**, then **Support**, and choose **Copy support report**. Include the exact status, what action you were using, app/macOS versions and whether the package came from GitHub or the Marketplace. Review the report before posting it.

Report bugs through [GitHub Issues](https://github.com/slawrensen/mac-sensors-streamdeck/issues). Report security issues privately using the repository's security reporting route rather than a public issue.

Do not overwrite a loaded native addon. Stop the specific development instance, replace files by copy and rename, then restart that plugin and verify its hashes. Developer instrumentation uses the `MACSENSORS_` prefix; normal use needs no environment settings.
