# Generates the centered turntable logo variants (logo-t*.svg)
CREAM, ORANGE, AMBER, INK, BLACK = '#f3ece2', '#e4572e', '#f2a65a', '#14110e', '#000'

def record(cx, cy, r, label_fill, hole, groove='#2e2720', label_extra=''):
    g = ''.join(f'<circle cx="{cx}" cy="{cy}" r="{r*k:.0f}"/>' for k in (0.88, 0.76, 0.64))
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{INK}"/>'
            f'<g fill="none" stroke="{groove}" stroke-width="3">{g}</g>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.37:.0f}" fill="{label_fill}"/>{label_extra}'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.06:.0f}" fill="{hole}"/>')

def arm(color, dot, px=430, py=86, ex=420, ey=246, hx=352, hy=314, w=17):
    return (f'<g stroke-linecap="round" stroke="{color}" stroke-width="{w}">'
            f'<line x1="{px}" y1="{py}" x2="{ex}" y2="{ey}"/><line x1="{ex}" y1="{ey}" x2="{hx}" y2="{hy}"/></g>'
            f'<rect x="{hx-22}" y="{hy-14}" width="44" height="28" rx="6" transform="rotate(-45 {hx} {hy})" fill="{color}"/>'
            f'<circle cx="{px}" cy="{py}" r="25" fill="{color}"/><circle cx="{px}" cy="{py}" r="9" fill="{dot}"/>')

def svg(bg, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{bg}"/>{body}</svg>\n'

shelf = (f'<g fill="{INK}"><rect x="226" y="230" width="11" height="52" rx="3"/><rect x="242" y="224" width="11" height="58" rx="3"/>'
         f'<rect x="258" y="234" width="11" height="48" rx="3"/><rect x="273" y="228" width="11" height="54" rx="3" transform="rotate(14 279 282)"/>'
         f'<rect x="220" y="282" width="72" height="6" rx="3"/></g>')

variants = {
  't1': svg(ORANGE, record(256, 256, 160, CREAM, INK) + arm(CREAM, ORANGE)),
  't2': svg('#2e2720',    record(256, 256, 160, ORANGE, INK, groove='#3a3229') + arm(CREAM, INK)),
  't3': svg(CREAM,  record(256, 256, 160, AMBER, CREAM) + arm(ORANGE, CREAM)),
  't4': svg(ORANGE, f'<rect x="60" y="60" width="392" height="392" rx="44" fill="{CREAM}"/>' + record(246, 256, 136, AMBER, CREAM)
                    + arm(ORANGE, CREAM, px=410, py=110, ex=402, ey=250, hx=336, hy=310, w=14)
                    + f'<circle cx="404" cy="404" r="11" fill="{ORANGE}"/><circle cx="372" cy="404" r="11" fill="#c9bfb2"/>'),
  't5': svg(ORANGE, record(256, 256, 160, AMBER, AMBER, label_extra=shelf).replace(f'r="10" fill="{AMBER}"', 'r="0" fill="none"') + arm(CREAM, ORANGE)),
  't6': svg(ORANGE, record(256, 256, 172, ORANGE, INK, label_extra=f'<circle cx="256" cy="256" r="64" fill="none" stroke="{CREAM}" stroke-width="6"/>') + arm(CREAM, ORANGE, px=436, py=80, ex=428, ey=250, hx=360, hy=320)),
}
for k, v in variants.items():
    open(f'logo-{k}.svg', 'w').write(v)
print(' '.join(variants))
