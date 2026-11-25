"""Conservative, non-generative noise reduction and WebP encoding for CPU renders.

Uses a three-pixel median followed by a small bilateral kernel. No invented detail,
rescaling, geometry changes, view compositing, or AI image synthesis is performed.
Requires Pillow and NumPy in the selected Python interpreter.
"""
import math, sys
import numpy as np
from PIL import Image, ImageFilter

def encode(source,destination):
    image=Image.open(source).convert('RGB').filter(ImageFilter.MedianFilter(3))
    values=np.asarray(image,dtype=np.float32)/255
    pad=np.pad(values,((3,3),(3,3),(0,0)),mode='reflect')
    numerator=np.zeros_like(values);denominator=np.zeros(values.shape[:2],np.float32)
    for dy in range(-3,4):
        for dx in range(-3,4):
            shifted=pad[3+dy:3+dy+values.shape[0],3+dx:3+dx+values.shape[1]]
            weight=np.exp(-((values-shifted)**2).sum(axis=2)/(2*.12**2))*math.exp(-(dx*dx+dy*dy)/8)
            numerator+=shifted*weight[:,:,None];denominator+=weight
    clean=np.clip(numerator/denominator[:,:,None]*255,0,255).astype('uint8')
    Image.fromarray(clean).save(destination,quality=88,method=6)

if __name__=='__main__':encode(sys.argv[1],sys.argv[2])
