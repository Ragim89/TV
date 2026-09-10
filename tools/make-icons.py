# Генератор иконок приложения. Запуск из корня репозитория: python3 tools/make-icons.py
import zlib, struct, math

BG=(0x09,0x14,0x26); GOLD=(0xF2,0xCD,0x84); GOLD2=(0xD9,0xA4,0x41)

def seg_dist(px,py,ax,ay,bx,by):
    dx,dy=bx-ax,by-ay
    L=dx*dx+dy*dy
    t=0.0 if L==0 else max(0.0,min(1.0,((px-ax)*dx+(py-ay)*dy)/L))
    return math.hypot(px-(ax+t*dx), py-(ay+t*dy))

def render(size, ss=4, ring=True, maskable=False):
    N=size*ss
    c=N/2.0
    # geometry of the V, scaled to canvas
    inset = 0.30 if maskable else 0.24
    top = N*inset; bot = N*(1-inset); halfw = N*(0.5-inset)*0.92
    ax,ay = c-halfw, top
    bx,by = c, bot
    cx,cy = c+halfw, top
    stroke = N*(0.052 if maskable else 0.058)
    r_ring = N*0.40; ring_w = N*0.012
    rows=[]
    for y in range(N):
        row=[]
        for x in range(N):
            px,py=x+0.5,y+0.5
            d=min(seg_dist(px,py,ax,ay,bx,by), seg_dist(px,py,bx,by,cx,cy))
            a_v=max(0.0,min(1.0,(stroke-d)/1.5+0.5)) if d<stroke+2 else 0.0
            a_r=0.0
            if ring and not maskable:
                dr=abs(math.hypot(px-c,py-c)-r_ring)
                if dr<ring_w+2: a_r=max(0.0,min(1.0,(ring_w-dr)/1.5+0.5))
            r,g,b=BG
            if a_r>0:
                r=int(r+(GOLD2[0]-r)*a_r*0.75); g=int(g+(GOLD2[1]-g)*a_r*0.75); b=int(b+(GOLD2[2]-b)*a_r*0.75)
            if a_v>0:
                # vertical gradient on the V: lighter at the top
                t=(py-top)/max(1.0,(bot-top))
                gc=[int(GOLD[i]+(GOLD2[i]-GOLD[i])*t) for i in range(3)]
                r=int(r+(gc[0]-r)*a_v); g=int(g+(gc[1]-g)*a_v); b=int(b+(gc[2]-b)*a_v)
            row.append((r,g,b))
        rows.append(row)
    # downsample
    out=bytearray()
    for y in range(size):
        out.append(0)
        for x in range(size):
            R=G=B=0
            for j in range(ss):
                for i in range(ss):
                    p=rows[y*ss+j][x*ss+i]; R+=p[0]; G+=p[1]; B+=p[2]
            n=ss*ss
            out += bytes((R//n, G//n, B//n, 255))
    return bytes(out)

def png(path,size,**kw):
    raw=render(size,**kw)
    def chunk(t,d):
        c=t+d
        return struct.pack('>I',len(d))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
    hdr=struct.pack('>IIBBBBB',size,size,8,6,0,0,0)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',hdr)+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
    open(path,'wb').write(data)
    print(path,size,len(data))

png('icons/icon-192.png',192)
png('icons/icon-512.png',512)
png('icons/icon-maskable-512.png',512,maskable=True)
png('icons/apple-touch-icon.png',180)
