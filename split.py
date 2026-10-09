import os
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(HERE,'out'); ROOT=os.path.join(HERE,'..','..')
import json,re,os
M=json.load(open(os.path.join(OUT,'markers_all.json')))
shared=open(os.path.join(ROOT,'files','scripts','shared.js')).read()
icons={}
for name,url,w,h in re.findall(r'icons\.(\w+)=L\.icon\(\{iconUrl:"\.\./files/images/icons/([^"]+)",iconSize:\[(\d+),(\d+)\]',shared):
    icons[name]=[url,int(w),int(h)]
cat=json.load(open(os.path.join(OUT,'catnames.json')))
D=os.path.join(HERE,'..','data'); os.makedirs(D,exist_ok=True)
NAMES={'white_orchard':'White Orchard','hos_velen':'Velen & Novigrad','skellige':'Skellige','kaer_morhen':'Kaer Morhen','isle_mists':'Isle of Mists','toussaint':'Toussaint','gaunter':"Gaunter's World",'fables':'Thousand Fables'}
ORDER=['white_orchard','hos_velen','skellige','kaer_morhen','isle_mists','toussaint','gaunter','fables']
maps={}
for k in ORDER:
    d=M[k]
    cats={c:[[round(it['lat'],3),round(it['lng'],3),it['label'],it['popup'] if it['popup'].strip() else ''] for it in v] for c,v in d['cats'].items() if v}
    json.dump(cats,open(f'{D}/markers-{k}.json','w'),ensure_ascii=False,separators=(',',':'))
    maps[k]={kk:d[kk] for kk in ['sw','ne','center','minZoom','maxZoom','zoom','simple','nativeZooms','png']}
    maps[k]['name']=NAMES[k]
json.dump({'order':ORDER,'maps':maps,'icons':icons,'catNames':cat},open(f'{D}/maps.json','w'),ensure_ascii=False,separators=(',',':'))
json.dump(json.load(open(os.path.join(OUT,'quests.json'))),open(f'{D}/quests.json','w'),ensure_ascii=False,separators=(',',':'))
for k in ORDER: print(k, maps[k]['minZoom'],maps[k]['maxZoom'],maps[k]['nativeZooms'], os.path.getsize(f'{D}/markers-{k}.json'))
print(len(icons), sorted(icons)[:10])
