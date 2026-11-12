import colorsys,sys
def hsl(h,s,l):
    r,g,b=colorsys.hls_to_rgb(h/360,l/100,s/100); return (r,g,b)
def lum(c):
    f=lambda v: v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=map(f,c); return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    la,lb=lum(a),lum(b); return (max(la,lb)+0.05)/(min(la,lb)+0.05)
def hexc(c): return '#'+''.join(f'{round(v*255):02X}' for v in c)
