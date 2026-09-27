"""Build the installable theme, excluding development files and credentials."""
import hashlib
import json
import os
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
        name = file.relative_to(root).as_posix()
        if name.startswith("dist/assets/"):
            name = name.replace("dist/assets/", "dist/assets/v" + manifest["version"] + "/", 1)
        entry = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        content = file.read_bytes()
        if file.suffix == ".html":
            content = content.decode("utf-8").replace("/themes/aero/dist/assets/", "/themes/aero/dist/assets/v" + manifest["version"] + "/").encode("utf-8")
        assert b"file:///" not in content if file.suffix in {".html", ".js", ".css"} else True
        z.writestr(entry, content)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert "dist/index.html" in z.namelist()
    version = manifest["version"]
    html = z.read("dist/index.html").decode()
    assert f"/assets/v{version}/app.js" in html
    assert f"/assets/v{version}/appearance.js" in html
    assert f"/assets/v{version}/style.css" in html
    for asset in ("app.js", "data.js", "globe.js", "charts.js", "earth.json", "appearance.js", "style.css"):
        assert f"dist/assets/v{version}/{asset}" in z.namelist()
    assert not any(n.startswith("dist/assets/") and not n.startswith(f"dist/assets/v{version}/") for n in z.namelist())
    assert json.loads(z.read("komari-theme.json"))["version"] == manifest["version"]
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / "aero.zip.sha256").write_text(digest + "  aero.zip\n", encoding="utf-8")
print(f"Packaged Aero {manifest['version']}: {archive.name} ({archive.stat().st_size} bytes)")
print(f"SHA-256: {digest}")
