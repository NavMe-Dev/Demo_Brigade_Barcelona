"""Rasterize the original two-up brochure spreads at the delivered registration."""
import argparse
from pathlib import Path
import fitz
from PIL import Image
p=argparse.ArgumentParser()
p.add_argument('brochure',type=Path);args=p.parse_args()
root=Path(__file__).resolve().parents[2]
doc=fitz.open(args.brochure)
for index,pair in enumerate([['A1','A2'],['A3','A4'],['A5','A6'],['A7','B8'],['B9','B10'],['B11','B12'],['B14']],16):
    page=doc[index];half=page.rect.width/2
    for i,code in enumerate(pair):
        crop=fitz.Rect(i*half,0,(i+1)*half,page.rect.height)
        pix=page.get_pixmap(matrix=fitz.Matrix(1120/half,1120/half),clip=crop)
        im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        im.save(root/'dist/assets/plans'/f'{code}.webp',quality=92,method=6)
