# Releasing a new Draftboard version

Auto-update flow from your machine all the way to users' Tauri updater.
The GitHub Action does the heavy lifting; you just push a tag and
update the worker manifest.

## One-time setup (already done)

1. Generated minisign keypair:
   ```powershell
   npx tauri signer generate -w "$HOME\.tauri\draftboard.key"
   ```
2. Public key embedded in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`)
3. Private key stays on your machine. Set as GitHub Action secret:
   - Repo Settings → Secrets and variables → Actions → New secret
   - `TAURI_SIGNING_PRIVATE_KEY` = full contents of `~/.tauri/draftboard.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the password you typed when generating

## Release flow (each new version)

1. **Bump version** in both files:
   - `package.json` → `"version": "0.3.0"`
   - `src-tauri/tauri.conf.json` → `"version": "0.3.0"`
   - `src-tauri/Cargo.toml` → `version = "0.3.0"`

2. **Commit + tag**:
   ```bash
   git add -A
   git commit -m "release: v0.3.0"
   git tag v0.3.0
   git push origin main --tags
   ```

3. **Wait for the GitHub Action** (5-10 min). It will:
   - Build the signed installer
   - Create a GitHub Release at `https://github.com/Rafaellopezdelrio/draftboard/releases/tag/v0.3.0`
   - Upload `Draftboard_0.3.0_x64-setup.exe` + `.exe.sig`
   - Print the `.sig` contents in the action log

4. **Update the worker manifest** in `cloudflare-worker/src/worker.js`:
   ```js
   const LATEST_VERSION = {
     version: "0.3.0",                              // bumped
     notes: "Changelog for this release",
     pub_date: "2026-05-18T00:00:00Z",              // when you publish
     platforms: {
       "windows-x86_64": {
         signature: "PASTE_SIG_CONTENT_HERE",       // from action log
         url: "https://github.com/Rafaellopezdelrio/draftboard/releases/download/v0.3.0/Draftboard_0.3.0_x64-setup.exe",
       },
     },
   };
   ```

5. **Deploy worker**:
   ```bash
   cd cloudflare-worker
   npx wrangler deploy
   ```

6. Users who have a previous version installed will see the "Versión
   nueva disponible" banner on next app start. Click → download → install
   → restart. Done.

## Verification

After deploy, hit the manifest manually to confirm:
```bash
curl https://draftboard-riot-proxy.rafael-lopez-serrano-99.workers.dev/updater/latest.json
```

Should return the JSON with your new version + URL + signature.

## Rollback

If the release breaks:
1. Revert the worker `LATEST_VERSION` to the previous version + redeploy
2. Users who already auto-updated will need to manually reinstall the
   previous build from GitHub Releases archive
3. **Never** re-sign with a different private key — that would break the
   updater chain for everyone

## Tagging conventions

- `v0.X.Y` for normal releases
- `v0.X.Y-beta.1` for beta builds (the Action ignores these by default; add
  `pre*` to the trigger filter if you want them auto-released)
