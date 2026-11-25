"""Fit the model's hand-traced masterplan corners to HMDA's Plot 20 coordinates.

Run before preparing the DEM and Sentinel texture. Requires NumPy.
The parcel polygon contains WGS84 data transcribed from the HMDA coordinate
table. This least-squares orthogonal fit keeps authored model distances intact.
"""
import json
import math
from pathlib import Path
import numpy as np

assets = Path(__file__).resolve().parents[1] / 'dist/assets'
parcel = json.loads((assets/'geography/plot-20.geojson').read_text())
ring = np.array(parcel['geometry']['coordinates'][0][:-1])
lon0, lat0 = ring[0]
degree = np.array([111320*math.cos(math.radians(lat0)), 111320])
control = dict(A=[91,163], P=[575,163], O=[575,745], B=[112,646])
# Brochure page 7 normalized to 1450 px width; same origin/scale as scene-map bay rectangles.
model = (np.array(list(control.values())) - np.array([345,430]))*.25
en = (np.array([ring[ord(key)-ord('A')] for key in control]) - ring[0])*degree
u,_,vt = np.linalg.svd((model-model.mean(0)).T @ (en-en.mean(0)))
rotation = u@vt
translation = en.mean(0) - model.mean(0)@rotation
residuals = np.linalg.norm(model@rotation+translation-en, axis=1)
origin = translation/degree + ring[0]
p = assets/'scene-map.json'
scene = json.loads(p.read_text())
scene['location'] = {'lat':round(origin[1],9),'lon':round(origin[0],9),
                     'accuracy':'Registered to HMDA Plot 20. The tower position within the parcel follows a hand-traced marketing plan.',
                     'controlSource':'geography/plot-20.geojson','controlLabels':list(control),
                     'cornerResidualM':dict(zip(control,np.round(residuals,2))),
                     'rmsCornerErrorM':round(float(np.sqrt(np.mean(residuals**2))),3)}
scene['northXZ'] = np.round(rotation[:,1],9).tolist()
scene['eastXZ'] = np.round(rotation[:,0],9).tolist()
p.write_text(json.dumps(scene, indent=2)+'\n')
print(scene['location'],scene['northXZ'],scene['eastXZ'])
