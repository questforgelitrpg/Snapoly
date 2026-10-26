"""Rebuild the original app icons (optional; Pillow needed only for this tool)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
if 'onedrive' in str(root).lower().split('\\'):
    raise RuntimeError('Generate outside OneDrive.')
target = root / 'public' / 'icons'
target.mkdir(parents=True, exist_ok=True)
size = 2048
im = Image.new('RGB', (size, size), '#08151e')
d = ImageDraw.Draw(im)
for y in range(size):
    t = y / size
    d.line((0,y,size,y), fill=(int(12+5*(1-t)),int(30+19*(1-t)),int(41+16*(1-t))))
def pts(values): return [(int(x*size),int(y*size)) for x,y in values]
top = [(.5,.215),(.75,.36),(.5,.505),(.25,.36)]
left = [(.25,.36),(.5,.505),(.5,.795),(.25,.65)]
right = [(.5,.505),(.75,.36),(.75,.65),(.5,.795)]
d.polygon(pts(top), fill='#8bf9e1')
d.polygon(pts(left), fill='#28a89f')
d.polygon(pts(right), fill='#4ddbc0')
for face in [top,left,right]: d.line(pts(face+[face[0]]),fill='#c0fff1',width=7,joint='curve')
d.ellipse((int(.555*size),int(.515*size),int(.66*size),int(.62*size)),outline='#d5fff4',width=13)
d.polygon(pts([(.5,.215),(.56,.25),(.5,.285),(.44,.25)]),fill='#ffffff')
for width in [180,192,512]:
    im.resize((width,width),Image.Resampling.LANCZOS).save(target/f'icon-{width}.png')
print('Generated 180, 192 and 512 pixel Snapoly icons.')
