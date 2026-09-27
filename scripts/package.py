"""Build the installable theme, excluding development files and credentials."""
import hashlib
import json
import os
import re
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "komari-theme.json").read_text(encoding="utf-8"))
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
assert manifest["short"] == "aero"
assert manifest["version"] == package["version"], "Version mismatch"
tag = os.environ.get("GITHUB_REF", "")
if tag.startswith("refs/tags/"):
    assert tag == "refs/tags/v" + manifest["version"], "Tag must match manifest version"

output = root / "release"
output.mkdir(exist_ok=True)
archive = output / "aero.zip"
files = [root / name for name in ("komari-theme.json", "preview.png", "LICENSE")]
files += sorted(p for p in (root / "dist").rglob("*") if p.is_file())
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for file in files:
        assert not file.is_symlink(), "Symlinks are not allowed"
        entry = zipfile.ZipInfo(file.relative_to(root).as_posix(), (2026, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        content = file.read_bytes()
        if file.suffix in {".html", ".js"}:
            pattern = r"((?:/themes/aero/dist/assets/|\./)[A-Za-z0-9._-]+\.(?:js|css|json))([\"'])"
            content = re.sub(pattern, lambda m: m[1] + "?v=" + manifest["version"] + m[2], content.decode("utf-8")).encode("utf-8")
        z.writestr(entry, content)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert "dist/index.html" in z.namelist()
    version = manifest["version"]
    assert f"app.js?v={version}" in z.read("dist/index.html").decode()
    assert f"./data.js?v={version}" in z.read("dist/assets/app.js").decode()
    assert f"./earth.json?v={version}" in z.read("dist/assets/globe.js").decode()
    assert json.loads(z.read("komari-theme.json"))["version"] == manifest["version"]
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / "aero.zip.sha256").write_text(digest + "  aero.zip\n", encoding="utf-8")
print(f"Packaged Aero {manifest['version']}: {archive.name} ({archive.stat().st_size} bytes)")
print(f"SHA-256: {digest}")
