#!/usr/bin/env bash
# Merge one platform entry into the release's latest.json, the manifest the
# in-app updater polls. The macOS and Linux workflows each own one platform,
# so each downloads the current manifest, merges its entry, and re-uploads.
#
# usage: updater-manifest.sh <tag> <platform> <signed-bundle-path>
#   <signed-bundle-path>.sig must sit beside the bundle (tauri build writes it).
#
# shortcut: two workflows finishing in the same minute can clobber each
# other's entry; re-dispatch the loser. Upgrade to a single release workflow
# if that ever actually happens.
set -euo pipefail

tag=$1
platform=$2
asset=$3
repo=${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY (owner/name)}
name=$(basename "$asset")
tmp=$(mktemp -d)

gh release download "$tag" --pattern latest.json --dir "$tmp" --repo "$repo" 2>/dev/null \
  || echo '{}' > "$tmp/latest.json"

jq -n \
  --slurpfile old "$tmp/latest.json" \
  --arg version "${tag#v}" \
  --arg platform "$platform" \
  --arg url "https://github.com/$repo/releases/download/$tag/$name" \
  --arg sig "$(cat "$asset.sig")" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '$old[0] * {version: $version, pub_date: $date, platforms: {($platform): {url: $url, signature: $sig}}}' \
  > "$tmp/merged.json"

mv "$tmp/merged.json" "$tmp/latest.json"
gh release upload "$tag" "$tmp/latest.json" --clobber --repo "$repo"
cat "$tmp/latest.json"
