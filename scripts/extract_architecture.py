"""Build the brochure amenity catalog and source illustrations.

Run with the reviewed developer PDF, PyMuPDF and Pillow. XY samples follow
the printed circular key numbers on a 1450-pixel-wide rendering of each spread.
World coordinates align the three illustrated drawing extents to the site model.
"""
import hashlib
import json
from pathlib import Path
import sys
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'dist/assets'
ART = ASSETS / 'brochure'
ART.mkdir(exist_ok=True)
source = Path(sys.argv[1])
if hashlib.sha256(source.read_bytes()).hexdigest()!=json.loads((ASSETS/'architectural-manifest.json').read_text())['sources']['brochure']['sha256']:
    raise ValueError('Review the source revision before tracing a different brochure.')
pdf=fitz.open(source)
def crop(page,coords,filename,width):
    p=pdf[page-1]
    scale=p.rect.width/1450
    clip=fitz.Rect(*(v*scale for v in coords))
    dpi=width/clip.width
    pix=p.get_pixmap(matrix=fitz.Matrix(dpi,dpi),clip=clip)
    Image.frombytes('RGB',(pix.width,pix.height),pix.samples).save(ART/filename,quality=87,method=6)
    return 'assets/brochure/'+filename

master=[
('Entry',[(189,682)]),('Exit',[(249,705)]),('Security cabin',[(223,681)]),
('Driveway',[(196,504),(168,644)]),('Drop-off',[(255,522),(452,717)]),
('Water feature with sculptures',[(223,539)]),('Jogging track',[(138,485),(526,401)]),
('Cycling track',[(123,465),(540,378)]),('Tower entry',[(220,629)]),
('Fire tender way',[(150,596)]),('Clubhouse entry',[(515,707)]),('Event lawn',[(465,595)]),
('Flea market platform',[(486,478)]),('Entry to sports courts',[(196,250),(470,249)]),
('Colonnade with seating & planting',[(126,243),(375,235),(557,239)]),
('Padel court',[(156,195)]),('Tennis courts',[(269,195)]),('Pickleball courts',[(403,195)]),
('Basketball practice court',[(497,194)]),('Pet park',[(545,194)]),('Bocce lawn',[(559,339)])]
eco=[
('Entrance',[(276,453),(411,442)]),('Café / semi-outdoor workspace',[(282,568),(315,666),(361,666)]),
('Stepped seater for small gatherings',[(253,647)]),('Directional sculpture feature',[(433,675)]),
('Indoor games zone',[(415,511)]),('Hobby / workshop zones',[(181,280),(177,380)]),
('Water body',[(180,428)]),('Stage',[(177,607)]),('Sunken amphitheatre / gathering lawn',[(177,522)]),
('Community sunset deck',[(207,654)]),('Trail',[(119,408),(234,559),(458,551)]),
('Elders’ pavilion with reflexology trail',[(136,677)]),('Outdoor café / workspace',[(262,718)]),
('Firepit & barbecue zone',[(322,742)]),('Barbecue zone',[(306,722)]),('Herb & orchard garden',[(395,731),(431,718)]),
('Kids’ play area',[(436,388)]),('Toddlers’ zone',[(516,386)]),('Toddlers’ sand pit',[(506,282)]),
('Wall climbing zone',[(558,402)]),('Nature play',[(555,367)]),('Pathway',[(524,327)]),
('Indoor games',[(553,263),(554,299)]),('Toddlers’ play zone',[(587,286)]),('Obstacle trail / jungle gym',[(373,226)])]
sky=[
('Walking trail',[(318,622)]),('Viewing deck',[(205,695),(295,674)]),('Acoustic sculpture',[(245,666)]),
('Pavilion',[(210,609)]),('Viewing area',[(510,703),(450,779)]),('Aroma planting with sculptures',[(456,687),(511,660),(401,751)]),
('Garden beds with mist makers',[(227,545)]),('Planting',[(171,573)]),('Reflexology paths',[(503,486),(472,571)]),
('Planted mounds',[(445,533),(529,482)]),('Shade structure',[(423,454)]),('Semi-covered deck',[(200,352)]),
('Yoga lawn',[(246,302)]),('Kiosk',[(362,278)]),('Lounge deck',[(495,324)])]
sections=[
 ('masterplan','Masterplan',7,(50,145,650,838),master,'masterplan.webp','brigade-barcelona.glb'),
 ('eco-deck','Eco Deck',9,(85,190,642,822),eco,'eco-deck-plan.webp','eco-deck.glb'),
 ('sky-deck','Sky Deck',11,(132,205,587,814),sky,'sky-deck-plan.webp','sky-deck.glb')]
def world(section,x,y):
    if section=='masterplan':return [(x-345)*.25,.30,(y-430)*.25]
    if section=='eco-deck':return [(160+(x-99)*.707-345)*.25,15.06,(273+(y-202)*.708-430)*.25]
    return [(265+(x-150)*.3875-345)*.25,178.45,(419+(y-220)*.362-430)*.25]
def slug(key,n):return key+'-'+str(n).zfill(2)
data=[]
for key,title,page,box,features,art,model in sections:
    image=crop(page,box,art,1050)
    x0,y0,x1,y1=box
    records=[]
    for i,(name,pts) in enumerate(features,1):
        locations=[]
        for x,y in pts:
            locations.append({'uv':[round((x-x0)/(x1-x0),5),round((y-y0)/(y1-y0),5)],'world':[round(v,3) for v in world(key,x,y)]})
        records.append({'id':slug(key,i),'number':i,'name':name,'sourcePage':page,'verification':'brochure legend and marked position','locations':locations})
    data.append({'id':key,'title':title,'sourcePage':page,'verification':'brochure plan','plan':image,'planCrop':box,'model':'assets/'+model,'features':records})
# Ordered pedestrian routes follow the printed circulation rather than cutting
# through the dwelling cores or jumping between disconnected rooftop bays.
walks={
'masterplan':[(189,680),(164,655),(137,632),(126,604),(126,480),(131,352),(140,267),(155,246),(204,240),(319,246),(377,236),(469,246),(526,234),(543,247),(549,353),(548,490),(550,650),(550,705),(536,727),(500,734),(409,724),(311,704),(245,689)],
'eco-deck':[(118,403),(113,360),(118,296),(128,244),(155,229),(203,234),(246,226),(332,228),(404,226),(471,233),(522,228),(568,233),(584,252),(584,290),(576,327),(583,369),(582,407),(568,426),(531,431),(500,433),(470,445),(458,476),(462,534),(453,578),(454,633),(447,661),(422,671),(395,679),(368,677),(325,675),(280,663),(249,647),(233,615),(235,567),(226,518),(232,478),(218,455),(180,454),(143,451),(119,437)],
'sky-deck':[(209,687),(225,653),(251,643),(290,646),(315,622),(352,621),(391,624),(412,651),(435,668),(474,677),(501,708),(517,743),(500,763),(462,763),(427,741),(402,710),(390,663),(366,629),(359,580),(359,501),(359,438),(359,394),(359,335),(362,280),(355,337),(355,412),(355,490),(355,570),(348,618),(309,626),(278,643),(242,653)]}
for section in data:
    section['walkRoute']=[world(section['id'],*pt) for pt in walks[section['id']]]
club=['Grand lobby','Banquet hall','Club lounge','Reading lounge / Art gallery','Fully equipped gym','Yoga studio','Aerobics / Dance studio','Salon & spa rooms','Co-working spaces','Mini theatre','Golf simulator','Music rooms','Indoor games lounge','Crèche','Swimming pool & kids’ pool','Pool deck']
features=[]
for i,name in enumerate(club,1):
    spot=[41,24.05,35] if i==15 else [45,24.05,31] if i==16 else [41,11,43]
    features.append({'id':slug('clubhouse',i),'name':name,'sourcePage':13,'verification':'listed amenity','level':None,'positionStatus':'rooftop pool illustrated on page 12' if i in (15,16) else 'individual room position unavailable','spaceProvisioned':i in (8,14),'locations':[{'world':spot}]})
features[12]['activities']=['Snooker','Billiards','Table tennis','Air hockey','Board games','Foosball']
data.append({'id':'clubhouse','title':'Seven-level clubhouse','sourcePage':13,'verification':'brochure pages 3, 12 and 13','image':'assets/clubhouse.webp','model':'assets/clubhouse.glb','features':features})
data[1]['image']=crop(8,(0,0,722,1023),'eco-terrace.webp',650)
data[2]['image']=crop(10,(850,520,1330,751),'sky-terrace.webp',700)
data[3]['interiorImage']=crop(13,(0,0,724,1023),'club-terrace.webp',630)
crop(3,(0,0,724,1023),'facade-crown.webp',570)
crop(5,(0,0,724,1023),'podium-colonnade.webp',565)
crop(6,(0,0,724,1023),'location-reference.webp',660)
# The title mark from cover is retained on its original burgundy field.
crop(1,(540,1620,936,1824),'barcelona-mark.webp',340)
# Recover the white/gold artwork against transparency for the buyer header.
branding=ASSETS/'branding'
branding.mkdir(exist_ok=True)
mark=Image.open(ART/'barcelona-mark.webp').convert('RGB')
bg=mark.getpixel((0,0))
alpha=Image.new('RGBA',mark.size)
for y in range(mark.height):
    for x in range(mark.width):
        sample=mark.getpixel((x,y))
        fg=(255,191,26) if sample[0]-sample[2]>118 else (255,255,255)
        delta=[fg[i]-bg[i] for i in range(3)]
        opacity=max(0,min(1,sum((sample[i]-bg[i])*delta[i] for i in range(3))/sum(v*v for v in delta)))
        alpha.putpixel((x,y),(*fg,round(opacity*255) if opacity>.035 else 0))
alpha=alpha.crop(alpha.getbbox())
alpha.save(branding/'brigade-barcelona.png',optimize=True)
(ASSETS/'amenity-plans.json').write_text(json.dumps({'id':'barcelona-amenities','source':'Brigade Barcelona digital brochure, pages 7–13','coordinateStatus':'Printed plan markers registered to illustrative scene geometry. Camera heights and routes are conceptual.','sections':data},ensure_ascii=False,indent=2)+'\n')
