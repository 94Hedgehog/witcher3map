import json,math,re,glob,collections,os
HERE=os.path.dirname(os.path.abspath(__file__))
from scipy.optimize import linear_sum_assignment
import numpy as np
D=os.path.join(HERE,'..','data')
RMAP={'WO':'white_orchard','V':'hos_velen','S':'skellige'}
MERC={'white_orchard','skellige'}
HOS_SP={'Garin Estate','Bowdon',"Hunter's Cottage",'Brunwich','Upper Mill','Von Everec Estate','Zuetzer Castle','Kilkerinn Ruins','Erde','Draken Hollow Outpost','Vikk Watchtower','Arnskrone Castle Ruins','Heddel'}
DIRS={'N':(0,1),'NE':(1,1),'E':(1,0),'SE':(1,-1),'S':(0,-1),'SW':(-1,-1),'W':(-1,0),'NW':(-1,1)}
def key(s): return re.sub(r"[^a-z]",'',re.sub(r'\(.*?\)|\*','',s.lower()))
def proj(mp,lat,lng):
    if mp in MERC:
        y=math.degrees(math.log(math.tan(math.pi/4+math.radians(max(min(lat,85),-85))/2)))
        return (lng,y)
    return (lng,lat)
entries=collections.defaultdict(list)
for f in glob.glob(os.path.join(HERE,'levels','*.txt')):
    for line in open(f):
        line=line.strip()
        if not line: continue
        cat,reg,sp,lvl,dr=line.split('|')
        entries[(cat,RMAP[reg])].append({'sp':sp,'lvl':int(lvl) if lvl else None,'dir':dr})
ALIAS={key('Oxenfurt'):key('Oxenfurt Gate')}
out={}; report=[]
for mp in ['white_orchard','hos_velen','skellige']:
    data=json.load(open(f'{D}/markers-{mp}.json'))
    sps=collections.defaultdict(list)
    for m in data.get('signpost',[]): sps[key(m[2])].append(proj(mp,m[0],m[1]))
    spl=[(m[2].replace('*',''),proj(mp,m[0],m[1])) for m in data.get('signpost',[])]
    # scale: median nearest-neighbour signpost distance
    nn=[]
    for i,(n,p) in enumerate(spl):
        ds=[math.dist(p,q) for j,(_,q) in enumerate(spl) if j!=i]; nn.append(min(ds))
    scale=float(np.median(nn))
    lv={}
    for cat in ['guarded','monsternest','monsterden','banditcamp','abandoned','pid']:
        E=entries.get((cat,mp),[]); M=data.get(cat,[])
        if not E or not M: continue
        C=np.full((len(E),len(M)),1e6)
        for i,e in enumerate(E):
            SL=sps.get(ALIAS.get(key(e['sp']),key(e['sp'])))
            if not SL: report.append(('NOSP',mp,cat,e['sp'])); continue
            for j,m in enumerate(M):
                p=proj(mp,m[0],m[1]); s=min(SL,key=lambda q:math.dist(p,q)); v=(p[0]-s[0],p[1]-s[1]); d=math.hypot(*v)/scale
                pen=0
                if e['dir'] in DIRS and d>0.05:
                    u=DIRS[e['dir']]; cos=(v[0]*u[0]+v[1]*u[1])/(math.hypot(*u)*math.hypot(*v)); pen=(1-cos)*1.2
                elif e['dir']=='' : pen=0
                lim = 9 if e['dir']=='FAR' else 3.2
                C[i,j]= d+pen if d<lim else 1e6
        r,c=linear_sum_assignment(C)
        for i,j in zip(r,c):
            if C[i,j]>=1e6: report.append(('NOMATCH',mp,cat,E[i]['sp'],E[i]['lvl'])); continue
            if E[i]['lvl'] is not None:
                lv[f'{cat}|{M[j][0]}|{M[j][1]}']=E[i]['lvl']
            report.append(('OK',mp,cat,E[i]['sp'],E[i]['lvl'],round(C[i,j],2)))
        if mp=='skellige' and cat=='guarded':
            bw=[j for i,j in zip(r,c) if E[i]['sp']=='Bay of Winds' and C[i,j]<1e6]
            used={j for i,j in zip(r,c) if C[i,j]<1e6}
            SL=sps[key('Bay of Winds')]
            extra=sorted([j for j in range(len(M)) if j not in used], key=lambda j: min(math.dist(proj(mp,M[j][0],M[j][1]),q) for q in SL))
            bw=(bw+extra)[:6]
            bw.sort(key=lambda j:-M[j][1])   # east -> west
            for j,l in zip(bw,[32,19,18,16,18,18]): lv[f'{cat}|{M[j][0]}|{M[j][1]}']=l
            report.append(('BAYWINDS',[ (round(M[j][0],1),round(M[j][1],1)) for j in bw]))
        report.append(('COUNT',mp,cat,len(E),len(M),sum(1 for i,j in zip(r,c) if C[i,j]<1e6)))
    # zone tags for HoS area: nearest signpost is HoS
    zone={}
    if mp=='hos_velen':
        for cat in ['guarded','monsternest','monsterden','banditcamp','abandoned','pid','smugglers','spoils','hidden','pop']:
            for m in data.get(cat,[]):
                p=proj(mp,m[0],m[1]); n=min(spl,key=lambda t:math.dist(p,t[1]))[0]
                if n in HOS_SP and f'{cat}|{m[0]}|{m[1]}' not in lv: zone[f'{cat}|{m[0]}|{m[1]}']='hos'
    out[mp]={'lv':lv,'zone':zone}
for r in report:
    if r[0]!='OK' or r[-1]>1.5: print(r)
LCATS=['guarded','monsternest','monsterden','banditcamp','abandoned','pid']
for mp in ['white_orchard','hos_velen','skellige','toussaint','kaer_morhen','isle_mists','gaunter','fables']:
    f=os.path.join(D,f'markers-{mp}.json'); data=json.load(open(f))
    o=out.get(mp,{'lv':{},'zone':{}})
    for cat,L in data.items():
        for m in L:
            del m[4:]
            k=f'{cat}|{m[0]}|{m[1]}'
            if k in o['lv']: m.append(o['lv'][k])
            elif k in o['zone']: m.append('hos')
            elif mp=='toussaint' and cat in LCATS: m.append('baw')
    json.dump(data,open(f,'w'),ensure_ascii=False,separators=(',',':'))
print({k:(len(v['lv']),len(v['zone'])) for k,v in out.items()})
