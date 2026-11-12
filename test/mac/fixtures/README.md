# Core sync fixture

This bundle contains three tiny synthetic commits for import and review-state tests. It contains no upstream history. Tests read it without creating commits, so CI does not invent an author identity. The fixture commits were created using the development machine's inherited human Git identity.

# Mac17,9 readings in 1.0.2

`mac17-9-readings-1.0.2.json` lists the 89 readings `npm run probe` returned on the measured Mac17,9 (Apple M5 Pro, macOS 27.0.1) with the 1.0.2 names: each identity, label and picker group. `test/mac/reading-names.test.ts` checks that every one of those identities is still produced, so a key saved in 1.0.2 keeps its reading when a name or group changes.
