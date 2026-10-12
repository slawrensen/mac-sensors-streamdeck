# Mac Sensors

Read-only hardware access. Never write an SMC key or control a fan. No root, privileged helper, daemon or kernel extension. No self-hosted CI runners.

Use the Git identity inherited from the user's global configuration. On the development Mac, both author and committer must resolve to slawrensen <19673454+slawrensen@users.noreply.github.com> before committing. Never override either with an agent identity. Never rewrite pushed history or force-push.

Settings are append-only and salvage-parsed. Opening a panel writes nothing; one edit sends one settings frame. Saved keys identify measurements, never list positions. Opening a provider is not a measurement. Failed, expired and closed-generation values cannot appear live. Each reading owns its acquisition evidence and local history.

Use plain words. No em dashes in newly authored output. Render and inspect user-facing changes. Never claim hardware, CI, packaging or release success from a different kind of test.

## Shared core

The copied core comes from slawrensen/hwinfo-streamdeck at the commit in core-sync.json. Read that reference only. Never commit, branch, tag, open a pull request on, or push to it. The Mac project imports files, never upstream history.

Use `npm run core:sync -- --upstream <read-only checkout> <commit>`. The sync reconstructs bytes from the pin, ordered rewrites and recorded patches. It preserves unrecorded edits and journals promotion for recovery. `npm run core:check` validates copied bytes, dependency pins and the copied-test inventory. `--release` also rejects unresolved port reviews. A changed port retains its reviewed-through hash until its disposition and evidence are recorded.

Every edit to a copied file needs `npm run core:patch -- --file <path> --seam <S1-S8> --reason <reason>`. Do not regenerate golden fixtures to make a change pass. The default test configuration uses upstream seam values; the production build and Mac tests use the checked platform-map.json substitutions.

Private files stay ignored. Never force-add them or put them in release assets. Stop only processes this task started, by their verified PID. Preserve user profiles and other plugins; back up before changing Stream Deck.
