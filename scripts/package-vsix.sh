#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/.artifacts/vsix"

mkdir -p "${ARTIFACT_DIR}"

ROOT_DIR="${ROOT_DIR}" python3 - <<'PY'
from __future__ import annotations

import json
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(os.environ["ROOT_DIR"]).resolve()
PACKAGE_JSON = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
ARTIFACT_DIR = ROOT / ".artifacts" / "vsix"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

publisher = PACKAGE_JSON["publisher"]
name = PACKAGE_JSON["name"]
version = PACKAGE_JSON["version"]
display_name = PACKAGE_JSON.get("displayName", name)
description = PACKAGE_JSON.get("description", "")
engine = PACKAGE_JSON.get("engines", {}).get("vscode", "*")
categories = ",".join(PACKAGE_JSON.get("categories", []))
artifact = ARTIFACT_DIR / f"{publisher}.{name}-{version}.vsix"

content_types = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="svg" ContentType="image/svg+xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="jpg" ContentType="image/jpeg" />
  <Default Extension="jpeg" ContentType="image/jpeg" />
  <Default Extension="gif" ContentType="image/gif" />
  <Default Extension="webp" ContentType="image/webp" />
  <Default Extension="node" ContentType="application/octet-stream" />
  <Default Extension="bin" ContentType="application/octet-stream" />
  <Default Extension="map" ContentType="application/json" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Override PartName="/extension.vsixmanifest" ContentType="text/xml" />
</Types>
"""

manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{name}" Version="{version}" Publisher="{publisher}" />
    <DisplayName>{display_name}</DisplayName>
    <Description xml:space="preserve">{description}</Description>
    <Tags></Tags>
    <Categories>{categories}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{engine}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.EnabledApiProposals" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" />
      <Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true" />
      <Property Id="Microsoft.VisualStudio.Services.Content.Pricing" Value="Free" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/readme.md" Addressable="true" />
  </Assets>
</PackageManifest>
"""

def iter_files(base: Path):
    for path in sorted(base.rglob("*")):
        if path.is_file():
            yield path

with ZipFile(artifact, "w", compression=ZIP_DEFLATED) as archive:
    archive.writestr("[Content_Types].xml", content_types)
    archive.writestr("extension.vsixmanifest", manifest)

    files_to_add = [
        ROOT / "package.json",
        ROOT / "README.md",
    ]

    for fixed_file in files_to_add:
        if fixed_file.exists():
            archive.write(fixed_file, f"extension/{fixed_file.name}")

    readme = ROOT / "README.md"
    if readme.exists():
        archive.writestr("extension/readme.md", readme.read_text(encoding="utf-8"))

    for directory_name in ("dist", "media", "node_modules"):
        directory = ROOT / directory_name
        if not directory.exists():
            continue
        for file_path in iter_files(directory):
            archive.write(file_path, f"extension/{file_path.relative_to(ROOT).as_posix()}")

print(artifact)
PY
