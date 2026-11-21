"""Copies the Hall & Chart fonts (SIL OFL) into the Unreal project as TrueType files.

    python apps/catnight/Tools/fonts.py

The web game self-hosts them through @fontsource, which ships WOFF. WOFF 1 is the same sfnt
tables, each zlib-compressed, so this unpacks them with the standard library only (no fontTools).
Output: apps/catnight/Content/Slate/Fonts/<name>.ttf and the licences in LICENSES/. Slate loads
them by path at runtime (staged as UFS, see Config/DefaultGame.ini).
"""

from pathlib import Path
import struct
import zlib

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "apps" / "catnight" / "Content" / "Slate" / "Fonts"

# Output name -> (@fontsource package, file).
FONTS = {
    "UnifrakturCook-Bold": ("unifrakturcook", "unifrakturcook-{s}-700-normal.woff"),
    "IMFellEnglishSC-Regular": ("im-fell-english-sc", "im-fell-english-sc-{s}-400-normal.woff"),
    "IMFellDWPica-Regular": ("im-fell-dw-pica", "im-fell-dw-pica-{s}-400-normal.woff"),
    "IMFellDWPica-Italic": ("im-fell-dw-pica", "im-fell-dw-pica-{s}-400-italic.woff"),
    "IMFellDWPicaSC-Regular": ("im-fell-dw-pica-sc", "im-fell-dw-pica-sc-{s}-400-normal.woff"),
}


def package_dir(name: str) -> Path:
    store = REPO / "node_modules" / ".pnpm"
    for d in sorted(store.glob(f"@fontsource+{name}@*")):
        return d / "node_modules" / "@fontsource" / name
    raise SystemExit(f"@fontsource/{name} is not installed: run pnpm install")


def woff_to_sfnt(data: bytes) -> bytes:
    sig, flavor, _length, num_tables = struct.unpack(">4sIIH", data[:14])
    if sig != b"wOFF":
        raise ValueError("not a WOFF 1 file")
    tables = []
    for i in range(num_tables):
        tag, offset, comp_len, orig_len, checksum = struct.unpack(">4sIIII", data[44 + i * 20 : 64 + i * 20])
        raw = data[offset : offset + comp_len]
        body = zlib.decompress(raw) if comp_len < orig_len else raw
        tables.append((tag, checksum, body))
    tables.sort(key=lambda t: t[0])
    entry_selector = max(n for n in range(16) if 2**n <= num_tables)
    search_range = 16 * 2**entry_selector
    header = struct.pack(">IHHHH", flavor, num_tables, search_range, entry_selector, num_tables * 16 - search_range)
    offset = 12 + 16 * num_tables
    records, bodies = b"", b""
    for tag, checksum, body in tables:
        records += struct.pack(">4sIII", tag, checksum, offset + len(bodies), len(body))
        bodies += body + b"\0" * (-len(body) % 4)
    return header + records + bodies


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "LICENSES").mkdir(exist_ok=True)
    for out_name, (pkg, pattern) in FONTS.items():
        files = package_dir(pkg) / "files"
        # The latin subset; latin-ext adds accented letters when present (merged by Slate fallback).
        src = files / pattern.format(s="latin")
        (OUT / f"{out_name}.ttf").write_bytes(woff_to_sfnt(src.read_bytes()))
        ext = files / pattern.format(s="latin-ext")
        if ext.is_file():
            (OUT / f"{out_name}-Ext.ttf").write_bytes(woff_to_sfnt(ext.read_bytes()))
        lic = package_dir(pkg) / "LICENSE"
        if lic.is_file():
            (OUT / "LICENSES" / f"{pkg}-OFL.txt").write_text(lic.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"[fonts] {out_name}")


if __name__ == "__main__":
    main()
