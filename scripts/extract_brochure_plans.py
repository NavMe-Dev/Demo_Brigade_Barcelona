"""Regenerate the source sheets from the 26-page Brigade Barcelona brochure.

Usage: python scripts/extract_brochure_plans.py /path/to/brochure.pdf
Requires PyMuPDF and Pillow. Input identity is checked against the asset manifest.
"""
import hashlib
import json
from pathlib import Path
import sys

import fitz
from PIL import Image

assets = Path(__file__).resolve().parents[1] / 'dist/assets'
source = Path(sys.argv[1])
manifest = json.loads((assets / 'architectural-manifest.json').read_text())
if hashlib.sha256(source.read_bytes()).hexdigest() != manifest['sources']['brochure']['sha256']:
    raise ValueError('Brochure revision differs; review the page sequence before extracting.')
designs = json.loads((assets / 'brochure-manifest.json').read_text())['layouts']
pages = {}
for design in designs:
    pages.setdefault(design['source_pdf_page'], []).append(design['code'])
pages[15] = ['typical', 'refuge']
out = assets / 'plans'
out.mkdir(parents=True, exist_ok=True)
with fitz.open(source) as doc:
    for page, names in pages.items():
        p = doc[page-1]
        half = p.rect.width / 2
        width = 900 if page == 15 else 1120
        quality = 84 if page == 15 else 92
        for index, name in enumerate(names):
            clip = fitz.Rect(index*half, 0, (index+1)*half, p.rect.height)
            pix = p.get_pixmap(matrix=fitz.Matrix(width/half, width/half), clip=clip)
            Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(
                out / (name+'.webp'), quality=quality, method=6)
