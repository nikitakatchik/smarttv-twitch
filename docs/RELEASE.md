# Release Automation

Maintainers cut releases from GitHub Actions:

1. Open **Actions** -> **release** -> **Run workflow**.
2. Enter `release_tag`, for example `4.0.0`.
3. Enter the full 40-character `commit_sha` to ship.
4. Run the workflow.

The workflow validates the inputs, checks out that exact commit, runs the shared
CI workflow, builds the release host installers, and only then publishes the tag
and GitHub Release.

Release assets come from the existing build scripts:

Build all release assets locally without publishing:

```sh
npm run release
```

The assets are written to `dist/release/`.

`npm run build` and the `build:*` targets only assemble runnable platform trees
under `dist/<platform>/`; they do not create the release zips or `.wgt`.
Publishing is explicit:

```sh
npm run release:publish -- --dry-run
npm run release:publish -- --live
```

- `Twellie.wgt`
- `twellie-orsay-host-macos-arm64.zip`
- `twellie-orsay-host-macos-x64.zip`
- `twellie-orsay-host-windows-x64.zip`
- `twellie-orsay-host-windows-x86.zip`
- `twellie-tizenbrew.zip` (TizenBrew module archive)
- `twellie-orsay.zip` (raw App-Sync widget; advanced, not the normal installer)

If a workflow rerun finds the tag already exists, it must point at the same
commit SHA. The release step then updates the GitHub Release assets in place.
