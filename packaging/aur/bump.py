#!/usr/bin/env python3.14
"""Point PKGBUILD + .SRCINFO at a published release: python3.14 bump.py 0.8.4

Downloads the release's .deb files and LICENSE, fills in real sha256 sums,
and regenerates .SRCINFO (no makepkg needed, so it runs on the Mac).
Then copy PKGBUILD + .SRCINFO into the AUR clone, commit, push.
"""

import hashlib, re, sys, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
URL = "https://github.com/christopherpconway/phosphor"


def sha(url: str) -> str:
    with urllib.request.urlopen(url) as r:
        data = r.read()
    assert len(data) > 1000 or url.endswith("LICENSE"), f"suspiciously small: {url}"
    return hashlib.sha256(data).hexdigest()


def main(ver: str) -> None:
    lic = sha(
        f"https://raw.githubusercontent.com/christopherpconway/phosphor/v{ver}/LICENSE"
    )
    x86 = sha(f"{URL}/releases/download/v{ver}/phosphor_{ver}_amd64.deb")
    arm = sha(f"{URL}/releases/download/v{ver}/phosphor_{ver}_arm64.deb")

    pb = HERE / "PKGBUILD"
    t = pb.read_text()
    t = re.sub(r"^pkgver=.*$", f"pkgver={ver}", t, flags=re.M)
    t = re.sub(r"^pkgrel=.*$", "pkgrel=1", t, flags=re.M)
    t = re.sub(r"^sha256sums=.*$", f"sha256sums=('{lic}')", t, flags=re.M)
    t = re.sub(r"^sha256sums_x86_64=.*$", f"sha256sums_x86_64=('{x86}')", t, flags=re.M)
    t = re.sub(
        r"^sha256sums_aarch64=.*$", f"sha256sums_aarch64=('{arm}')", t, flags=re.M
    )
    pb.write_text(t)

    (HERE / ".SRCINFO").write_text(f"""pkgbase = phosphor-bin
\tpkgdesc = A CRT terminal with a cockpit
\tpkgver = {ver}
\tpkgrel = 1
\turl = {URL}
\tarch = x86_64
\tarch = aarch64
\tlicense = MIT
\tdepends = webkit2gtk-4.1
\tdepends = gtk3
\tdepends = libayatana-appindicator
\tprovides = phosphor
\tconflicts = phosphor
\tsource = LICENSE-{ver}::https://raw.githubusercontent.com/christopherpconway/phosphor/v{ver}/LICENSE
\tsha256sums = {lic}
\tsource_x86_64 = {URL}/releases/download/v{ver}/phosphor_{ver}_amd64.deb
\tsha256sums_x86_64 = {x86}
\tsource_aarch64 = {URL}/releases/download/v{ver}/phosphor_{ver}_arm64.deb
\tsha256sums_aarch64 = {arm}

pkgname = phosphor-bin
""")
    print(
        f"phosphor-bin {ver}: x86_64 {x86[:12]}  aarch64 {arm[:12]}  LICENSE {lic[:12]}"
    )


if __name__ == "__main__":
    main(sys.argv[1])
