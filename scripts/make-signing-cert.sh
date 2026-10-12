#!/usr/bin/env bash
# One-time, per-Mac: create the self-signed "Phosphor Dev" code-signing
# identity, import it into the login keychain, trust it for code signing,
# and drop the public cert into the repo so CI can trust the same identity.
#
# Why: an unsigned (or ad-hoc) bundle gives TCC nothing stable to bind a
# grant to, so Accessibility / Screen Recording / App Management reset on
# every rebuild. A certificate makes the designated requirement
# "identifier + certificate leaf", which survives rebuilds.
#
# Afterwards: gh secret set APPLE_CERTIFICATE          < <(base64 -i ~/.tauri/phosphor-dev.p12)
#             gh secret set APPLE_CERTIFICATE_PASSWORD < ~/.tauri/phosphor-dev.p12.pass
set -euo pipefail
umask 077

dir="$HOME/.tauri"
repo="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$dir"
cd "$dir"

if security find-identity -v -p codesigning | grep -q '"Phosphor Dev"'; then
  echo "identity 'Phosphor Dev' already in the keychain; nothing to do"
  exit 0
fi

if [ ! -f phosphor-dev.p12 ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout phosphor-dev.key -out phosphor-dev.cer -subj "/CN=Phosphor Dev" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning" \
    -addext "basicConstraints=critical,CA:false" 2>/dev/null
  openssl rand -base64 24 > phosphor-dev.p12.pass
  # -legacy: macOS `security import` cannot read OpenSSL 3's default PBES2 bags.
  openssl pkcs12 -export -legacy -inkey phosphor-dev.key -in phosphor-dev.cer \
    -name "Phosphor Dev" -out phosphor-dev.p12 -passout file:phosphor-dev.p12.pass
  echo "wrote $dir/phosphor-dev.{key,cer,p12,p12.pass} (mode 600)"
fi

# A locked keychain in a shell with no GUI (ssh, remote terminal) fails the
# import with "User interaction is not allowed"; unlock asks for the login
# password here instead.
security unlock-keychain "$HOME/Library/Keychains/login.keychain-db"
security import phosphor-dev.p12 -k "$HOME/Library/Keychains/login.keychain-db" \
  -P "$(cat phosphor-dev.p12.pass)" -T /usr/bin/codesign -T /usr/bin/security
# User trust domain: may raise one macOS auth dialog. Click Allow.
security add-trusted-cert -r trustRoot -p codeSign phosphor-dev.cer

cp phosphor-dev.cer "$repo/scripts/phosphor-dev.cer"
chmod 644 "$repo/scripts/phosphor-dev.cer"

echo "--- identities:"
security find-identity -v -p codesigning | grep -E 'Phosphor Dev|valid identities'
