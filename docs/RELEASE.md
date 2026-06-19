# Release Automation

Maintainers cut releases from GitHub Actions:

1. Update the repo version and commit it:
   ```sh
   npm run version:set -- 4.1.0
   ```
2. Open **Actions** -> **release** -> **Run workflow**.
3. Enter the full 40-character `commit_sha` to ship.
4. Run the workflow.

The workflow checks out that exact commit, reads the release tag from
`package.json`, verifies the Tizen manifest has the same version, aborts if that
GitHub Release already exists, runs the shared CI workflow, builds the release
host installers, and only then publishes the tag and GitHub Release.

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
commit SHA. A rerun still aborts if the GitHub Release already exists.
