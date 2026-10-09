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
const EXPLORE = ['abandoned','banditcamp','guarded','hidden','monsterden','monsternest','pid','pop','smugglers','spoils',
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
  openSeals: new Set()
};
const save = () => {
  store.set('done',[...S.done]); store.set('mk',[...S.mk]); store.set('dec',S.dec); store.set('types',S.types);
  store.set('cats',S.cats); store.set('hideDone',S.hideDone); store.set('hideMk',S.hideMk); store.set('spoil',S.spoil); store.set('map',S.map); store.set('lvl',S.lvl); store.set('lvFilter',S.lvFilter);
};

/* ---------- data ---------- */
let CFG, ITEMS, QUESTS, DECS, DEC_BY_Q = {};
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
function markerIcon(cat,label,lv){
  const ic=iconFor(cat,label);
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
      const mk = L.marker([lat,lng],{icon:markerIcon(cat,label,lv),riseOnHover:true,keyboard:false});
      mk._w3 = {k,cat,i,label,popup,lv};
      if(S.mk.has(k)) mk.setOpacity(.28);
      mk.bindTooltip(esc(label)+(lv!=null?' · '+(typeof lv==='number'?'úr. '+lv:ZONE[lv].t):''),{direction:'top',offset:[0,-12]});
      mk.bindPopup(()=>popupHtml(mk),{maxWidth:320});
      mk.on('contextmenu',()=>toggleMarker(mk));
      g.addLayer(mk);
    });
    layers[cat]=g;
  }
  applyLayers();
  map.on('popupopen',e=>{
    const el=e.popup.getElement(); if(!el) return;
    el.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',ev=>{
      ev.preventDefault(); const p=a.getAttribute('href').slice(1).split('/').map(Number);
      if(p.length===3 && p.every(n=>!isNaN(n))) map.flyTo([p[1],p[2]],Math.min(p[0],cfg.maxZoom));
    }));
    const b=el.querySelector('.mkdone'); if(b) b.addEventListener('click',()=>{ toggleMarker(e.popup._source); map.closePopup(); });
  });
  renderLayers();
  if(after) after();
}

function popupHtml(mk){
  const d=mk._w3, done=S.mk.has(d.k);
  const name = (CFG.catNames[d.cat]||d.cat);
  const lt=lvText(d.lv);
  return '<h4>'+esc(d.label)+'</h4>'+(lt?'<p class="plv '+lvClass(d.lv)+'">'+esc(lt)+'</p>':'')+'<div class="pb">'+(d.popup||'<span style="color:var(--muted)">'+esc(name)+'</span>')+'</div>'+
    '<button type="button" class="mkdone'+(done?' on':'')+'">'+(done?'Hotové ✓ (zrušiť)':'Označiť ako hotové')+'</button>';
}
function toggleMarker(mk){
  const k=mk._w3.k;
  if(S.mk.has(k)){ S.mk.delete(k); mk.setOpacity(1); } else { S.mk.add(k); mk.setOpacity(.28); }
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
  for(const g of Object.values(layers)) g.eachLayer(mk=>{ if(mk._w3.lv!=null) mk.setIcon(markerIcon(mk._w3.cat,mk._w3.label,mk._w3.lv)); });
  applyLayers();
}
function renderLayers(){
  const ul=$('#layers'); if(!curData) return;
  const cats=Object.keys(curData).sort((a,b)=>(CFG.catNames[a]||a).localeCompare(CFG.catNames[b]||b));
  ul.innerHTML = cats.map(cat=>{
    const tot=curData[cat].length, dn=curData[cat].filter(m=>S.mk.has(mkKey(S.map,cat,m[0],m[1]))).length;
    const ic=CFG.icons[cat]||CFG.icons.poi;
    return '<li data-cat="'+cat+'" class="'+(S.cats.includes(cat)?'':'off')+'" role="switch" tabindex="0" aria-checked="'+S.cats.includes(cat)+'">'+
      '<img alt="" src="'+BASE+'/files/images/icons/'+ic[0]+'">'+esc(CFG.catNames[cat]||cat)+'<span class="cnt">'+(dn?dn+' / ':'')+tot+'</span></li>';
  }).join('');
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
  if(q.level!=null) m+='<span class="lvl">úr. '+q.level+'</span>';
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
  return h+'</li>';
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
function updateHeader(){
  const tot=QUESTS.length, dn=QUESTS.filter(q=>S.done.has(qid(q))).length;
  $('#pcount').textContent=dn+' / '+tot;
  $('#pfill').style.width=(tot?dn/tot*100:0)+'%';
  const c=currentQuest();
  $('#nextname').textContent=c?c.name:'Všetko hotové';
  $('#nextlvl').textContent=c&&c.level!=null?'úr. '+c.level:'';
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
    const sb=e.target.closest('.seal>button'); if(sb){ const s=sb.parentElement, id=s.dataset.dec, body=s.querySelector('.sb');
      body.hidden=!body.hidden; sb.setAttribute('aria-expanded',!body.hidden); body.hidden?S.openSeals.delete(id):S.openSeals.add(id); return; }
  });
  document.addEventListener('click',e=>{ const sp=e.target.closest('.sp'); if(sp && !document.body.classList.contains('spoilers')) sp.classList.add('show'); });
  document.addEventListener('change',e=>{
    const r=e.target.closest('input[type=radio][data-dec]'); if(!r) return;
    S.dec[r.dataset.dec]=r.value; save();
    if(!$('#tab-dec').hidden){ renderDecisions(); } else { const y=$('#tab-route').scrollTop; renderRoute(); $('#tab-route').scrollTop=y; worldState(); }
  });
  $('#declist').addEventListener('click',e=>{ const b=e.target.closest('[data-goto]'); if(!b) return;
    switchTab('route'); const q=QUESTS.find(x=>x.name===b.dataset.goto); if(q) scrollToQuest(q,true); });

  $('#nextbtn').addEventListener('click',()=>{ const q=currentQuest(); if(!q) return; switchTab('route'); scrollToQuest(q,true); focusQuest(q); });

  $('#tabs').addEventListener('click',e=>{ const b=e.target.closest('[data-tab]'); if(b) switchTab(b.dataset.tab); });

  $('#layers').addEventListener('click',e=>{ const li=e.target.closest('li[data-cat]'); if(li) toggleCat(li.dataset.cat); });
  $('#layers').addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.dataset.cat){ e.preventDefault(); toggleCat(e.target.dataset.cat); } });
  $$('.lbtns button').forEach(b=>b.addEventListener('click',()=>{
    const p=b.dataset.preset; S.cats = p==='all'?Object.keys(CFG.icons).filter(k=>!k.endsWith('_ug')):p==='none'?[]:EXPLORE.slice();
    save(); applyLayers(); renderLayers(); }));
  const li=$('#mylvl'); if(S.lvl!=null) li.value=S.lvl;
  li.addEventListener('input',()=>{ const v=parseInt(li.value,10); S.lvl=isNaN(v)?null:Math.max(1,Math.min(100,v)); save(); refreshIcons(); });
  $$('input[name=lvf]').forEach(r=>{ r.checked=r.value===S.lvFilter; r.addEventListener('change',()=>{ S.lvFilter=r.value; save(); applyLayers(); }); });
  const hm=$('#f-hidemk'); hm.checked=S.hideMk; hm.addEventListener('change',()=>{S.hideMk=hm.checked;save();applyLayers();});

  $('#exportbtn').addEventListener('click',()=>{
    const data={v:1,done:[...S.done],mk:[...S.mk],dec:S.dec,date:new Date().toISOString()};
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    a.download='witcher3-postup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  $('#importfile').addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    try{ const d=JSON.parse(await f.text()); if(!Array.isArray(d.done)) throw 0;
      S.done=new Set(d.done); S.mk=new Set(d.mk||[]); S.dec=d.dec||{}; save(); renderRoute(); renderDecisions(); showMap(S.map); toast('Záloha načítaná.');
    }catch(err){ toast('Súbor nie je záloha z tejto appky.'); }
    e.target.value='';
  });
}
function toggleCat(cat){ S.cats=S.cats.includes(cat)?S.cats.filter(c=>c!==cat):[...S.cats,cat]; save(); applyLayers(); renderLayers(); }
function switchTab(t){
  $$('#tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['route','dec','layers'].forEach(x=>$('#tab-'+x).hidden=x!==t);
  if(t==='dec') renderDecisions();
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
    [CFG,ITEMS,DECS]=await Promise.all([loadJSON('data/maps.json'),loadJSON('data/quests.json'),loadJSON('data/decisions.json')]);
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
