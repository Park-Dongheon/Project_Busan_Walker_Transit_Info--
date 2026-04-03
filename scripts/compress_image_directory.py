#!/usr/bin/env python3
"""
Compress image files for the Busan Hiker attraction import flow.

Default behavior:
- Read files from ../image relative to this script
- Write compressed files to ../image_compressed relative to this script
- Keep original file names and extensions
- Try to fit each file under 5 MiB, which matches the backend default upload limit

Prerequisite:
    python -m pip install pillow
"""

from __future__ import annotations

import argparse
import io
import math
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


SCRIPT_ROOT = Path(__file__).resolve().parent
DEFAULT_SOURCE_DIR = (SCRIPT_ROOT.parent / "image").resolve()
DEFAULT_TARGET_BYTES = 5 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg"}


@dataclass(frozen=True)
class CompressionOptions:
    source_dir: Path
    output_dir: Path
    recursive: bool
    in_place: bool
    target_bytes: int
    jpeg_quality_start: int
    jpeg_quality_min: int
    jpeg_quality_step: int
    png_colors_start: int
    png_colors_min: int
    png_colors_step: int
    scale_step: float
    min_scale: float
    keep_larger: bool


@dataclass(frozen=True)
class CompressionResult:
    source_path: Path
    output_path: Path
    original_bytes: int
    compressed_bytes: int
    matched_target: bool
    changed: bool

    @property
    def saved_bytes(self) -> int:
        return self.original_bytes - self.compressed_bytes


def parse_args() -> CompressionOptions:
    parser = argparse.ArgumentParser(
        description="Compress PNG/JPG images for S3 upload/import."
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help=f"Directory containing images. Default: {DEFAULT_SOURCE_DIR}",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for compressed output. Defaults to '<source>_compressed'.",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Include images in sub-directories.",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite the source files in place.",
    )
    parser.add_argument(
        "--target-bytes",
        type=int,
        default=DEFAULT_TARGET_BYTES,
        help=f"Target maximum file size in bytes. Default: {DEFAULT_TARGET_BYTES}",
    )
    parser.add_argument(
        "--jpeg-quality-start",
        type=int,
        default=88,
        help="Initial JPEG quality. Default: 88",
    )
    parser.add_argument(
        "--jpeg-quality-min",
        type=int,
        default=55,
        help="Minimum JPEG quality. Default: 55",
    )
    parser.add_argument(
        "--jpeg-quality-step",
        type=int,
        default=5,
        help="JPEG quality decrement step. Default: 5",
    )
    parser.add_argument(
        "--png-colors-start",
        type=int,
        default=256,
        help="Initial PNG palette size when quantizing. Default: 256",
    )
    parser.add_argument(
        "--png-colors-min",
        type=int,
        default=32,
        help="Minimum PNG palette size. Default: 32",
    )
    parser.add_argument(
        "--png-colors-step",
        type=int,
        default=32,
        help="PNG palette decrement step. Default: 32",
    )
    parser.add_argument(
        "--scale-step",
        type=float,
        default=0.90,
        help="Scale multiplier applied when the image is still too large. Default: 0.90",
    )
    parser.add_argument(
        "--min-scale",
        type=float,
        default=0.45,
        help="Smallest allowed resize scale. Default: 0.45",
    )
    parser.add_argument(
        "--keep-larger",
        action="store_true",
        help="Write the compressed candidate even when it is not smaller than the original.",
    )

    args = parser.parse_args()

    source_dir = args.source_dir.expanduser().resolve()
    output_dir = (
        source_dir if args.in_place
        else (args.output_dir.expanduser().resolve() if args.output_dir else source_dir.with_name(source_dir.name + "_compressed"))
    )

    return CompressionOptions(
        source_dir=source_dir,
        output_dir=output_dir,
        recursive=bool(args.recursive),
        in_place=bool(args.in_place),
        target_bytes=max(1, int(args.target_bytes)),
        jpeg_quality_start=min(100, max(1, int(args.jpeg_quality_start))),
        jpeg_quality_min=min(100, max(1, int(args.jpeg_quality_min))),
        jpeg_quality_step=max(1, int(args.jpeg_quality_step)),
        png_colors_start=max(2, int(args.png_colors_start)),
        png_colors_min=max(2, int(args.png_colors_min)),
        png_colors_step=max(1, int(args.png_colors_step)),
        scale_step=min(0.99, max(0.50, float(args.scale_step))),
        min_scale=min(1.0, max(0.10, float(args.min_scale))),
        keep_larger=bool(args.keep_larger),
    )


def require_pillow():
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise SystemExit(
            "Pillow is required. Run: python -m pip install pillow"
        ) from exc
    return Image, ImageOps


def iter_image_files(source_dir: Path, recursive: bool) -> list[Path]:
    if not source_dir.is_dir():
        raise SystemExit(f"Source directory not found: {source_dir}")

    walker: Iterable[Path]
    walker = source_dir.rglob("*") if recursive else source_dir.iterdir()
    files = [
        path
        for path in walker
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    files.sort(key=lambda path: str(path.relative_to(source_dir)).lower())
    if not files:
        raise SystemExit(f"No supported image files found in: {source_dir}")
    return files


def main() -> int:
    options = parse_args()
    Image, ImageOps = require_pillow()
    image_files = iter_image_files(options.source_dir, options.recursive)

    if not options.in_place:
        options.output_dir.mkdir(parents=True, exist_ok=True)

    results: list[CompressionResult] = []
    failures: list[tuple[Path, str]] = []

    print(f"[compress] source      : {options.source_dir}")
    print(f"[compress] output      : {options.output_dir}")
    print(f"[compress] targetBytes : {options.target_bytes}")
    print(f"[compress] files       : {len(image_files)}")

    for source_path in image_files:
        try:
            result = compress_one(source_path, options, Image, ImageOps)
            results.append(result)
            print(format_result(result, options.target_bytes))
        except Exception as exc:  # pragma: no cover - best effort batch logging
            failures.append((source_path, str(exc)))
            print(f"[FAIL] {source_path.name}: {exc}")

    print()
    print_summary(results, failures, options.target_bytes)
    return 1 if failures else 0


def compress_one(source_path: Path, options: CompressionOptions, Image, ImageOps) -> CompressionResult:
    original_bytes = source_path.stat().st_size

    with Image.open(source_path) as opened:
        image = ImageOps.exif_transpose(opened)
        image.load()

    best_bytes = build_best_candidate(image, source_path.suffix.lower(), options, Image)
    candidate_bytes = best_bytes.getbuffer().nbytes

    if candidate_bytes >= original_bytes and not options.keep_larger:
        return copy_without_change(source_path, options, original_bytes)

    output_path = build_output_path(source_path, options)
    write_bytes(output_path, best_bytes.getvalue(), options.in_place)

    return CompressionResult(
        source_path=source_path,
        output_path=output_path,
        original_bytes=original_bytes,
        compressed_bytes=candidate_bytes,
        matched_target=candidate_bytes <= options.target_bytes,
        changed=candidate_bytes != original_bytes or output_path != source_path,
    )


def build_best_candidate(image, suffix: str, options: CompressionOptions, Image) -> io.BytesIO:
    scale = 1.0
    best: io.BytesIO | None = None

    while scale >= options.min_scale:
        working = resize_image(image, scale, Image)
        if suffix in {".jpg", ".jpeg"}:
            candidates = generate_jpeg_candidates(working, options)
        else:
            candidates = generate_png_candidates(working, options, Image)

        for candidate in candidates:
            if best is None or candidate.getbuffer().nbytes < best.getbuffer().nbytes:
                best = candidate
            if candidate.getbuffer().nbytes <= options.target_bytes:
                return candidate

        next_scale = round(scale * options.scale_step, 4)
        if next_scale >= scale:
            break
        scale = next_scale

    if best is None:
        raise RuntimeError("Failed to build any compressed candidate.")
    return best


def generate_jpeg_candidates(image, options: CompressionOptions) -> list[io.BytesIO]:
    rgb = flatten_to_rgb(image)
    qualities = descending_sequence(
        options.jpeg_quality_start,
        options.jpeg_quality_min,
        options.jpeg_quality_step,
    )
    return [save_jpeg(rgb, quality) for quality in qualities]


def generate_png_candidates(image, options: CompressionOptions, Image) -> list[io.BytesIO]:
    candidates: list[io.BytesIO] = [save_png(image)]

    if image.mode in {"RGB", "RGBA", "P", "L", "LA"}:
        for colors in descending_sequence(
            options.png_colors_start,
            options.png_colors_min,
            options.png_colors_step,
        ):
            quantized = quantize_image(image, colors, Image)
            candidates.append(save_png(quantized))

    return candidates


def descending_sequence(start: int, minimum: int, step: int) -> list[int]:
    values: list[int] = []
    current = start
    floor = min(start, minimum)
    while current >= floor:
        values.append(current)
        current -= step
    if values[-1] != floor:
        values.append(floor)
    return values


def resize_image(image, scale: float, Image):
    if scale >= 0.9999:
        return image.copy()

    width = max(1, int(math.floor(image.width * scale)))
    height = max(1, int(math.floor(image.height * scale)))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def quantize_image(image, colors: int, Image):
    has_transparency = image.mode in {"RGBA", "LA"} or ("transparency" in getattr(image, "info", {}))
    if image.mode == "RGBA":
        return image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    if image.mode == "RGB":
        return image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    if image.mode in {"P", "L", "LA"}:
        converted = image.convert("RGBA") if has_transparency else image.convert("RGB")
        return quantize_image(converted, colors, Image)
    return image.convert("RGBA").quantize(colors=colors, method=Image.Quantize.FASTOCTREE)


def flatten_to_rgb(image):
    from PIL import Image

    if image.mode == "RGB":
        return image
    if image.mode in {"RGBA", "LA"} or ("transparency" in getattr(image, "info", {})):
        foreground = image.convert("RGBA")
        background = Image.new("RGBA", foreground.size, (255, 255, 255, 255))
        return Image.alpha_composite(background, foreground).convert("RGB")
    return image.convert("RGB")


def save_jpeg(image, quality: int) -> io.BytesIO:
    output = io.BytesIO()
    image.save(
        output,
        format="JPEG",
        quality=quality,
        optimize=True,
        progressive=True,
    )
    return output


def save_png(image) -> io.BytesIO:
    output = io.BytesIO()
    image.save(
        output,
        format="PNG",
        optimize=True,
        compress_level=9,
    )
    return output


def build_output_path(source_path: Path, options: CompressionOptions) -> Path:
    if options.in_place:
        return source_path

    relative = source_path.relative_to(options.source_dir)
    output_path = options.output_dir / relative
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return output_path


def copy_without_change(source_path: Path, options: CompressionOptions, original_bytes: int) -> CompressionResult:
    output_path = build_output_path(source_path, options)
    if options.in_place:
        return CompressionResult(
            source_path=source_path,
            output_path=source_path,
            original_bytes=original_bytes,
            compressed_bytes=original_bytes,
            matched_target=original_bytes <= options.target_bytes,
            changed=False,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, output_path)
    return CompressionResult(
        source_path=source_path,
        output_path=output_path,
        original_bytes=original_bytes,
        compressed_bytes=original_bytes,
        matched_target=original_bytes <= options.target_bytes,
        changed=False,
    )


def write_bytes(output_path: Path, payload: bytes, in_place: bool) -> None:
    if in_place:
        temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
        temp_path.write_bytes(payload)
        temp_path.replace(output_path)
        return

    output_path.write_bytes(payload)


def format_result(result: CompressionResult, target_bytes: int) -> str:
    status = "OK" if result.compressed_bytes <= target_bytes else "WARN"
    changed = "changed" if result.changed else "unchanged"
    return (
        f"[{status}] {result.source_path.name}: "
        f"{format_bytes(result.original_bytes)} -> {format_bytes(result.compressed_bytes)} "
        f"({changed}, saved {format_bytes(max(0, result.saved_bytes))})"
    )


def print_summary(results: list[CompressionResult], failures: list[tuple[Path, str]], target_bytes: int) -> None:
    total_original = sum(item.original_bytes for item in results)
    total_compressed = sum(item.compressed_bytes for item in results)
    matched = sum(1 for item in results if item.matched_target)
    changed = sum(1 for item in results if item.changed)

    print("[summary]")
    print(f"  processed      : {len(results)}")
    print(f"  changed        : {changed}")
    print(f"  within target  : {matched}/{len(results)}")
    print(f"  failures       : {len(failures)}")
    print(f"  total original : {format_bytes(total_original)}")
    print(f"  total output   : {format_bytes(total_compressed)}")
    print(f"  total saved    : {format_bytes(max(0, total_original - total_compressed))}")

    if failures:
        print()
        print("[failures]")
        for path, message in failures:
            print(f"  - {path.name}: {message}")

    oversized = [item for item in results if item.compressed_bytes > target_bytes]
    if oversized:
        print()
        print("[oversized]")
        for item in oversized:
            print(
                f"  - {item.output_path.name}: {format_bytes(item.compressed_bytes)} "
                f"(target {format_bytes(target_bytes)})"
            )


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KiB"
    return f"{size / (1024 * 1024):.2f} MiB"


if __name__ == "__main__":
    sys.exit(main())
