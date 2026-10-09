/* Witcher 3 – mapa a cesta. Static app, runs inside a fork of tiva85/witcher3map (folder /route). */
(function(){
'use strict';
const BASE = window.W3_BASE || '..';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const TYPES = {
  main:{n:'Hlavné',c:'var(--main)'}, side:{n:'Vedľajšie',c:'var(--side)'}, contract:{n:'Kontrakty',c:'var(--contract)'},
  treasure:{n:'Poklady',c:'var(--treasure)'}, scavenger:{n:'Scavenger',c:'var(--scavenger)'},
  encounter:{n:'Stretnutia',c:'var(--encounter)'}, pursuit:{n:'Gwent a závody',c:'var(--pursuit)'}, other:{n:'Iné',c:'var(--other)'}
};
const REGION_LABEL = {'KAER MORHEN':'Kaer Morhen','WHITE ORCHARD':'White Orchard','VIZIMA':'Vizima','VELEN':'Velen',
  'NOVIGRAD/OXENFURT':'Novigrad a Oxenfurt','SKELLIGE':'Skellige','HEARTS OF STONE':'Hearts of Stone','BLOOD AND WINE':'Blood and Wine'};
const EXPLORE = ['gwentshop','mypins','abandoned','banditcamp','guarded','hidden','monsterden','monsternest','pid','pop','smugglers','spoils',
  'sidequests','contracts','scavenger','event','gwentquest','signpost','notice','vineyardinfestation'];

/* ---------- storage ---------- */
const KEY = 'w3route:';
const store = {
  get(k,d){ try{ const v=localStorage.getItem(KEY+k); return v==null?d:JSON.parse(v);}catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(KEY+k, JSON.stringify(v)); }catch(e){} }
};
const S = {
  done: new Set(store.get('done',[])),          // quest ids "r<row>"
  mk: new Set(store.get('mk',[])),              // marker keys
  dec: store.get('dec',{}),                     // decision id -> option id
  types: store.get('types', Object.keys(TYPES)),
  cats: store.get('cats', EXPLORE),
  hideDone: store.get('hideDone', false),
  onlyDl: false,
  hideMk: store.get('hideMk', false),
  spoil: store.get('spoil', false),
  lvl: store.get('lvl', null),
  lvFilter: store.get('lvFilter', 'all'),
  map: store.get('map', 'white_orchard'),
  gw: new Set(store.get('gw',[])),
  pins: store.get('pins',[]),
  gwHide: store.get('gwHide',false),
  coll: store.get('coll','gw'),
  school: store.get('school','all'),
  openSeals: new Set()
};
if(!store.get('catsV2',false)){ ['gwentshop','mypins'].forEach(c=>{ if(!S.cats.includes(c)) S.cats.push(c); }); store.set('catsV2',true); }
const save = () => {
  store.set('done',[...S.done]); store.set('mk',[...S.mk]); store.set('dec',S.dec); store.set('types',S.types);
  store.set('cats',S.cats); store.set('hideDone',S.hideDone); store.set('hideMk',S.hideMk); store.set('spoil',S.spoil); store.set('map',S.map); store.set('lvl',S.lvl); store.set('gw',[...S.gw]); store.set('pins',S.pins); store.set('gwHide',S.gwHide); store.set('coll',S.coll); store.set('school',S.school); store.set('lvFilter',S.lvFilter);
};

/* ---------- data ---------- */
let CFG, ITEMS, QUESTS, DECS, DEC_BY_Q = {}, GW = null;
const markerCache = {};
const loadJSON = u => fetch(u).then(r=>{ if(!r.ok) throw new Error(u+' '+r.status); return r.json(); });
const qid = q => 'r'+q.row;

/* ---------- map ---------- */
let map=null, layers={}, hlLayer=null, curData=null;

function tileLayer(key,cfg,bounds){
  const png = new Set(cfg.png);
  const T = L.TileLayer.extend({
    getTileUrl(c){
      const z=c.z, y = cfg.simple ? (-c.y-1) : ((1<<z)-1-c.y), k = z+'/'+c.x+'/'+y;
      return BASE+'/files/maps/'+key+'/'+k+'.'+(png.has(k)?'png':'jpg');
    }
  });
  return new T('',{tileSize:256,noWrap:true,bounds,minNativeZoom:cfg.nativeZooms[0],maxNativeZoom:cfg.nativeZooms[1],
    minZoom:cfg.minZoom,maxZoom:cfg.maxZoom+1,keepBuffer:4,
    errorTileUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='});
}

const ZONE = {hos:{n:32,t:'32+',d:'Hearts of Stone oblasť – orientačne 32+'}, baw:{n:35,t:'35+',d:'Blood and Wine – orientačne 35+'}};
const lvNum = lv => typeof lv==='number' ? lv : (ZONE[lv] ? ZONE[lv].n : null);
function lvClass(lv){
  const n=lvNum(lv); if(n==null) return '';
  if(S.lvl==null) return 'lv-n';
  if(n>=S.lvl+5) return 'lv-r';
  if(n>S.lvl) return 'lv-a';
  if(n<=S.lvl-6) return 'lv-g';
  return 'lv-ok';
}
function lvText(lv){
  const n=lvNum(lv); if(n==null) return '';
  const base = typeof lv==='number' ? 'Úroveň '+lv : ZONE[lv].d;
  if(S.lvl==null) return base;
  const d=n-S.lvl;
  if(d>=5) return base+' – o '+d+' nad tebou, vráť sa neskôr';
  if(d>0) return base+' – o '+d+' nad tebou, zvládnuteľné';
  if(d<=-6) return base+' – hlboko pod tebou, dá málo XP';
  return base+' – v pohode pre tvoj level';
}
function markerIcon(cat,label,lv,done){
  const ic=iconFor(cat,label);
  if(cat==='pop' && !done){ const o=ic.options; return L.divIcon({className:'w3mk',iconSize:o.iconSize,iconAnchor:o.iconAnchor,popupAnchor:o.popupAnchor,
    html:'<img src="'+o.iconUrl+'" width="'+o.iconSize[0]+'" height="'+o.iconSize[1]+'" alt=""><b class="lv popb">+1</b>'}); }
  if(lv==null) return ic;
  const o=ic.options, t=typeof lv==='number'?lv:ZONE[lv].t;
  return L.divIcon({className:'w3mk',iconSize:o.iconSize,iconAnchor:o.iconAnchor,popupAnchor:o.popupAnchor,
    html:'<img src="'+o.iconUrl+'" width="'+o.iconSize[0]+'" height="'+o.iconSize[1]+'" alt=""><b class="lv '+lvClass(lv)+(typeof lv==='number'?'':' zone')+'">'+t+'</b>'});
}
function iconFor(cat,label){
  const ug = /underground/i.test(label||'') && CFG.icons[cat+'_ug'];
  const d = ug ? CFG.icons[cat+'_ug'] : (CFG.icons[cat] || CFG.icons.poi);
  return L.icon({iconUrl:BASE+'/files/images/icons/'+d[0], iconSize:[d[1],d[2]], iconAnchor:[d[1]/2,d[2]/2], popupAnchor:[0,-d[2]/2]});
}
const mkKey = (m,cat,lat,lng) => m+'|'+cat+'|'+lat+'|'+lng;

async function showMap(key, after){
  if(!CFG.maps[key]) key='white_orchard';
  S.map=key; save(); $('#mapsel').value=key;
  const cfg=CFG.maps[key];
  if(map){ map.remove(); map=null; }
  if(PLAN.start && PLAN.start.map!==key) clearPlan();
  const bounds = L.latLngBounds(cfg.sw, cfg.ne);
  map = L.map('map',{crs: cfg.simple?L.CRS.Simple:L.CRS.EPSG3857, minZoom:cfg.minZoom, maxZoom:cfg.maxZoom+1, zoomControl:false,
    attributionControl:false, maxBounds:bounds.pad(0.15), maxBoundsViscosity:0.8, worldCopyJump:false});
  L.control.zoom({position:'topright'}).addTo(map);
  tileLayer(key,cfg,bounds).addTo(map);
  map.setView(cfg.center, cfg.zoom);
  curData = markerCache[key] || (markerCache[key] = await loadJSON('data/markers-'+key+'.json'));
  layers = {};
  for(const [cat,list] of Object.entries(curData)){
    const g = L.layerGroup();
    list.forEach((m,i)=>{
      const [lat,lng,label,popup,lv]=m, k=mkKey(key,cat,lat,lng);
      const mk = L.marker([lat,lng],{icon:markerIcon(cat,label,lv,S.mk.has(k)),riseOnHover:true,keyboard:false});
      mk._w3 = {k,cat,i,label,popup,lv};
      if(S.mk.has(k)) mk.setOpacity(.28);
      mk.bindTooltip(esc(label)+(lv!=null?' · '+(typeof lv==='number'?'úr. '+lv:ZONE[lv].t):''),{direction:'top',offset:[0,-12]});
      mk.bindPopup(()=>popupHtml(mk),{maxWidth:320});
      mk.on('contextmenu',()=>toggleMarker(mk));
      g.addLayer(mk);
    });
    layers[cat]=g;
  }
  buildExtraLayers(key);
  applyLayers();
  map.on('click',e=>{ if(!PLAN.pick) return; PLAN.pick=false; PLAN.start={lat:e.latlng.lat,lng:e.latlng.lng,name:'bod na mape',map:S.map}; drawPlan(); renderPlanForm(); });
  map.on('contextmenu',e=>{
    const t=window.prompt('Vlastný pin – text poznámky:'); if(!t||!t.trim()) return;
    S.pins.push({id:'p'+Date.now(),map:key,lat:+e.latlng.lat.toFixed(3),lng:+e.latlng.lng.toFixed(3),t:t.trim()});
    save(); buildExtraLayers(key); applyLayers(); renderLayers(); toast('Pin pridaný.');
  });
  map.on('popupopen',e=>{
    const el=e.popup.getElement(); if(!el) return;
    el.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',ev=>{
      ev.preventDefault(); const p=a.getAttribute('href').slice(1).split('/').map(Number);
      if(p.length===3 && p.every(n=>!isNaN(n))) map.flyTo([p[1],p[2]],Math.min(p[0],cfg.maxZoom));
    }));
    const b=el.querySelector('.mkdone'); if(b) b.addEventListener('click',()=>{ toggleMarker(e.popup._source); map.closePopup(); });
    const del=el.querySelector('.pindel'); if(del) del.addEventListener('click',()=>{ S.pins=S.pins.filter(p=>p.id!==del.dataset.id); save(); map.closePopup(); buildExtraLayers(S.map); applyLayers(); renderLayers(); });
  });
  renderLayers();
  if(!$('#tab-plan').hidden) renderPlanForm();
  if(after) after();
}

function popupHtml(mk){
  const d=mk._w3, done=S.mk.has(d.k);
  const name = (CFG.catNames[d.cat]||d.cat);
  const lt=d.cat==='pop'?(done?'Skill point už získaný.':'Prvé čerpanie = +1 skill point.'):lvText(d.lv);
  return '<h4>'+esc(d.label)+'</h4>'+(lt?'<p class="plv '+lvClass(d.lv)+'">'+esc(lt)+'</p>':'')+'<div class="pb">'+(d.popup||'<span style="color:var(--muted)">'+esc(name)+'</span>')+'</div>'+
    '<button type="button" class="mkdone'+(done?' on':'')+'">'+(done?'Hotové ✓ (zrušiť)':'Označiť ako hotové')+'</button>';
}
function toggleMarker(mk){
  const k=mk._w3.k;
  if(S.mk.has(k)){ S.mk.delete(k); mk.setOpacity(1); } else { S.mk.add(k); mk.setOpacity(.28); }
  if(mk._w3.cat==='pop') mk.setIcon(markerIcon('pop',mk._w3.label,null,S.mk.has(k)));
  save(); applyLayers(); renderLayers();
}
function applyLayers(){
  if(!map) return;
  for(const [cat,g] of Object.entries(layers)){
    const on=S.cats.includes(cat);
    g.eachLayer(mk=>{
      const n=lvNum(mk._w3.lv);
      const tooHigh = S.lvl!=null && n!=null && S.lvFilter==='near' && n>S.lvl+2;
      const show = on && !tooHigh && !(S.hideMk && S.mk.has(mk._w3.k));
      if(show && !map.hasLayer(mk)) mk.addTo(map);
      if(!show && map.hasLayer(mk)) map.removeLayer(mk);
    });
  }
}
function refreshIcons(){
  for(const g of Object.values(layers)) g.eachLayer(mk=>{ if(mk._w3.lv!=null) mk.setIcon(markerIcon(mk._w3.cat,mk._w3.label,mk._w3.lv,S.mk.has(mk._w3.k))); });
  applyLayers();
}
function renderLayers(){
  const ul=$('#layers'); if(!curData) return;
  const EXTRA={gwentshop:'Gwent – predajcovia kariet',mypins:'Moje piny'};
  const cats=[...Object.keys(EXTRA),...Object.keys(curData).filter(c=>!EXTRA[c]).sort((a,b)=>(CFG.catNames[a]||a).localeCompare(CFG.catNames[b]||b))];
  ul.innerHTML = cats.map(cat=>{
    let tot, dn=0;
    if(EXTRA[cat]){ tot=layers[cat]?layers[cat].getLayers().length:0; }
    else { tot=curData[cat].length; dn=curData[cat].filter(m=>S.mk.has(mkKey(S.map,cat,m[0],m[1]))).length; }
    const ic=cat==='gwentshop'?CFG.icons.gwent:(CFG.icons[cat]||CFG.icons.poi);
    const img=cat==='mypins'?'<span class="mypin legend"><i></i></span>':'<img alt="" src="'+BASE+'/files/images/icons/'+ic[0]+'">';
    return '<li data-cat="'+cat+'" class="'+(S.cats.includes(cat)?'':'off')+'" role="switch" tabindex="0" aria-checked="'+S.cats.includes(cat)+'">'+
      img+esc(EXTRA[cat]||CFG.catNames[cat]||cat)+'<span class="cnt">'+(dn?dn+' / ':'')+tot+'</span></li>';
  }).join('');
}

/* ---------- gwent + own pins layers ---------- */
const gwLeft = gid => GW.cards.filter(c=>c.g.includes(gid) && !S.gw.has(c.id)).length;
const gwTotal = gid => GW.cards.filter(c=>c.g.includes(gid)).length;
function gwIcon(gid){
  const ic=CFG.icons.gwent, left=gwLeft(gid);
  return L.divIcon({className:'w3mk',iconSize:[ic[1],ic[2]],iconAnchor:[ic[1]/2,ic[2]/2],popupAnchor:[0,-ic[2]/2],
    html:'<img src="'+BASE+'/files/images/icons/'+ic[0]+'" width="'+ic[1]+'" height="'+ic[2]+'" alt=""><b class="lv gwb'+(left?'':' gwdone')+'">'+(left||'✓')+'</b>'});
}
function gwCardsHtml(gid){
  const list=GW.cards.filter(c=>c.g.includes(gid));
  return '<ul class="gwl">'+list.map(c=>gwCardLi(c,gid)).join('')+'</ul>';
}
function gwCardLi(c,gid){
  const others=c.g.filter(g=>g!==gid).map(g=>GW.groups[g].n);
  return '<li><label><input type="checkbox" data-gw="'+c.id+'"'+(S.gw.has(c.id)?' checked':'')+'><span><span class="gwn">'+esc(c.c)+'</span> <small class="gwf" data-f="'+esc(c.f)+'">'+esc(c.f)+'</small>'+
    (others.length?'<small class="gwo">alebo: '+esc(others.join(' / '))+'</small>':'')+'</span></label></li>';
}
function gwWarnSk(w){
  return w.replace(/Warning, this trader may disappear later in the game\./,'Predajca môže neskôr v hre zmiznúť – kúp karty čo najskôr.')
          .replace(/Not accessible after '([^']+)' mission\./g,'Nedostupné po queste „$1“ – kúp karty skôr.')
          .replace(/May not be accessible after '([^']+)' mission\./g,'Možno nedostupné po queste „$1“.');
}
function buildExtraLayers(key){
  ['gwentshop','mypins'].forEach(c=>{ if(layers[c]){ layers[c].eachLayer(m=>map.removeLayer(m)); } });
  const g=L.layerGroup();
  Object.entries(GW.groups).forEach(([gid,gr])=>{
    if(gr.map!==key || gr.lat==null) return;
    const mk=L.marker([gr.lat,gr.lng],{icon:gwIcon(gid),riseOnHover:true,zIndexOffset:500});
    mk._w3={k:'gw|'+gid,cat:'gwentshop',gid,label:gr.n};
    mk.bindTooltip(esc(gr.n)+' · '+gwLeft(gid)+' kariet zostáva',{direction:'top',offset:[0,-12]});
    mk.bindPopup(()=>'<h4>'+esc(gr.n)+'</h4>'+(gr.approx?'<p class="plv">Pin je pri najbližšom signposte – presné miesto je v okolí.</p>':'')+(gr.warn?'<p class="plv lv-r">⚠ '+esc(gwWarnSk(gr.warn))+'</p>':'')+
      '<p class="plv">Kúp alebo vyhraj (zahraj si s ním):</p><div class="pb">'+gwCardsHtml(gid)+'</div>',{maxWidth:330});
    g.addLayer(mk);
  });
  layers.gwentshop=g;
  const pg=L.layerGroup();
  S.pins.filter(p=>p.map===key).forEach(p=>{
    const mk=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'mypin',iconSize:[18,18],iconAnchor:[9,9],html:'<i></i>'}),zIndexOffset:600});
    mk._w3={k:'pin|'+p.id,cat:'mypins',label:p.t};
    mk.bindTooltip(esc(p.t),{direction:'top',offset:[0,-8]});
    mk.bindPopup('<h4>Môj pin</h4><div class="pb">'+esc(p.t)+'</div><button type="button" class="mkdone pindel" data-id="'+p.id+'">Zmazať pin</button>');
    pg.addLayer(mk);
  });
  layers.mypins=pg;
  
}
function gwFocus(gid){
  const gr=GW.groups[gid]; if(gr.lat==null){ toast('Tento predajca nemá pin na mape.'); return; }
  const go=()=>{ if(!S.cats.includes('gwentshop')){S.cats.push('gwentshop');save();applyLayers();renderLayers();}
    map.flyTo([gr.lat,gr.lng],Math.max(map.getZoom(),CFG.maps[S.map].maxZoom-1),{duration:.8});
    map.once('moveend',()=>layers.gwentshop.eachLayer(mk=>{ if(mk._w3.gid===gid) mk.openPopup(); })); };
  if(gr.map!==S.map) showMap(gr.map,go); else go();
}
function refreshGwIcons(){ if(layers.gwentshop) layers.gwentshop.eachLayer(mk=>mk.setIcon(gwIcon(mk._w3.gid))); }

/* ---------- gwent tab ---------- */
function renderColl(){
  const seg='<div class="seg">'+[['gw','Gwint'],['gear','Výbava'],['pop','Places of Power']].map(([k,n])=>'<button type="button" data-coll="'+k+'" aria-pressed="'+(S.coll===k)+'">'+n+'</button>').join('')+'</div>';
  if(S.coll==='gear') $('#tab-gwent').innerHTML=seg+gearHtml();
  else if(S.coll==='pop'){ $('#tab-gwent').innerHTML=seg+'<div class="gwhead"><p class="hint">Načítavam všetky mapy…</p></div>'; popHtml().then(h=>{ if(S.coll==='pop') $('#tab-gwent').innerHTML=seg+h; }); }
  else { renderGwent(); $('#tab-gwent').insertAdjacentHTML('afterbegin',seg); }
}
const SCHOOLS=[['cat','Mačka (Feline)',/Cat |Feline/],['griffin','Grifin',/Griffin/],['bear','Medveď (Ursine)',/Ursine|Bear/],['wolf','Vlk (Wolven)',/(^|[^n] )Wolf |Wolven/],['fwolf','Zabudnutý vlk',/Forgotten Wolf/],['viper','Zmija (Viper)',/Viper/],['manticore','Mantikora',/Manticore/]];
function gearHtml(){
  const parts=QUESTS.filter(q=>q.type==='scavenger').map(q=>({q,s:(SCHOOLS.find(([k,n,rx])=>rx.test(q.name))||['other'])[0]}));
  const opts='<option value="all">Všetky školy</option>'+SCHOOLS.map(([k,n])=>'<option value="'+k+'"'+(S.school===k?' selected':'')+'>'+n+'</option>').join('');
  let h='<div class="gwhead"><h2>Zaklínačská výbava</h2><p class="hint">Diagramy škôl sa oplatí zbierať, keď je ich level blízko tvojho – výbava pod tvoj level je zbytočná, nad ním si ju nevieš obliecť. Zameraj sa na jednu školu podľa štýlu: mačka (rýchle útoky), grifin (znamenia), medveď (ťažké brnenie), vlk (vyvážené).</p>'+
    '<div class="prow"><select id="schoolsel">'+opts+'</select></div>';
  const vis=parts.filter(p=>S.school==='all'||p.s===S.school);
  const todo=vis.filter(p=>!S.done.has(qid(p.q))).sort((a,b)=>(a.q.level||0)-(b.q.level||0));
  if(S.lvl!=null){
    const now=todo.filter(p=>p.q.level==null||(p.q.level<=S.lvl+2 && p.q.level>S.lvl-6)).sort((a,b)=>(b.q.level||0)-(a.q.level||0)), later=todo.find(p=>p.q.level>S.lvl+2);
    h+='<p class="gearrec">'+(now.length?'<b>Teraz:</b> '+now.slice(0,3).map(p=>'<button type="button" class="linkbtn gearq" data-id="'+qid(p.q)+'">'+esc(p.q.name)+'</button>').join(', '):'Nič z vybranej školy ešte nie je pre tvoj level.')+
      (later?'<br><b>Ďalšie:</b> '+esc(later.q.name)+' pri úrovni '+later.q.level:'')+'</p>';
  } else h+='<p class="gearrec">Zadaj svoj level v hlavičke a ukážem, ktorý diagram ísť hľadať teraz.</p>';
  h+='</div>';
  SCHOOLS.forEach(([k,n])=>{
    const L=vis.filter(p=>p.s===k).sort((a,b)=>(a.q.level||0)-(b.q.level||0)); if(!L.length) return;
    const dn=L.filter(p=>S.done.has(qid(p.q))).length;
    h+='<section class="act"><h2>'+esc(n)+' <small class="gwc">'+dn+' / '+L.length+'</small></h2><ul class="gearl">'+L.map(p=>{
      const d=S.done.has(qid(p.q));
      return '<li class="'+(d?'done':'')+'"><button type="button" class="gnode'+(d?' on':'')+'" data-id="'+qid(p.q)+'" aria-label="hotové"></button><button type="button" class="linkbtn gearq" data-id="'+qid(p.q)+'">'+esc(p.q.name)+'</button>'+
        '<span class="pmeta">'+(p.q.level!=null?'<span class="'+(d?'':lvClass(p.q.level))+'x">úr. '+p.q.level+'</span> · ':'')+esc(REGION_LABEL[p.q.region]||p.q.region)+((p.q.mk||[]).length?' · ◉ pin':'')+'</span></li>';
    }).join('')+'</ul></section>';
  });
  return h;
}
async function popHtml(){
  for(const k of CFG.order){ if(!markerCache[k]) markerCache[k]=await loadJSON('data/markers-'+k+'.json'); }
  let tot=0,dn=0,body='';
  CFG.order.forEach(k=>{
    const L=(markerCache[k].pop||[]); if(!L.length) return;
    const rows=L.map((m,i)=>{ const key=mkKey(k,'pop',m[0],m[1]), d=S.mk.has(key); tot++; if(d) dn++;
      const desc=(m[3]||'').replace(/<[^>]+>/g,'').split(/(?<=\.)\s+/).filter(x=>x && !/^(Draw from|The first time|Sign:|Igni|Quen|Aard|Yrden|Axii)/.test(x)).join(' ');
      const sps=markerCache[k].signpost||[]; let nb=null,nd=1e9; const p0=proj(k,m[0],m[1]);
      sps.forEach(s2=>{ const q=proj(k,s2[0],s2[1]), dd=Math.hypot(q[0]-p0[0],q[1]-p0[1]); if(dd<nd){nd=dd;nb=s2[2].replace('*','');} });
      const sign=(m[3].match(/(Aard|Axii|Igni|Quen|Yrden)/)||[])[1];
      return '<li class="'+(d?'done':'')+'"><button type="button" class="gnode'+(d?' on':'')+'" data-pop="'+esc(key)+'" aria-label="hotové"></button><button type="button" class="linkbtn popgo" data-map="'+k+'" data-i="'+i+'">'+esc(m[2].replace('*',''))+(nb?' – pri '+esc(nb):'')+'</button><span class="pmeta">'+(sign?esc(sign)+(desc?' · ':''):'')+esc(desc.slice(0,110))+'</span></li>'; }).join('');
    const md=L.filter(m=>S.mk.has(mkKey(k,'pop',m[0],m[1]))).length;
    body+='<section class="act"><h2>'+esc(CFG.maps[k].name)+' <small class="gwc">'+md+' / '+L.length+'</small></h2><ul class="gearl">'+rows+'</ul></section>';
  });
  return '<div class="gwhead"><h2>Places of Power</h2><div class="gwprog"><span>'+dn+' / '+tot+' = '+dn+' skill pointov navyše</span><div class="pbar"><i style="width:'+(tot?dn/tot*100:0)+'%"></i></div></div>'+
    '<p class="hint">Prvé čerpanie z každého Place of Power dáva +1 skill point – najlacnejší „level“ v hre. Na mape majú modrý štítok +1, kým ich neoznačíš.</p></div>'+body;
}
function renderGwent(){
  const tot=GW.cards.length, dn=GW.cards.filter(c=>S.gw.has(c.id)).length;
  const players=(markerCache[S.map]&&markerCache[S.map].gwent)||[];
  const played=players.filter(m=>S.mk.has(mkKey(S.map,'gwent',m[0],m[1]))).length;
  let h='<div class="gwhead"><h2>Zbierka gwintu</h2><div class="gwprog"><span>'+dn+' / '+tot+' kariet</span><div class="pbar"><i style="width:'+(tot?dn/tot*100:0)+'%"></i></div></div>'+
    '<p class="hint">Bez '+GW.base+' kariet zo základného balíčka. Hráči na mape <b>'+esc(CFG.maps[S.map].name)+'</b>: odohraní '+played+' / '+players.length+
    ' <button type="button" class="linkbtn" id="gwshowpl">ukázať hráčov na mape</button>. Pravým klikom na hráča si ho označíš ako odohraného.</p>'+
    '<label class="lhide"><input type="checkbox" id="gwhide"'+(S.gwHide?' checked':'')+'> Skryť získané karty a hotových predajcov</label></div>';
  const sec=(title,gids)=>{
    let x='';
    gids.forEach(gid=>{
      const gr=GW.groups[gid], left=gwLeft(gid), all=gwTotal(gid);
      if(!all || (S.gwHide && !left)) return;
      const list=GW.cards.filter(c=>c.g.includes(gid) && !(S.gwHide && S.gw.has(c.id)));
      const nameBtn = gr.lat!=null ? '<button type="button" class="gwgo" data-gid="'+gid+'">'+esc(gr.n)+' <span>na mape →</span></button>'
        : gr.t==='quest' ? '<button type="button" class="gwgo" data-q="'+esc(gr.n)+'">'+esc(gr.n)+' <span>v poradí →</span></button>' : '<span class="gwgn">'+esc(gr.n)+'</span>';
      x+='<div class="gwg"><div class="gwgh">'+nameBtn+'<span class="gwc">'+(all-left)+' / '+all+'</span></div>'+(gr.warn&&left?'<p class="gwwarn">⚠ '+esc(gwWarnSk(gr.warn))+'</p>':'')+'<ul class="gwl">'+list.map(c=>gwCardLi(c,gid)).join('')+'</ul></div>';
    });
    return x?'<section class="act"><h2>'+title+'</h2>'+x+'</section>':'';
  };
  const byMap={}; Object.entries(GW.groups).forEach(([gid,g])=>{ if(g.t==='vendor'){ (byMap[g.map||'none']=byMap[g.map||'none']||[]).push(gid);} });
  CFG.order.concat(['none']).forEach(mp=>{ if(byMap[mp]) h+=sec('Predajcovia – '+(mp==='none'?'mimo mapy':CFG.maps[mp].name), byMap[mp]); });
  h+=sec('Za questy', Object.keys(GW.groups).filter(g=>GW.groups[g].t==='quest'));
  h+=sec('Náhodné výhry (zahraj s každým hráčom)', ['random']);
  h+=sec('Ostatné', ['other']);
  $('#tab-gwent').innerHTML=h;
}

/* ---------- session planner ---------- */
const MERC_MAPS=new Set(['white_orchard','skellige','isle_mists','fables']);
function proj(mp,lat,lng){
  if(MERC_MAPS.has(mp)){ const r=Math.max(Math.min(lat,85),-85)*Math.PI/180; return [lng, Math.log(Math.tan(Math.PI/4+r/2))*180/Math.PI]; }
  return [lng,lat];
}
function spScale(mp){
  const sp=(markerCache[mp]&&markerCache[mp].signpost)||[]; if(sp.length<3) return 10;
  const P=sp.map(m=>proj(mp,m[0],m[1])), nn=P.map((p,i)=>Math.min(...P.filter((_,j)=>j!==i).map(q=>Math.hypot(p[0]-q[0],p[1]-q[1])))).sort((a,b)=>a-b);
  return nn[Math.floor(nn.length/2)];
}
const PLAN={start:null,items:[],layer:null,pick:false};
const RADII={s:{n:'Blízko',k:1.6},m:{n:'Okolie',k:2.8},l:{n:'Široko',k:4.5}};
function renderPlanForm(){
  const sp=((markerCache[S.map]&&markerCache[S.map].signpost)||[]).map((m,i)=>({i,n:m[2].replace('*','')})).sort((a,b)=>a.n.localeCompare(b.n));
  const r=store.get('planR','m'), inc=store.get('planInc',{q:1,poi:1,pop:1,gw:1});
  const startTxt = PLAN.start ? (PLAN.start.name||'bod na mape') : 'nevybrané';
  let h='<div class="planhead"><h2>Čo spravím teraz</h2>'+
    '<p class="hint">Vyber signpost, kde práve si (alebo bod na mape). Appka nájde v okolí všetko, čo sa ti oplatí pri tvojom leveli'+(S.lvl==null?' – <b>zadaj level v hlavičke</b>, inak berie všetko':' ('+S.lvl+')')+', a zoradí to do trasy.</p>'+
    '<div class="prow"><select id="plansp"><option value="">— signpost na mape '+esc(CFG.maps[S.map].name)+' —</option>'+sp.map(x=>'<option value="'+x.i+'"'+(PLAN.start&&PLAN.start.sp===x.i?' selected':'')+'>'+esc(x.n)+'</option>').join('')+'</select>'+
    '<button type="button" id="planpick" class="'+(PLAN.pick?'on':'')+'">'+(PLAN.pick?'Klikni na mapu…':'Bod na mape')+'</button></div>'+
    '<div class="prow chips">'+Object.entries(RADII).map(([k,v])=>'<button type="button" class="chip prad" data-r="'+k+'" aria-pressed="'+(r===k)+'" style="--c:var(--main)"><i></i>'+v.n+'</button>').join('')+'</div>'+
    '<div class="prow toggles">'+[['q','Questy'],['poi','Otázniky'],['pop','Places of Power'],['gw','Gwint']].map(([k,n])=>'<label><input type="checkbox" class="pinc" data-k="'+k+'"'+(inc[k]?' checked':'')+'> '+n+'</label>').join('')+'</div>'+
    '<div class="prow"><button type="button" id="plango" class="pgo">Naplánovať trasu</button>'+(PLAN.items.length?'<button type="button" id="planclr" class="pclr">Zrušiť</button>':'')+'</div>'+
    '<p class="hint">Štart: <b>'+esc(startTxt)+'</b></p></div><ol id="planlist">'+planListHtml()+'</ol>';
  $('#tab-plan').innerHTML=h;
}
function planItemDone(it){ return it.kind==='quest' ? S.done.has(it.qid) : it.kind==='gwv' ? gwLeft(it.gid)===0 : S.mk.has(it.key); }
function planListHtml(){
  if(!PLAN.items.length) return PLAN.ran?'<li class="pempty">V okolí nie je nič, čo by sa oplatilo. Skús väčší okruh alebo iný signpost.</li>':'';
  return PLAN.items.map((it,n)=>{
    const d=planItemDone(it);
    return '<li class="pit'+(d?' done':'')+'" data-n="'+n+'"><span class="pnum">'+(n+1)+'</span>'+
      '<span class="pmain"><button type="button" class="pgo2">'+esc(it.name)+'</button><span class="pmeta">'+it.meta+'</span></span>'+
      (it.kind!=='gwv'?'<button type="button" class="pdone" aria-pressed="'+d+'" title="Označiť ako hotové">✓</button>':'')+'</li>';
  }).join('');
}
function runPlan(){
  if(!PLAN.start){ toast('Najprv vyber signpost alebo bod na mape.'); return; }
  const mp=S.map, data=markerCache[mp], r=store.get('planR','m'), inc=store.get('planInc',{q:1,poi:1,pop:1,gw:1});
  const R=spScale(mp)*RADII[r].k, s0=proj(mp,PLAN.start.lat,PLAN.start.lng);
  const near=(lat,lng)=>{ const p=proj(mp,lat,lng); return Math.hypot(p[0]-s0[0],p[1]-s0[1])<=R; };
  const ok=lv=>{ const n=lvNum(lv); return S.lvl==null || n==null || n<=S.lvl+2; };
  const items=[];
  if(inc.q){
    const cur=currentQuest(), ci=cur?QUESTS.indexOf(cur):0;
    QUESTS.forEach((q,idx)=>{
      if(S.done.has(qid(q)) || !q.mk) return;
      if(S.lvl!=null){ if(q.level!=null && q.level>S.lvl+2) return; }
      else if(!q.anytime && idx>ci+40) return;
      if(q.after && q.after.some(a=>QUESTS.some(x=>startsQ(x.name,a) && !S.done.has(qid(x))))) return;
      const m=q.mk.find(([m0,cat,i])=>m0===mp && data[cat] && data[cat][i] && near(data[cat][i][0],data[cat][i][1]));
      if(!m) return; const d=data[m[1]][m[2]], t=TYPES[q.type]||TYPES.other;
      items.push({kind:'quest',qid:qid(q),name:q.name,lat:d[0],lng:d[1],cat:m[1],i:m[2],
        meta:'<span class="tag" style="--c:'+t.c+'">'+t.n+'</span>'+(q.level!=null?' · <span class="'+lvClass(q.level)+'x">úr. '+q.level+'</span>':'')+(q.until?' · <span class="dl">do: '+esc(q.until.join(', '))+'</span>':'')});
    });
  }
  const addCat=(cat,flagOk)=>{ (data[cat]||[]).forEach((m,i)=>{
      const key=mkKey(mp,cat,m[0],m[1]); if(S.mk.has(key) || !near(m[0],m[1]) || !flagOk(m)) return;
      const lv=m[4]; items.push({kind:'mk',key,cat,i,name:CFG.catNames[cat]||cat,lat:m[0],lng:m[1],
        meta:(lv!=null?'<span class="lv '+lvClass(lv)+(typeof lv==='number'?'':' zone')+'">'+(typeof lv==='number'?lv:ZONE[lv].t)+'</span> ':'')+esc(m[2]!==(CFG.catNames[cat]||cat)?m[2]:'')}); }); };
  if(inc.poi){ ['guarded','monsternest','monsterden','banditcamp','abandoned','pid'].forEach(c=>addCat(c,m=>ok(m[4]))); ['hidden','smugglers','spoils','vineyardinfestation'].forEach(c=>addCat(c,()=>true)); }
  if(inc.pop) addCat('pop',()=>true);
  if(inc.gw){
    addCat('gwent',()=>true);
    Object.entries(GW.groups).forEach(([gid,g])=>{ if(g.map===mp && g.lat!=null && gwLeft(gid)>0 && near(g.lat,g.lng))
      items.push({kind:'gwv',gid,name:g.n,lat:g.lat,lng:g.lng,cat:'gwentshop',meta:'Gwint – chýba '+gwLeft(gid)+' kariet'}); });
  }
  // route: nearest neighbour + 2-opt
  const P=items.map(it=>proj(mp,it.lat,it.lng)), dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  let order=[], left=items.map((_,i)=>i), cur=s0;
  while(left.length){ let bi=0,bd=1e18; left.forEach((j,k)=>{ const d=dist(cur,P[j]); if(d<bd){bd=d;bi=k;} }); const j=left.splice(bi,1)[0]; order.push(j); cur=P[j]; }
  const len=o=>{ let L=0,c=s0; o.forEach(j=>{L+=dist(c,P[j]);c=P[j];}); return L; };
  for(let improved=true,guard=0; improved && guard<50; guard++){ improved=false;
    for(let a=0;a<order.length-1;a++) for(let b=a+1;b<order.length;b++){
      const o2=order.slice(0,a).concat(order.slice(a,b+1).reverse(),order.slice(b+1)); if(len(o2)+1e-9<len(order)){ order=o2; improved=true; } } }
  PLAN.items=order.map(j=>items[j]); PLAN.ran=true;
  drawPlan(); renderPlanForm();
  // make sure the categories are visible
  const need=new Set(PLAN.items.map(it=>it.cat)); let ch=false; need.forEach(c=>{ if(!S.cats.includes(c)){S.cats.push(c);ch=true;} }); if(ch){ save(); applyLayers(); renderLayers(); }
}
function drawPlan(){
  if(PLAN.layer){ map.removeLayer(PLAN.layer); PLAN.layer=null; }
  if(!PLAN.start) return;
  const pts=[[PLAN.start.lat,PLAN.start.lng]].concat(PLAN.items.map(it=>[it.lat,it.lng]));
  const g=L.layerGroup();
  if(pts.length>1) L.polyline(pts,{color:'#d6a940',weight:3,opacity:.85,dashArray:'6 6',interactive:false}).addTo(g);
  L.marker(pts[0],{icon:L.divIcon({className:'pnumi start',iconSize:[22,22],iconAnchor:[11,11],html:'★'}),interactive:false,zIndexOffset:900}).addTo(g);
  PLAN.items.forEach((it,n)=>L.marker([it.lat,it.lng],{icon:L.divIcon({className:'pnumi'+(planItemDone(it)?' done':''),iconSize:[20,20],iconAnchor:[10,-6],html:String(n+1)}),interactive:false,zIndexOffset:900}).addTo(g));
  PLAN.layer=g.addTo(map);
  if(pts.length>1) map.flyToBounds(L.latLngBounds(pts).pad(.2),{maxZoom:CFG.maps[S.map].maxZoom-1,duration:.7});
}
function drawPlanKeepView(){ if(PLAN.layer){ map.removeLayer(PLAN.layer); PLAN.layer=null; } const c=map.getCenter(), z=map.getZoom(); drawPlan(); map.stop(); map.setView(c,z,{animate:false}); }
function clearPlan(){ PLAN.items=[]; PLAN.ran=false; PLAN.start=null; if(PLAN.layer&&map){ map.removeLayer(PLAN.layer); } PLAN.layer=null; }
function openPlanItem(it){
  map.flyTo([it.lat,it.lng],Math.max(map.getZoom(),CFG.maps[S.map].maxZoom-1),{duration:.6});
  map.once('moveend',()=>{ const g=layers[it.cat]; if(!g) return; g.eachLayer(mk=>{ const d=mk._w3; if((it.kind==='gwv'&&d.gid===it.gid)||(it.i!=null&&d.cat===it.cat&&d.i===it.i)) mk.openPopup(); }); });
}

/* highlight quest markers */
function focusQuest(q){
  if(!q.mk || !q.mk.length){
    if(q.map && q.map!==S.map) showMap(q.map,()=>toast('Quest nemá pin – otvorená mapa regiónu.'));
    else toast('Tento quest nemá pin na mape.');
    return;
  }
  const target=q.mk[0][0];
  const go=()=>{
    if(hlLayer){ map.removeLayer(hlLayer); hlLayer=null; }
    const pts=q.mk.filter(m=>m[0]===S.map).map(([mp,cat,i])=>({cat,i,d:curData[cat]&&curData[cat][i]})).filter(x=>x.d);
    if(!pts.length) return;
    if(!S.cats.includes(pts[0].cat)){ S.cats.push(pts[0].cat); save(); applyLayers(); renderLayers(); }
    hlLayer=L.layerGroup(pts.map(p=>L.circleMarker([p.d[0],p.d[1]],{radius:22,color:'#d6a940',weight:3,fill:false,className:'hl',interactive:false}))).addTo(map);
    const cfg=CFG.maps[S.map];
    if(pts.length===1) map.flyTo([pts[0].d[0],pts[0].d[1]], Math.max(map.getZoom(), cfg.maxZoom-1),{duration:.8});
    else map.flyToBounds(L.latLngBounds(pts.map(p=>[p.d[0],p.d[1]])).pad(.3),{maxZoom:cfg.maxZoom-1,duration:.8});
    const first=pts[0];
    map.once('moveend',()=>{ layers[first.cat] && layers[first.cat].eachLayer(mk=>{ if(mk._w3.i===first.i) mk.openPopup(); }); });
    if(window.matchMedia('(max-width:820px)').matches) $('#mapwrap').scrollIntoView({behavior:'smooth'});
  };
  if(target!==S.map) showMap(target,go); else go();
}

let toastT;
function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('on'),2200); }

/* ---------- route list ---------- */
function regionName(r){ return REGION_LABEL[r]||r; }
function questVisible(q,term){
  if(!S.types.includes(q.type)) return false;
  if(S.hideDone && S.done.has(qid(q))) return false;
  if(S.onlyDl && !q.until) return false;
  if(term && !q.name.toLowerCase().includes(term)) return false;
  return true;
}
function currentQuest(){ return QUESTS.find(q=>!q.anytime && !S.done.has(qid(q))) || QUESTS.find(q=>!S.done.has(qid(q))); }

function renderRoute(){
  const term=$('#search').value.trim().toLowerCase();
  const cur=currentQuest();
  let html='', lastRegion=null, pendingDiv=null, inAny=false;
  for(const it of ITEMS){
    if(it.kind==='anytime'){ pendingDiv={t:'Kedykoľvek počas hry, v ľubovoľnom poradí',cls:'',any:true}; continue; }
    if(it.kind==='note'){ pendingDiv={t:it.text,cls:''}; continue; }
    if(it.kind==='branch'){ pendingDiv={t:it.text,cls:'branch'}; continue; }
    if(pendingDiv && pendingDiv.any && !it.anytime) pendingDiv=null;
    if(!questVisible(it,term)) continue;
    if(it.region!==lastRegion){ html+='<li class="region"><b>'+esc(regionName(it.region))+'</b></li>'; lastRegion=it.region; }
    if(pendingDiv){ html+='<li class="divider '+pendingDiv.cls+'">'+esc(pendingDiv.t)+'</li>'; pendingDiv=null; }
    html+=questHtml(it, cur===it);
  }
  $('#route').innerHTML = html || '<li class="divider">Nič nevyhovuje filtrom. Skús zrušiť „Skryť hotové“ alebo pridať typy.</li>';
  updateHeader();
}
function questHtml(q,isCur){
  const id=qid(q), done=S.done.has(id), t=TYPES[q.type]||TYPES.other;
  const pins=(q.mk||[]).length;
  let m='';
  if(q.level!=null){ const lc=done?'':lvClass(q.level); m+='<span class="lvl qlv '+lc+'" title="'+esc(qXpHint(q.level))+'">úr. '+q.level+'</span>'; }
  m+='<span class="tag" style="--c:'+t.c+'">'+t.n+'</span>';
  if(pins) m+='<span title="Počet pinov na mape">◉ '+pins+'</span>';
  if(q.until) m+='<span class="dl" title="Po tomto queste sa zamkne">do: '+esc(q.until.join(', '))+'</span>';
  if(q.wiki) m+='<a href="'+esc(q.wiki)+'" target="_blank" rel="noopener">wiki ↗</a>';
  if(q.notes && q.notes.length) m+='<button type="button" class="notes-t" data-notes="'+id+'">poznámky ('+q.notes.length+')</button>';
  let h='<li class="q'+(done?' done':'')+(isCur?' cur':'')+(q.anytime?' any':'')+'" data-id="'+id+'" style="--c:'+t.c+'">'+
    '<button type="button" class="node" aria-label="'+(done?'Zrušiť hotové':'Označiť ako hotové')+': '+esc(q.name)+'" aria-pressed="'+done+'"></button>'+
    '<button type="button" class="qn'+(pins||q.map?'':' nomap')+'">'+esc(q.name)+'</button>'+
    '<div class="qm">'+m+'</div>'+
    '<div class="notes" data-for="'+id+'" hidden>'+(q.notes||[]).map(n=>'<p>'+esc(n.t.replace(/^-/,''))+(n.u?' <a href="'+esc(n.u)+'" target="_blank" rel="noopener">odkaz ↗</a>':'')+'</p>').join('')+'</div>';
  (DEC_BY_Q[q.name]||[]).forEach(d=>{ h+=sealHtml(d); });
  h+=gwSealHtml(q);
  h+=gwVendorWarnHtml(q);
  return h+'</li>';
}
function gwSealHtml(q){
  if(!GW) return '';
  const gid=Object.keys(GW.groups).find(g=>GW.groups[g].quest && startsQ(q.name,GW.groups[g].quest)); if(!gid) return '';
  const list=GW.cards.filter(c=>c.g.includes(gid)); const left=list.filter(c=>!S.gw.has(c.id)).length; if(!list.length) return '';
  const open=S.openSeals.has('gw-'+gid);
  return '<div class="seal gwseal" data-dec="gw-'+gid+'"><button type="button" aria-expanded="'+open+'"><span class="wax gw"></span>Gwint počas questu: '+list.length+(list.length===1?' karta':' karty')+
    '<span class="st">'+(left?'chýba '+left:'všetko ✓')+'</span></button><div class="sb"'+(open?'':' hidden')+'><p class="dtext">Tieto karty získaš iba v rámci tohto questu – zahraj si všetky partie.</p><ul class="gwl">'+list.map(c=>gwCardLi(c,gid)).join('')+'</ul></div></div>';
}
function gwVendorWarnHtml(q){
  // vendors whose cards become unavailable after this quest
  if(!GW) return '';
  const g=Object.entries(GW.groups).filter(([gid,gr])=>gr.warn && gwLeft(gid)>0 && (gr.warn.match(/'([^']+)' mission/g)||[]).some(m=>startsQ(q.name,m.slice(1,m.indexOf("'",1)))));
  if(!g.length) return '';
  return '<div class="gwwarn inroute">⚠ Pred týmto questom kúp gwint karty: '+g.map(([gid,gr])=>'<button type="button" class="linkbtn gwjump" data-gid="'+gid+'">'+esc(gr.n)+' ('+gwLeft(gid)+')</button>').join(', ')+'</div>';
}
function sealHtml(d){
  const chosen=S.dec[d.id], opt=(d.options||[]).find(o=>o.id===chosen), open=S.openSeals.has(d.id);
  return '<div class="seal" data-dec="'+d.id+'"><button type="button" aria-expanded="'+open+'"><span class="wax"></span>'+
    (d.checkpoint?'Pozor: ':'Rozhodnutie: ')+esc(d.title)+'<span class="st">'+(opt?esc(opt.label):(d.checkpoint?'':'nezaznačené'))+'</span></button>'+
    '<div class="sb"'+(open?'':' hidden')+'>'+decBody(d)+'</div></div>';
}
function decBody(d){
  let h='<p class="dtext sp">'+esc(d.text)+'</p>';
  if(d.options && d.options.length){
    h+='<div class="dopts">'+d.options.map(o=>'<label class="dopt"><input type="radio" name="d-'+d.id+'-'+Math.random().toString(36).slice(2,6)+'" data-dec="'+d.id+'" value="'+o.id+'"'+(S.dec[d.id]===o.id?' checked':'')+'><span>'+esc(o.label)+(o.note?'<small class="sp">'+esc(o.note)+'</small>':'')+'</span></label>').join('')+'</div>';
  }
  if(d.rec) h+='<p class="rec sp">Odporúčanie: '+esc(d.rec)+'</p>';
  return h;
}
function qXpHint(l){
  if(S.lvl==null) return 'Zadaj svoj level v hlavičke';
  const d=l-S.lvl;
  if(d<=-6) return 'Hlboko pod tebou – dá len zlomok XP';
  if(d>=5) return 'O '+d+' levelov nad tebou – zatiaľ odlož';
  if(d>0) return 'O '+d+' nad tebou – zvládnuteľné';
  return 'Ideálne pre tvoj level';
}
function updateHeader(){
  const tot=QUESTS.length, dn=QUESTS.filter(q=>S.done.has(qid(q))).length;
  $('#pcount').textContent=dn+' / '+tot;
  $('#pfill').style.width=(tot?dn/tot*100:0)+'%';
  const c=currentQuest();
  $('#nextname').textContent=c?c.name:'Všetko hotové';
  $('#nextlvl').textContent=c&&c.level!=null?'úr. '+c.level:'';
  renderWarn(c);
}
const startsQ = (name,key) => name===key || name.startsWith(key+' ') || name.startsWith(key+' (');
function pendingLocks(){
  // quests that are not done and get locked by some other quest
  return QUESTS.filter(q=>q.until && !S.done.has(qid(q)));
}
function renderWarn(cur){
  const el=$('#warn'); if(!cur){ el.hidden=true; return; }
  const ci=QUESTS.indexOf(cur);
  // next 12 not-done quests in route order (non-anytime)
  const upcoming=QUESTS.slice(ci).filter(q=>!q.anytime && !S.done.has(qid(q))).slice(0,12);
  const hits=[];
  for(const up of upcoming){
    const blocked=pendingLocks().filter(q=>q!==up && q.until.some(u=>startsQ(up.name,u)));
    if(blocked.length){ hits.push({up,blocked}); break; }
  }
  // decision checkpoints (e.g. Isle of Mists) among upcoming
  if(!hits.length){ el.hidden=true; el.innerHTML=''; return; }
  const h=hits[0];
  el.hidden=false;
  el.innerHTML='<b>Pozor pred „'+esc(h.up.name)+'“</b> – potom sa zamkne '+(h.blocked.length===1?'tento quest':'týchto '+h.blocked.length+' questov')+': '+
    h.blocked.map(q=>'<button type="button" class="wq" data-id="'+qid(q)+'">'+esc(q.name)+'</button>').join(', ');
}

/* ---------- decisions tab ---------- */
const wv=t=>/^zatiaľ/.test(t)?esc(t):'<span class="sp">'+esc(t)+'</span>';
function worldState(){
  const ciriDecs=DECS.filter(d=>d.ciri);
  let pos=0,neg=0,emhyr=null;
  ciriDecs.forEach(d=>{ const o=(d.options||[]).find(o=>o.id===S.dec[d.id]); if(!o) return;
    if(o.ciri>0) pos++; if(o.ciri<0) neg++; if('emhyr' in o) emhyr=o.emhyr; });
  const ro=(DECS.find(d=>d.id==='reason').options||[]).find(o=>o.id===S.dec.reason);
  const war = S.dec.mages==='abandon'||S.dec.assassins==='skip'||S.dec.dijkstra==='fight' ? 'radovid' : (ro?ro.war:null);
  const WAR={nilfgaard:'Nilfgaard vyhrá, Temeria ako vazal',dijkstra:'Sever pod Dijkstrom',radovid:'Radovid vyhrá, Temeria zanikne'};
  let ciri='zatiaľ otvorené';
  const answered=ciriDecs.filter(d=>S.dec[d.id]).length;
  if(answered){
    if(pos>=3) ciri = emhyr===true ? (war==='nilfgaard'?'cisárovná':war?'zaklínačka (Nilfgaard nevyhral vojnu)':'cisárovná alebo zaklínačka – rozhodne vojna') : emhyr===false ? 'zaklínačka' : 'žije – cisárovná alebo zaklínačka podľa Emhyra a vojny';
    else if(neg>=3) ciri='zlý koniec (Ciri nežije)';
    else ciri='zatiaľ otvorené – potrebuješ aspoň 3 kladné';
  }
  let sk='zatiaľ otvorené';
  if(S.dec.possession==='skip'||S.dec.undvik==='skip'||S.dec.gambit==='none') sk='Svanrige';
  else if(S.dec.gambit==='cerys') sk='Cerys'; else if(S.dec.gambit==='hjalmar') sk='Hjalmar';
  const rom = [S.dec.mages==='help_love'?'Triss':null, S.dec.lastwish==='love'?'Yennefer':null].filter(Boolean);
  const romTxt = rom.length===2?'obe → na konci sám':rom.length?rom[0]:'zatiaľ nikto';
  const keira={km:'Kaer Morhen',radovid:'k Radovidovi (zomrie)',kill:'mŕtva'}[S.dec.keira]||'zatiaľ otvorené';
  const pips=[...Array(5)].map((_,i)=>'<i class="'+(i<pos?'on':(i<pos+neg?'neg':''))+'"></i>').join('');
  $('#world').innerHTML='<h2>Stav sveta</h2><dl class="wgrid">'+
    '<dt>Ciri</dt><dd><span class="pips" title="Kladné / záporné body">'+pips+'</span>'+wv(ciri)+'</dd>'+
    '<dt>Vojna</dt><dd>'+wv(war?WAR[war]:'zatiaľ otvorené')+'</dd>'+
    '<dt>Skellige</dt><dd>'+wv(sk)+'</dd>'+
    '<dt>Romanca</dt><dd>'+esc(romTxt)+'</dd>'+
    '<dt>Keira</dt><dd>'+wv(keira)+'</dd></dl>';
}
function renderDecisions(){
  worldState();
  const acts=[]; DECS.forEach(d=>{ let a=acts.find(x=>x.n===d.act); if(!a){a={n:d.act,l:[]};acts.push(a);} a.l.push(d); });
  $('#declist').innerHTML=acts.map(a=>'<section class="act"><h2>'+esc(a.n)+'</h2>'+a.l.map(d=>
    '<div class="dcard'+(d.checkpoint?' check':'')+'"><h3>'+esc(d.title)+'</h3><div class="dq">Quest: <button type="button" data-goto="'+esc(d.quest)+'">'+esc(d.quest)+'</button></div>'+decBody(d)+'</div>').join('')+'</section>').join('');
}

/* ---------- events ---------- */
function bind(){
  $('#mapsel').innerHTML=CFG.order.map(k=>'<option value="'+k+'">'+esc(CFG.maps[k].name)+'</option>').join('');
  $('#mapsel').addEventListener('change',e=>showMap(e.target.value));

  $('#typechips').innerHTML=Object.entries(TYPES).filter(([k])=>QUESTS.some(q=>q.type===k)).map(([k,t])=>
    '<button type="button" class="chip" data-type="'+k+'" style="--c:'+t.c+'" aria-pressed="'+S.types.includes(k)+'"><i></i>'+t.n+'</button>').join('');
  $('#typechips').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b) return;
    const k=b.dataset.type; S.types=S.types.includes(k)?S.types.filter(x=>x!==k):[...S.types,k];
    b.setAttribute('aria-pressed',S.types.includes(k)); save(); renderRoute(); });

  const fh=$('#f-hidedone'); fh.checked=S.hideDone; fh.addEventListener('change',()=>{S.hideDone=fh.checked;save();renderRoute();});
  const fd=$('#f-deadline'); fd.addEventListener('change',()=>{S.onlyDl=fd.checked;renderRoute();});
  const fs=$('#f-spoil'); fs.checked=S.spoil; document.body.classList.toggle('spoilers',S.spoil);
  fs.addEventListener('change',()=>{S.spoil=fs.checked;save();document.body.classList.toggle('spoilers',S.spoil);});
  let st; $('#search').addEventListener('input',()=>{clearTimeout(st);st=setTimeout(renderRoute,120);});

  $('#route').addEventListener('click',e=>{
    const li=e.target.closest('.q'); if(!li) return;
    const q=QUESTS.find(x=>qid(x)===li.dataset.id);
    if(e.target.closest('.node')){
      S.done.has(li.dataset.id)?S.done.delete(li.dataset.id):S.done.add(li.dataset.id); save();
      const y=$('#tab-route').scrollTop; renderRoute(); $('#tab-route').scrollTop=y; return;
    }
    if(e.target.closest('.qn')){ focusQuest(q); return; }
    const nt=e.target.closest('.notes-t'); if(nt){ const n=li.querySelector('.notes'); n.hidden=!n.hidden; return; }
    const gj=e.target.closest('.gwjump'); if(gj){ gwFocus(gj.dataset.gid); return; }
    const sb=e.target.closest('.seal>button'); if(sb){ const s=sb.parentElement, id=s.dataset.dec, body=s.querySelector('.sb');
      body.hidden=!body.hidden; sb.setAttribute('aria-expanded',!body.hidden); body.hidden?S.openSeals.delete(id):S.openSeals.add(id); return; }
  });
  document.addEventListener('click',e=>{ const sp=e.target.closest('.sp'); if(sp && !document.body.classList.contains('spoilers')) sp.classList.add('show'); });
  document.addEventListener('change',e=>{
    const gc=e.target.closest('input[type=checkbox][data-gw]');
    if(gc){ gc.checked?S.gw.add(gc.dataset.gw):S.gw.delete(gc.dataset.gw); save(); refreshGwIcons();
      document.querySelectorAll('input[data-gw="'+gc.dataset.gw+'"]').forEach(x=>x.checked=gc.checked);
      if(!$('#tab-gwent').hidden && !e.target.closest('.leaflet-popup')){ const y=$('#tab-gwent').scrollTop; renderColl(); $('#tab-gwent').scrollTop=y; }
      if(!$('#tab-route').hidden && e.target.closest('#route')){ const y=$('#tab-route').scrollTop; renderRoute(); $('#tab-route').scrollTop=y; }
      return; }
    if(e.target.id==='gwhide'){ S.gwHide=e.target.checked; save(); renderColl(); return; }
    if(e.target.id==='schoolsel'){ S.school=e.target.value; save(); renderColl(); return; }
    const r=e.target.closest('input[type=radio][data-dec]'); if(!r) return;
    S.dec[r.dataset.dec]=r.value; save();
    if(!$('#tab-dec').hidden){ renderDecisions(); } else { const y=$('#tab-route').scrollTop; renderRoute(); $('#tab-route').scrollTop=y; worldState(); }
  });
  $('#declist').addEventListener('click',e=>{ const b=e.target.closest('[data-goto]'); if(!b) return;
    switchTab('route'); const q=QUESTS.find(x=>x.name===b.dataset.goto); if(q) scrollToQuest(q,true); });

  $('#tab-gwent').addEventListener('click',e=>{
    const b=e.target.closest('.gwgo');
    if(b && b.dataset.gid){ gwFocus(b.dataset.gid); return; }
    if(b && b.dataset.q){ const q=QUESTS.find(x=>x.name===b.dataset.q || x.name.startsWith(b.dataset.q)); switchTab('route'); if(q){ scrollToQuest(q,true); focusQuest(q);} else toast('Quest nie je v zozname.'); return; }
    const sg=e.target.closest('[data-coll]'); if(sg){ S.coll=sg.dataset.coll; save(); renderColl(); $('#tab-gwent').scrollTop=0; return; }
    const gq=e.target.closest('.gearq'); if(gq){ const q=QUESTS.find(x=>qid(x)===gq.dataset.id); focusQuest(q); return; }
    const gn=e.target.closest('.gnode');
    if(gn && gn.dataset.id){ const id=gn.dataset.id; S.done.has(id)?S.done.delete(id):S.done.add(id); save(); renderRoute(); const y=$('#tab-gwent').scrollTop; renderColl(); $('#tab-gwent').scrollTop=y; return; }
    if(gn && gn.dataset.pop){ const key=gn.dataset.pop; let f=null; layers.pop&&layers.pop.eachLayer(mk=>{ if(mk._w3.k===key) f=mk; });
      if(f) toggleMarker(f); else { S.mk.has(key)?S.mk.delete(key):S.mk.add(key); save(); }
      const y=$('#tab-gwent').scrollTop; renderColl(); setTimeout(()=>$('#tab-gwent').scrollTop=y,50); return; }
    const pg=e.target.closest('.popgo'); if(pg){ const k=pg.dataset.map, i=+pg.dataset.i;
      const go=()=>{ if(!S.cats.includes('pop')){S.cats.push('pop');save();applyLayers();renderLayers();} const m=markerCache[k].pop[i];
        map.flyTo([m[0],m[1]],Math.max(map.getZoom(),CFG.maps[k].maxZoom-1),{duration:.7}); map.once('moveend',()=>layers.pop.eachLayer(mk=>{ if(mk._w3.i===i) mk.openPopup(); })); };
      if(k!==S.map) showMap(k,go); else go(); return; }
    if(e.target.id==='gwshowpl'){ if(!S.cats.includes('gwent')){S.cats.push('gwent');save();applyLayers();renderLayers();} toast('Hráči gwintu sú zobrazení.'); }
  });
  $('#tab-plan').addEventListener('change',e=>{
    if(e.target.id==='plansp'){ const v=e.target.value; if(v===''){ return; } const m=markerCache[S.map].signpost[+v];
      PLAN.start={lat:m[0],lng:m[1],name:m[2].replace('*',''),sp:+v,map:S.map}; drawPlan(); renderPlanForm(); }
    if(e.target.classList.contains('pinc')){ const inc=store.get('planInc',{q:1,poi:1,pop:1,gw:1}); inc[e.target.dataset.k]=e.target.checked?1:0; store.set('planInc',inc); }
  });
  $('#tab-plan').addEventListener('click',e=>{
    const t=e.target;
    if(t.id==='planpick'){ PLAN.pick=!PLAN.pick; renderPlanForm(); if(PLAN.pick) toast('Klikni na mapu, kde práve si.'); return; }
    if(t.id==='plango'){ runPlan(); return; }
    if(t.id==='planclr'){ clearPlan(); renderPlanForm(); return; }
    const rb=t.closest('.prad'); if(rb){ store.set('planR',rb.dataset.r); renderPlanForm(); return; }
    const li=t.closest('.pit'); if(!li) return; const it=PLAN.items[+li.dataset.n];
    if(t.closest('.pdone')){
      if(it.kind==='quest'){ S.done.has(it.qid)?S.done.delete(it.qid):S.done.add(it.qid); save(); renderRoute(); }
      else { let found=null; layers[it.cat]&&layers[it.cat].eachLayer(mk=>{ if(mk._w3.k===it.key) found=mk; }); if(found) toggleMarker(found); else { S.mk.has(it.key)?S.mk.delete(it.key):S.mk.add(it.key); save(); } }
      $('#planlist').innerHTML=planListHtml(); drawPlanKeepView(); return;
    }
    if(t.closest('.pgo2')) openPlanItem(it);
  });
  $('#warn').addEventListener('click',e=>{ const b=e.target.closest('.wq'); if(!b) return; const q=QUESTS.find(x=>qid(x)===b.dataset.id); switchTab('route'); scrollToQuest(q,true); focusQuest(q); });
  $('#nextbtn').addEventListener('click',()=>{ const q=currentQuest(); if(!q) return; switchTab('route'); scrollToQuest(q,true); focusQuest(q); });

  $('#tabs').addEventListener('click',e=>{ const b=e.target.closest('[data-tab]'); if(b) switchTab(b.dataset.tab); });

  $('#layers').addEventListener('click',e=>{ const li=e.target.closest('li[data-cat]'); if(li) toggleCat(li.dataset.cat); });
  $('#layers').addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.dataset.cat){ e.preventDefault(); toggleCat(e.target.dataset.cat); } });
  $$('.lbtns button').forEach(b=>b.addEventListener('click',()=>{
    const p=b.dataset.preset; S.cats = p==='all'?Object.keys(CFG.icons).filter(k=>!k.endsWith('_ug')):p==='none'?[]:EXPLORE.slice();
    save(); applyLayers(); renderLayers(); }));
  const li=$('#mylvl'); if(S.lvl!=null) li.value=S.lvl;
  li.addEventListener('input',()=>{ const v=parseInt(li.value,10); S.lvl=isNaN(v)?null:Math.max(1,Math.min(100,v)); save(); refreshIcons(); const y=$('#tab-route').scrollTop; renderRoute(); $('#tab-route').scrollTop=y; if(!$('#tab-plan').hidden) renderPlanForm(); });
  $$('input[name=lvf]').forEach(r=>{ r.checked=r.value===S.lvFilter; r.addEventListener('change',()=>{ S.lvFilter=r.value; save(); applyLayers(); }); });
  const hm=$('#f-hidemk'); hm.checked=S.hideMk; hm.addEventListener('change',()=>{S.hideMk=hm.checked;save();applyLayers();});

  $('#exportbtn').addEventListener('click',()=>{
    const data={v:2,done:[...S.done],mk:[...S.mk],dec:S.dec,gw:[...S.gw],pins:S.pins,date:new Date().toISOString()};
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    a.download='witcher3-postup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  $('#importfile').addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    try{ const d=JSON.parse(await f.text()); if(!Array.isArray(d.done)) throw 0;
      S.done=new Set(d.done); S.mk=new Set(d.mk||[]); S.dec=d.dec||{}; S.gw=new Set(d.gw||[]); S.pins=d.pins||[]; save(); renderRoute(); renderDecisions(); showMap(S.map); toast('Záloha načítaná.');
    }catch(err){ toast('Súbor nie je záloha z tejto appky.'); }
    e.target.value='';
  });
}
function toggleCat(cat){ S.cats=S.cats.includes(cat)?S.cats.filter(c=>c!==cat):[...S.cats,cat]; save(); applyLayers(); renderLayers(); }
function switchTab(t){
  $$('#tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['route','plan','dec','gwent','layers'].forEach(x=>$('#tab-'+x).hidden=x!==t);
  if(t==='plan') renderPlanForm();
  if(t==='dec') renderDecisions();
  if(t==='gwent') renderColl();
}
function scrollToQuest(q,flash){
  let li=document.querySelector('.q[data-id="'+qid(q)+'"]');
  if(!li){ S.hideDone=false; $('#f-hidedone').checked=false; S.onlyDl=false; $('#f-deadline').checked=false; $('#search').value='';
    if(!S.types.includes(q.type)){ S.types.push(q.type); $$('.chip').forEach(c=>c.setAttribute('aria-pressed',S.types.includes(c.dataset.type))); }
    save(); renderRoute(); li=document.querySelector('.q[data-id="'+qid(q)+'"]'); }
  if(li){ const box=$('#tab-route'); box.scrollTop += li.getBoundingClientRect().top - box.getBoundingClientRect().top - $('#filters').offsetHeight - 44;
    if(flash){ li.animate([{backgroundColor:'rgba(214,169,64,.28)'},{backgroundColor:'transparent'}],{duration:1200}); } }
}

/* ---------- init ---------- */
(async function init(){
  try{
    [CFG,ITEMS,DECS,GW]=await Promise.all([loadJSON('data/maps.json'),loadJSON('data/quests.json'),loadJSON('data/decisions.json'),loadJSON('data/gwent.json')]);
  }catch(e){ document.body.innerHTML='<p style="padding:24px">Dáta sa nenačítali ('+esc(e.message)+'). Appka musí bežať cez web server (GitHub Pages alebo lokálne <code>python -m http.server</code>), nie otvorením súboru.</p>'; return; }
  QUESTS=ITEMS.filter(x=>x.kind==='quest');
  DECS.forEach(d=>{ (DEC_BY_Q[d.quest]=DEC_BY_Q[d.quest]||[]).push(d); });
  bind(); renderRoute(); worldState();
  await showMap(S.map);
  const ro=new ResizeObserver(()=>document.documentElement.style.setProperty('--ftop',$('#filters').offsetHeight+'px'));
  ro.observe($('#filters'));
  const c=currentQuest(); if(c) scrollToQuest(c);
})();
})();
