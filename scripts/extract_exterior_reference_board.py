"""Extract the brochure's native source images and assemble the six-view board."""
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = (
    ("Complete exterior", 2, 5),
    ("Façade and roof crown", 3, 14),
    ("Clubhouse", 12, 89),
    ("Sky Deck", 10, 76),
    ("Eco Deck", 8, 61),
    ("Podium and planting", 5, 35),
)

def build_board(output):
    output.mkdir(parents=True, exist_ok=True)
    board = Image.new("RGB", (1800, 1430), "#f2eee6")
    draw = ImageDraw.Draw(board)
    try:
        title = ImageFont.truetype("Arial.ttf", size=38)
        label = ImageFont.truetype("Arial.ttf", size=23)
    except OSError:
        title = ImageFont.load_default(size=38)
        label = ImageFont.load_default(size=23)
    draw.text((26, 20), "Brigade Barcelona · Original brochure artwork", font=title, fill="#282420")
    with fitz.open(ROOT / "sources/brigade-barcelona-brochure.pdf") as brochure:
        for index, (name, page, xref) in enumerate(REFERENCES):
            if xref not in {image["xref"] for image in brochure[page - 1].get_image_info(xrefs=True)}:
                raise ValueError(f"Brochure page {page} no longer contains source image {xref}")
            source = brochure.extract_image(xref)
            target = output / f"brochure-p{page:02d}.{source['ext']}"
            target.write_bytes(source["image"])
            with Image.open(target) as reference:
                thumb = ImageOps.contain(reference, (556, 616))
                x = 26 + (index % 3) * 592
                y = 91 + (index // 3) * 663
                draw.text((x, y), f"{name} · page {page} · {reference.width} × {reference.height}",
                          font=label, fill="#282420")
                board.paste(thumb, (x + (556 - thumb.width) // 2, y + 32))
    board.save(output / "reference-board.jpg", quality=94)

if __name__ == "__main__":
    build_board(ROOT / "qa/evidence/exterior-rebuild/references")
