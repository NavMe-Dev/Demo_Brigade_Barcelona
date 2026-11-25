"""Bundle the static buyer site, model sources and verified evidence in one archive."""
from pathlib import Path
import json
import zipfile
import struct
import hashlib
import os
import tempfile

root = Path(__file__).resolve().parents[1]
output = root / 'Brigade-Barcelona-Source.zip'
include = ['.env.example', '.gitignore', 'README.md', 'package.json', 'package-lock.json', 'dist', 'scripts', 'models', 'docs', 'qa', 'sources']
reserved = {'__pycache__', '.DS_Store', 'node_modules'}
published = json.loads((root / 'dist/data/unit-layouts.json').read_text())['layouts']
checks = json.loads((root / 'qa/all-residences.json').read_text())['layouts']
hashes = {r['code']: r['sha256'] for r in checks}
if len(published) != 13 or len(set(hashes.values())) != 13:
    raise RuntimeError('Expected thirteen independently tested residence packages')

files = []
for item in include:
    candidate = root / item
    entries = sorted(candidate.rglob('*')) if candidate.is_dir() else [candidate]
    for f in entries:
        if f.name.startswith('.env') and f.name != '.env.example':
            continue
        if f.is_file() and not reserved.intersection(f.parts) and f.suffix not in {'.pyc', '.blend1'}:
            files.append(f)

with tempfile.TemporaryDirectory(prefix='.brigade-release-', dir=root) as build_dir:
    candidate_zip = Path(build_dir) / output.name
    with zipfile.ZipFile(candidate_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for f in files:
            relative = f.relative_to(root)
            if relative.as_posix() == 'dist/data/arcgis-runtime.json':
                archive.writestr(relative.as_posix(), '{"arcgisImageryEnabled":false,"arcgisApiKey":""}\n')
            else:
                archive.write(f, relative)
    with zipfile.ZipFile(candidate_zip) as archive:
        corrupt = archive.testzip()
        if corrupt:
            raise RuntimeError('Corrupt archive entry ' + corrupt)
        names = set(archive.namelist())
        for record in published:
            for key in ['geometry','model','views','collisions','preview','plan']:
                if 'dist/' + record[key] not in names:
                    raise RuntimeError(record['code'] + ' missing ' + key)
            model = archive.read('dist/' + record['model'])
            if struct.unpack_from('<4sI', model) != (b'glTF', 2) or hashlib.sha256(model).hexdigest() != hashes[record['code']]:
                raise RuntimeError('Untested model: ' + record['code'])
            master = 'models/' + ('' if record['code'] == 'A3' else 'apartments/') + 'apartment-' + record['code'].lower() + '.blend'
            if master not in names:
                raise RuntimeError('Missing Blender source: ' + master)
        for doc in ('GIS_ARCHITECTURE','ESRI_INTEGRATION','GEOGRAPHIC_COVERAGE_REPORT','BUILDING_DATA_SOURCES','PERFORMANCE_REPORT'):
            if 'docs/' + doc + '.md' not in names:
                raise RuntimeError('Missing geographic report ' + doc)
        for capture in ('desktop-comparison.webp','phone-comparison.webp','hero-desktop.png','hero-phone.png'):
            if 'qa/evidence/gis/' + capture not in names:
                raise RuntimeError('Missing visual comparison ' + capture)
        config = json.loads(archive.read('dist/data/arcgis-runtime.json'))
        if config.get('arcgisApiKey') or config.get('arcgisImageryEnabled') or '.env.local' in names:
            raise RuntimeError('Bundled configuration must default to open imagery')
        catalog = json.loads(archive.read('dist/assets/geography/buildings/index.json'))
        for tile in catalog['tiles']:
            name='dist/assets/geography/buildings/' + tile['file']
            if archive.getinfo(name).file_size != tile['bytes']:
                raise RuntimeError('Invalid geographic tile ' + name)
    os.replace(candidate_zip, output)
    print(f'{output.name} — {len(names)} files, {output.stat().st_size:,} bytes, 13 validated residence models, {len(catalog["tiles"])} building tiles')
