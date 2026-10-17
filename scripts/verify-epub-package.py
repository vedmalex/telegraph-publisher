#!/usr/bin/env python3
"""
scripts/verify-epub-package.py - Strict EPUB container and package verification.

Verifies:
1. Valid ZIP structure via zipfile.testzip().
2. First entry is uncompressed 'mimetype' with content 'application/epub+zip' and no extra fields.
3. Remaining entries sorted in POSIX lexicographical order.
4. Valid META-INF/container.xml pointing to OPF package rootfile.
5. Valid OPF XML with manifest and spine.
6. Every spine XHTML exists, is valid XML, and UTF-8 byte size <= max_xhtml_bytes (unless --allow-oversized).
7. Local fragment targets (#target or file.xhtml#target) exist in the target document.
8. Manifest images exist in archive.
"""

import argparse
import hashlib
import json
import os
import posixpath
import sys
import xml.etree.ElementTree as ET
import zipfile


def parse_args():
    parser = argparse.ArgumentParser(description="Verify EPUB container and package")
    parser.add_argument("epub_path", help="Path to EPUB file")
    parser.add_argument(
        "--max-xhtml-bytes",
        type=int,
        default=307200,
        help="Maximum allowed byte size for any spine XHTML file (default: 307200 / 300 KiB)",
    )
    parser.add_argument(
        "--allow-oversized",
        action="store_true",
        help="Allow spine XHTML files exceeding max-xhtml-bytes as warnings instead of errors",
    )
    parser.add_argument(
        "--report",
        dest="report_path",
        help="Optional path to output detailed JSON verification report",
    )
    return parser.parse_args()


def strip_ns(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def parse_xml_safely(raw_bytes: bytes):
    parser = ET.XMLParser()
    # Define common HTML entities just in case
    for ent in ["nbsp", "amp", "lt", "gt", "quot", "apos", "copy", "reg"]:
        parser.entity[ent] = f"&{ent};"
    return ET.fromstring(raw_bytes, parser=parser)


def verify_epub(epub_path: str, max_xhtml_bytes: int, allow_oversized: bool) -> dict:
    errors = []
    warnings = []

    if not os.path.exists(epub_path):
        return {
            "valid": False,
            "errors": [f"File does not exist: {epub_path}"],
            "warnings": [],
        }

    with open(epub_path, "rb") as f:
        file_bytes = f.read()
    sha256 = hashlib.sha256(file_bytes).hexdigest()
    file_size = len(file_bytes)

    if not zipfile.is_zipfile(epub_path):
        return {
            "valid": False,
            "sha256": sha256,
            "byteSize": file_size,
            "errors": [f"File is not a valid ZIP archive: {epub_path}"],
            "warnings": [],
        }

    try:
        zf = zipfile.ZipFile(epub_path, "r")
    except Exception as e:
        return {
            "valid": False,
            "sha256": sha256,
            "byteSize": file_size,
            "errors": [f"Failed to open ZIP archive: {e}"],
            "warnings": [],
        }

    with zf:
        # 1. testzip
        test_err = zf.testzip()
        if test_err is not None:
            errors.append(f"ZIP CRC or header check failed on entry: {test_err}")

        infolist = zf.infolist()
        if not infolist:
            errors.append("ZIP archive is empty")
            return {
                "valid": False,
                "sha256": sha256,
                "byteSize": file_size,
                "errors": errors,
                "warnings": warnings,
            }

        filenames = [info.filename for info in infolist]

        # 2. First entry: mimetype
        first_entry = infolist[0]
        if first_entry.filename != "mimetype":
            errors.append(f"First entry in EPUB must be 'mimetype', found: '{first_entry.filename}'")
        else:
            if first_entry.compress_type != zipfile.ZIP_STORED:
                errors.append(f"Entry 'mimetype' must be uncompressed (ZIP_STORED), found: {first_entry.compress_type}")
            if len(first_entry.extra) != 0:
                errors.append(f"Entry 'mimetype' must have 0 extra field bytes, found: {len(first_entry.extra)}")
            try:
                mime_content = zf.read("mimetype")
                if mime_content != b"application/epub+zip":
                    errors.append(f"Entry 'mimetype' content mismatch: expected b'application/epub+zip', got {mime_content}")
            except Exception as e:
                errors.append(f"Failed to read 'mimetype': {e}")

        # 3. Remaining entries sorting (POSIX lexicographic)
        other_names = filenames[1:]
        sorted_other_names = sorted(other_names)
        if other_names != sorted_other_names:
            errors.append(f"ZIP archive entries after 'mimetype' are not in POSIX lexicographical order")

        # 4. META-INF/container.xml
        container_path = "META-INF/container.xml"
        if container_path not in filenames:
            errors.append(f"Missing required container descriptor: {container_path}")
            opf_path = None
        else:
            try:
                container_xml = zf.read(container_path)
                container_root = parse_xml_safely(container_xml)
                rootfile_elem = None
                for elem in container_root.iter():
                    if strip_ns(elem.tag) == "rootfile":
                        rootfile_elem = elem
                        break
                if rootfile_elem is None or not rootfile_elem.get("full-path"):
                    errors.append(f"{container_path} does not declare a valid <rootfile full-path='...'>")
                    opf_path = None
                else:
                    opf_path = rootfile_elem.get("full-path")
            except Exception as e:
                errors.append(f"Failed to parse {container_path}: {e}")
                opf_path = None

        # 5. OPF rootfile
        manifest_items = {}
        spine_itemrefs = []
        if opf_path:
            if opf_path not in filenames:
                errors.append(f"Declared OPF package rootfile does not exist in archive: {opf_path}")
            else:
                try:
                    opf_bytes = zf.read(opf_path)
                    opf_root = parse_xml_safely(opf_bytes)
                    opf_dir = posixpath.dirname(opf_path)

                    manifest_elem = None
                    spine_elem = None
                    for elem in opf_root.iter():
                        tag = strip_ns(elem.tag)
                        if tag == "manifest":
                            manifest_elem = elem
                        elif tag == "spine":
                            spine_elem = elem

                    if manifest_elem is None:
                        errors.append(f"OPF {opf_path} is missing <manifest>")
                    else:
                        for elem in manifest_elem:
                            if strip_ns(elem.tag) == "item":
                                item_id = elem.get("id")
                                item_href = elem.get("href")
                                item_type = elem.get("media-type")
                                if item_id and item_href:
                                    manifest_items[item_id] = {
                                        "id": item_id,
                                        "href": item_href,
                                        "mediaType": item_type,
                                        "zipPath": posixpath.normpath(posixpath.join(opf_dir, item_href)),
                                    }

                    if spine_elem is None:
                        errors.append(f"OPF {opf_path} is missing <spine>")
                    else:
                        for elem in spine_elem:
                            if strip_ns(elem.tag) == "itemref":
                                idref = elem.get("idref")
                                if idref:
                                    spine_itemrefs.append(idref)
                                    if idref not in manifest_items:
                                        errors.append(f"Spine itemref '{idref}' not found in OPF manifest")
                except Exception as e:
                    errors.append(f"Failed to parse OPF {opf_path}: {e}")

        # 6. Spine XHTML check, sizes, and XML validation
        spine_zip_paths = []
        xhtml_sizes = {}
        oversized_files = []
        document_anchors = {}  # {zipPath: set of IDs}
        document_elements = {}  # {zipPath: parsed ET root}

        for idref in spine_itemrefs:
            item = manifest_items.get(idref)
            if not item:
                continue
            zpath = item["zipPath"]
            spine_zip_paths.append(zpath)

            if zpath not in filenames:
                errors.append(f"Spine file does not exist in archive: {zpath}")
                continue

            try:
                content = zf.read(zpath)
                size_bytes = len(content)
                xhtml_sizes[zpath] = size_bytes

                if size_bytes > max_xhtml_bytes:
                    oversized_files.append({"path": zpath, "size": size_bytes, "limit": max_xhtml_bytes})
                    msg = f"Spine file {zpath} exceeds size limit: {size_bytes} bytes > {max_xhtml_bytes} bytes"
                    if allow_oversized:
                        warnings.append(msg)
                    else:
                        errors.append(msg)

                doc_root = parse_xml_safely(content)
                document_elements[zpath] = doc_root

                # Collect all anchor targets in this XHTML
                anchors = set()
                for el in doc_root.iter():
                    el_id = el.get("id")
                    if el_id:
                        anchors.add(el_id)
                    if strip_ns(el.tag) == "a":
                        a_name = el.get("name")
                        if a_name:
                            anchors.add(a_name)
                document_anchors[zpath] = anchors

            except Exception as e:
                errors.append(f"Failed to parse spine XHTML {zpath}: {e}")

        # 7. Local fragment target verification
        for zpath, doc_root in document_elements.items():
            doc_dir = posixpath.dirname(zpath)
            for el in doc_root.iter():
                href = el.get("href")
                if not href:
                    continue
                # Skip external links
                if href.startswith(("http://", "https://", "mailto:", "ftp:", "data:")):
                    continue

                if "#" in href:
                    target_file, fragment = href.split("#", 1)
                    if target_file:
                        target_zpath = posixpath.normpath(posixpath.join(doc_dir, target_file))
                    else:
                        target_zpath = zpath

                    if target_zpath not in filenames:
                        errors.append(f"Fragment link '{href}' in {zpath} references non-existent target file: {target_zpath}")
                    elif target_zpath not in document_anchors:
                        errors.append(f"Fragment link '{href}' in {zpath} references target file outside spine/parsed docs: {target_zpath}")
                    else:
                        target_anchors = document_anchors[target_zpath]
                        if fragment and fragment not in target_anchors:
                            errors.append(f"Fragment link '{href}' in {zpath} references missing anchor id: '{fragment}' in {target_zpath}")

        # 8. Manifest images verification
        for item in manifest_items.values():
            mtype = item.get("mediaType") or ""
            if mtype.startswith("image/"):
                img_zpath = item["zipPath"]
                if img_zpath not in filenames:
                    errors.append(f"Manifest image file missing in archive: {img_zpath}")

    max_measured_xhtml = max(xhtml_sizes.values()) if xhtml_sizes else 0
    valid = len(errors) == 0

    return {
        "valid": valid,
        "epubPath": os.path.abspath(epub_path),
        "sha256": sha256,
        "byteSize": file_size,
        "entryCount": len(filenames),
        "entries": filenames,
        "spineCount": len(spine_itemrefs),
        "spineItems": spine_itemrefs,
        "xhtmlSizes": xhtml_sizes,
        "maxMeasuredXhtmlBytes": max_measured_xhtml,
        "oversizedFiles": oversized_files,
        "errors": errors,
        "warnings": warnings,
    }


def main():
    args = parse_args()
    report = verify_epub(args.epub_path, args.max_xhtml_bytes, args.allow_oversized)

    if args.report_path:
        os.makedirs(os.path.dirname(os.path.abspath(args.report_path)), exist_ok=True)
        with open(args.report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

    if report["valid"]:
        print(f"EPUB package verification PASSED: {args.epub_path}")
        print(f"  SHA-256: {report['sha256']}")
        print(f"  Entries: {report['entryCount']}")
        print(f"  Spine items: {report['spineCount']}")
        print(f"  Max XHTML size: {report['maxMeasuredXhtmlBytes']} bytes")
        if report["warnings"]:
            print(f"  Warnings ({len(report['warnings'])}):")
            for w in report["warnings"]:
                print(f"    - {w}")
        sys.exit(0)
    else:
        print(f"EPUB package verification FAILED: {args.epub_path}")
        print(f"  Errors ({len(report['errors'])}):")
        for err in report["errors"]:
            print(f"    - {err}")
        if report["warnings"]:
            print(f"  Warnings ({len(report['warnings'])}):")
            for w in report["warnings"]:
                print(f"    - {w}")
        sys.exit(1)


if __name__ == "__main__":
    main()
