const fs=require('fs'), path=require('path'), vm=require('vm');
const path0=require('path'); const R=path0.join(__dirname,'..','..','files'); const OUT=path0.join(__dirname,'out'); fs.mkdirSync(OUT,{recursive:true});
const maps={w:'white_orchard',v:'hos_velen',g:'gaunter',s:'skellige',t:'toussaint',k:'kaer_morhen',f:'fables',i:'isle_mists'};
const general=JSON.parse(fs.readFileSync(`${R}/locales/en/general.json`));
function get(o,key){return key.split('.').reduce((a,k)=>a&&typeof a==='object'?a[k]:undefined,o)}
const missing=new Set();
const out={};
for(const [code,mp] of Object.entries(maps)){
  const ns=JSON.parse(fs.readFileSync(`${R}/locales/en/${code}.json`));
  const nsAll={}; for(const [c2] of Object.entries(maps)) nsAll[c2]=JSON.parse(fs.readFileSync(`${R}/locales/en/${c2}.json`));
  const t=(key,opts)=>{let k2=key, src=ns; const m=/^([a-z]+):(.+)$/.exec(key); if(m&&nsAll[m[1]]){src=nsAll[m[1]];k2=m[2];} else if(m&&m[1]==='general'){src=general;k2=m[2];}
    let v=get(src,k2); if(v===undefined) v=get(general,k2);
    if(v===undefined){missing.add(key); v=key;}
    if(typeof v!=='string') v=JSON.stringify(v);
    if(opts) for(const [k,val] of Object.entries(opts)) v=v.split(`__${k}__`).join(val);
    return v;};
  const sandbox={window:{},L:{latLng:(a,b)=>[a,b]},$:{t},console};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(`${R}/scripts/mapdata-${mp}.js`,'utf8'),sandbox);
  const w=sandbox.window, data=w['mapdata_'+mp];
  const cats={};
  for(const [cat,items] of Object.entries(data)){
    cats[cat]=[];
    for(const it of items){
      for(const c of it.coords){
        cats[cat].push({lat:c[0],lng:c[1],label:(it.label||'').trim(),title:(it.popupTitle||it.label||'').trim(),popup:(it.popup||'').trim()});
      }
    }
  }
  const tilesPng=[];
  (function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f); if(fs.statSync(p).isDirectory()) walk(p); else if(f.endsWith('.png')) tilesPng.push(path.relative(`${R}/maps/${mp}`,p).replace(/\.png$/,''));}})(`${R}/maps/${mp}`);
  const zooms=fs.readdirSync(`${R}/maps/${mp}`).map(Number).sort((a,b)=>a-b);
  out[mp]={code,sw:w.map_sWest,ne:w.map_nEast,center:w.map_center,minZoom:w.map_minZoom,maxZoom:w.map_mZoom,zoom:w.map_Zoom,
    simple:['hos_velen','gaunter','toussaint','kaer_morhen'].includes(mp),nativeZooms:[zooms[0],zooms[zooms.length-1]],png:tilesPng,cats};
  const n=Object.values(cats).reduce((a,b)=>a+b.length,0);
  console.log(mp,'markers',n,'cats',Object.keys(cats).length,'png',tilesPng.length,'zooms',zooms.join(','),'bounds',w.map_sWest,w.map_nEast);
}
const real=[...missing].filter(k=>/^[\w:]+(\.[\w]+)+$/.test(k)); console.log('missing keylike',real.length,real.slice(0,20));
fs.writeFileSync(OUT+'/markers_all.json',JSON.stringify(out));
const labels=JSON.parse(fs.readFileSync(`${R}/locales/en/general.json`)).sidebar;
fs.writeFileSync(OUT+'/catnames.json',JSON.stringify(labels,null,1));
