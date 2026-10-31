import random
CREAM, ORANGE, AMBER, INK = '#f3ece2', '#e4572e', '#f2a65a', '#14110e'
def svg(bg, body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{defs}</defs><rect width="512" height="512" rx="112" fill="{bg}"/>{body}</svg>\n'
def grooves(cx, cy, r, col='#2e2720', ks=(0.88, 0.76, 0.64)):
    return f'<g fill="none" stroke="{col}" stroke-width="3">' + ''.join(f'<circle cx="{cx}" cy="{cy}" r="{r*k:.0f}"/>' for k in ks) + '</g>'
def bars(x0, x1, y0, y1, fill, seed=3, unit=7):
    random.seed(seed); out=[]; x=x0
    while x < x1:
        w = random.choice([1,1,2,1,3,1,2]) * unit * 0.5
        out.append(f'<rect x="{x:.1f}" y="{y0}" width="{w:.1f}" height="{y1-y0}" fill="{fill}"/>')
        x += w + random.choice([1,1,2]) * unit * 0.5
    return ''.join(out)
def arm(color, dot):
    return (f'<g stroke-linecap="round" stroke="{color}" stroke-width="17"><line x1="430" y1="86" x2="420" y2="246"/><line x1="420" y1="246" x2="352" y2="314"/></g>'
            f'<rect x="330" y="300" width="44" height="28" rx="6" transform="rotate(-45 352 314)" fill="{color}"/>'
            f'<circle cx="430" cy="86" r="25" fill="{color}"/><circle cx="430" cy="86" r="9" fill="{dot}"/>')

out = {}
# U1: barcode on the label
out['u1'] = svg(ORANGE,
  f'<circle cx="256" cy="256" r="164" fill="{INK}"/>' + grooves(256,256,164) +
  f'<circle cx="256" cy="256" r="66" fill="{CREAM}"/>'
  f'<g clip-path="url(#lab)">{bars(212, 300, 226, 286, INK, seed=7, unit=6)}</g>' + arm(CREAM, ORANGE),
  defs='<clipPath id="lab"><circle cx="256" cy="256" r="54"/></clipPath>')
# U2: record inside camera viewfinder corners
c = CREAM; L=70; s=18
corners = ''.join(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{s}" stroke-linecap="round" stroke-linejoin="round"/>' for d in [
  f'M84 {84+L} V84 H{84+L}', f'M{428-L} 84 H428 V{84+L}', f'M428 {428-L} V428 H{428-L}', f'M{84+L} 428 H84 V{428-L}'])
out['u2'] = svg(ORANGE, corners + f'<circle cx="256" cy="256" r="128" fill="{INK}"/>' + grooves(256,256,128) +
  f'<circle cx="256" cy="256" r="48" fill="{AMBER}"/><circle cx="256" cy="256" r="8" fill="{INK}"/>'
  f'<rect x="104" y="250" width="304" height="12" rx="6" fill="{CREAM}" opacity="0.95"/>')
# U3: half record, half barcode
out['u3'] = svg(ORANGE,
  f'<g clip-path="url(#top)"><circle cx="256" cy="256" r="164" fill="{INK}"/>{grooves(256,256,164)}<circle cx="256" cy="256" r="62" fill="{CREAM}"/></g>'
  f'<g clip-path="url(#bot)"><g clip-path="url(#disc)"><circle cx="256" cy="256" r="164" fill="{CREAM}"/>{bars(80, 440, 256, 430, INK, seed=11, unit=9)}</g></g>'
  f'<circle cx="256" cy="256" r="9" fill="{INK}"/>',
  defs='<clipPath id="top"><rect x="0" y="0" width="512" height="256"/></clipPath><clipPath id="bot"><rect x="0" y="262" width="512" height="250"/></clipPath><clipPath id="disc"><circle cx="256" cy="256" r="164"/></clipPath>')
# U4: crate of records with one pulled up
sleeves = ''
for i,(x,col,rot) in enumerate([(120,AMBER,-6),(176,CREAM,-2),(300,AMBER,3),(352,CREAM,7)]):
    sleeves += f'<rect x="{x-46}" y="170" width="92" height="220" rx="8" fill="{col}" transform="rotate({rot} {x} 390)"/>'
out['u4'] = svg(INK,
  sleeves + f'<circle cx="250" cy="188" r="100" fill="#000"/>' + grooves(250,188,100,col='#3a3229') +
  f'<circle cx="250" cy="188" r="38" fill="{ORANGE}"/><circle cx="250" cy="188" r="6" fill="{INK}"/>'
  f'<rect x="60" y="300" width="392" height="140" rx="22" fill="{ORANGE}"/>'
  f'<rect x="206" y="336" width="100" height="22" rx="11" fill="{INK}" opacity="0.85"/>')
# U5: record with a library bookmark ribbon
out['u5'] = svg(ORANGE,
  f'<circle cx="256" cy="256" r="164" fill="{INK}"/>' + grooves(256,256,164) +
  f'<circle cx="256" cy="256" r="62" fill="{AMBER}"/><circle cx="256" cy="256" r="9" fill="{INK}"/>'
  f'<path d="M318 70 H378 V214 L348 190 L318 214 Z" fill="{CREAM}"/>')
# U6: Hebrew ת on the label
out['u6'] = svg(ORANGE,
  f'<circle cx="256" cy="256" r="164" fill="{INK}"/>' + grooves(256,256,164) +
  f'<circle cx="256" cy="256" r="70" fill="{CREAM}"/>'
  f'<text x="256" y="292" text-anchor="middle" font-family="Heebo, Arial, sans-serif" font-weight="800" font-size="104" fill="{ORANGE}">ת</text>' + arm(CREAM, ORANGE))
for k,v in out.items(): open(f'logo-{k}.svg','w').write(v)
print(' '.join(out))
