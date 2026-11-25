"""Lay out source WebGL screenshots from paired camera poses without altering their colors."""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "qa"
DIR = QA / "evidence/gis"
LABELS = {"wide": "Wide opening view", "overview": "Settled building view", "context": "Neighborhood view"}
BEFORE, AFTER = [json.loads((QA / f"gis-{s}.json").read_text())["captures"] for s in ("before", "after")]


def font(size):
    for name in ("/System/Library/Fonts/HelveticaNeue.ttc", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def pair(profile):
    frames = []
    for pose in LABELS:
        pre, post = [next(i for i in group if i["pose"] == pose and f"-{profile}-" in i["file"]) for group in (BEFORE, AFTER)]
        assert pre["viewport"] == post["viewport"] and pre["fov"] == post["fov"] and pre["view"] == post["view"]
        for key in ("camera", "target"):
            assert math.dist(pre["metrics"][key], post["metrics"][key]) < 0.001
        frames.append([Image.open(DIR / item["file"]).convert("RGB") for item in (pre, post)])
    return frames


def comparison(profile):
    frames = pair(profile)
    margin, gutter, header, note = 20, 14, 49, 56
    dark = (30, 37, 40)
    if profile == "desktop":
        w, h, row_head = 800, 450, 34
        width = 2 * w + gutter + 2 * margin
        height = header + 3 * (h + row_head + gutter) + note
        sheet = Image.new("RGB", (width, height), dark)
        draw = ImageDraw.Draw(sheet)
        for col, text in enumerate(("Before", "After")):
            draw.text((margin + col * (w + gutter), 10), text, font=font(25), fill="white")
        for row, (pose, images) in enumerate(zip(LABELS, frames)):
            y = header + row * (h + row_head + gutter)
            draw.text((margin, y), LABELS[pose], font=font(18), fill="#e5d4ac")
            for col, im in enumerate(images):
                sheet.paste(ImageOps.contain(im, (w, h)), (margin + col * (w + gutter), y + row_head))
    else:
        w, h, side = 234, 506, 77
        width = 3 * (w + gutter) - gutter + side + margin
        height = header + 2 * (h + gutter) + note
        sheet = Image.new("RGB", (width, height), dark)
        draw = ImageDraw.Draw(sheet)
        for col, (pose, images) in enumerate(zip(LABELS, frames)):
            x = side + col * (w + gutter)
            draw.text((x, 15), LABELS[pose], font=font(17), fill="#e5d4ac")
            for row, im in enumerate(images):
                y = header + row * (h + gutter)
                sheet.paste(ImageOps.contain(im, (w, h)), (x, y))
                if col == 0:
                    draw.text((10, y + 4), ("Before", "After")[row], font=font(18), fill="white")
    draw.text((margin, height - 49), "Paired views use matching cameras and daylight.", font=font(15), fill="white")
    draw.text((margin, height - 28), "Geographic sources and licenses: docs/BUILDING_DATA_SOURCES.md and docs/GEOGRAPHIC_COVERAGE_REPORT.md", font=font(12), fill="#d1d7d8")
    sheet.save(DIR / f"{profile}-comparison.webp", quality=92)


if __name__ == "__main__":
    for device in ("desktop", "phone"):
        comparison(device)
