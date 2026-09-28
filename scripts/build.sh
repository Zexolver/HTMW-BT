#!/usr/bin/env bash
# Packages the extension into dist/htmw-bt-<version>.zip.
# No build step/bundler is used — this just zips the source as-is.
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(grep -oE '"version": *"[^"]+"' manifest.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
out_dir="dist"
out_zip="$out_dir/htmw-bt-$version.zip"

rm -rf "$out_dir"
mkdir -p "$out_dir"

python3 - "$out_zip" <<'PY'
import sys, zipfile, pathlib

out_zip = sys.argv[1]
files = ["manifest.json", *sorted(str(p) for p in pathlib.Path("src").rglob("*") if p.is_file())]

with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, f)
PY

echo "Built $out_zip"
