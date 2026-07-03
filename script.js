const products = (window.PRODUCTS || []).filter(p => p.location || p.shelf);
const byCode = new Map(products.map(p => [p.code.toUpperCase(), p]));
let current = null;
let bts = JSON.parse(localStorage.getItem('parisi_bts') || '[]');

const $ = id => document.getElementById(id);
const home = $('homeScreen'), result = $('resultScreen'), btsScreen = $('btsScreen');
const homeSearch = $('homeSearch'), resultSearch = $('resultSearch');

function norm(q){ return (q || '').toString().trim().toUpperCase().replace(/\s+/g,''); }
function isInStock(p){ return Number(p.stock || 0) > 0; }
function locationText(p){ return p.location || 'NO LOCATION'; }
function shelfText(p){ return p.shelf || 'NO SHELF'; }
function combinedLoc(p){
  if (p.location && p.shelf) return `${p.location} · ${p.shelf}`;
  if (p.location) return p.location;
  return p.shelf;
}
function show(screen){ [home,result,btsScreen].forEach(s=>s.classList.add('hidden')); screen.classList.remove('hidden'); window.scrollTo(0,0); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1300); }

function matches(q){
  q = norm(q);
  if(!q) return [];
  return products.filter(p => {
    const hay = [p.code,p.name,p.location,p.shelf,p.status,p.category,p.section].join(' ').toUpperCase();
    return hay.includes(q);
  }).slice(0,30);
}

function renderSuggestions(input, box){
  const list = matches(input.value).slice(0,7);
  if(!norm(input.value)){ box.classList.remove('show'); box.innerHTML=''; return; }
  box.classList.add('show');
  if(!list.length){ box.innerHTML = '<div class="emptySuggest">No product found.</div>'; return; }
  box.innerHTML = list.map((p,i)=>`<button class="suggestion" data-code="${p.code}">
    <span class="suggestionCode">${p.code}</span><span class="suggestionLoc">${combinedLoc(p)}</span>
    <span class="suggestionName">${p.name || 'No description'}</span>
  </button>`).join('');
  [...box.querySelectorAll('.suggestion')].forEach(btn=>btn.onclick=()=>openProduct(btn.dataset.code));
}

function searchFrom(input){
  const q = norm(input.value);
  if(!q) return;
  const exact = products.find(p => norm(p.code)===q || norm(p.location)===q || norm(p.shelf)===q);
  if(exact){ openProduct(exact.code); return; }
  const list = matches(q);
  show(result); resultSearch.value = input.value;
  renderResults(list);
}

function openProduct(code){
  const p = byCode.get(code.toUpperCase());
  if(!p) return;
  current = p;
  show(result);
  resultSearch.value = p.code;
  $('resultSuggestions').classList.remove('show');
  renderResults([p]);
}

function renderResults(list){
  $('foundMeta').textContent = `${list.length} PRODUCT${list.length===1?'':'S'} FOUND`;
  const el = $('resultContent');
  if(!list.length){ el.innerHTML = '<div class="notFound">No searchable product found.</div>'; return; }
  if(list.length > 1){
    el.innerHTML = `<div class="multiList">${list.map(p=>productCard(p,true)).join('')}</div>`;
    [...el.querySelectorAll('[data-open]')].forEach(b=>b.onclick=()=>openProduct(b.dataset.open));
    return;
  }
  el.innerHTML = productCard(list[0], false);
  bindCard(el, list[0]);
}

function productCard(p, compact){
  const good = isInStock(p);
  const stockLabel = good ? 'STOCKED' : 'NO STOCK';
  return `<article class="itemCard">
    <div class="productHead">
      <button class="codeTag" ${compact?`data-open="${p.code}"`:''}>${p.code}</button>
      <div class="prodName">${p.name || 'No description'}</div>
    </div>
    <div class="mainLocation" data-copy="${combinedLoc(p)}">
      <div class="label">SHELF LOCATION</div>
      <div class="bigLoc">${combinedLoc(p).replace('·',' ')}</div>
    </div>
    <div class="infoGrid">
      <div class="infoBox"><div class="label">STOCKING STATUS</div><div class="statusPill ${good?'':'bad'}">${stockLabel}</div></div>
      <div class="infoBox"><div class="label">AVAILABLE STOCK</div><div class="value ${good?'stockGood':'stockBad'}">${Number(p.stock||0)} units</div></div>
      <div class="infoBox" style="grid-column:1/-1"><div class="label">CATEGORY</div><div class="value">${p.category || p.section || 'TAPWARE'}</div></div>
    </div>
    ${compact?'':`<button class="btsBtn" id="addBts">BACK TO STOCK</button>`}
  </article>`;
}
function bindCard(el,p){
  const loc = el.querySelector('[data-copy]'); if(loc) loc.onclick=()=>{navigator.clipboard?.writeText(loc.dataset.copy); toast('Copied');};
  const b = $('addBts'); if(b) b.onclick=()=>addBts(p);
}
function addBts(p){
  if(!bts.some(x=>x.code===p.code)) bts.push(p);
  localStorage.setItem('parisi_bts', JSON.stringify(bts));
  toast('Added to Back to Stock');
}
function renderBts(){
  show(btsScreen);
  const el = $('btsContent');
  if(!bts.length){ el.innerHTML='<div class="notFound">No items added yet.</div>'; return; }
  const groups = {};
  bts.forEach(p=>{ const key=p.location || 'NO LOCATION'; (groups[key] ||= []).push(p); });
  const keys=Object.keys(groups).sort((a,b)=> a.localeCompare(b, undefined, {numeric:true}));
  el.innerHTML = keys.map(k=>`<div class="btsGroup"><div class="btsGroupHead"><div class="btsLoc">${k}</div><div class="btsCount">${groups[k].length} item${groups[k].length>1?'s':''}</div></div>${groups[k].map(p=>`<div class="btsItem"><strong>${p.code}</strong><button class="remove" data-remove="${p.code}">REMOVE</button><small>${p.name} ${p.shelf?`· Shelf ${p.shelf}`:''}</small></div>`).join('')}</div>`).join('');
  [...el.querySelectorAll('[data-remove]')].forEach(b=>b.onclick=()=>{ bts=bts.filter(x=>x.code!==b.dataset.remove); localStorage.setItem('parisi_bts',JSON.stringify(bts)); renderBts(); });
}

homeSearch.addEventListener('input',()=>renderSuggestions(homeSearch,$('homeSuggestions')));
resultSearch.addEventListener('input',()=>renderSuggestions(resultSearch,$('resultSuggestions')));
$('homeGo').onclick=()=>searchFrom(homeSearch); $('resultGo').onclick=()=>searchFrom(resultSearch);
homeSearch.addEventListener('keydown',e=>{if(e.key==='Enter') searchFrom(homeSearch)});
resultSearch.addEventListener('keydown',e=>{if(e.key==='Enter') searchFrom(resultSearch)});
$('backHome').onclick=()=>show(home); $('backFromBts').onclick=()=>show(home); $('openBts').onclick=renderBts;
$('clearBts').onclick=()=>{bts=[];localStorage.setItem('parisi_bts','[]');renderBts();};
$('exportBts').onclick=()=>{ const rows=[['Code','Name','Location','Shelf','Stock']].concat(bts.map(p=>[p.code,p.name,p.location,p.shelf,p.stock])); const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='back-to-stock.csv'; a.click(); };

$('ocrBtn').onclick=()=>$('ocrInput').click();
$('ocrInput').onchange=async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  if(!window.Tesseract){ $('ocrStatus').textContent='OCR library not loaded. Try again online.'; return; }
  $('ocrStatus').textContent='Reading text...';
  try{
    const {data:{text}} = await Tesseract.recognize(file,'eng');
    const candidate = cleanOcr(text);
    $('ocrStatus').textContent = candidate ? `Detected: ${candidate}` : 'No product code detected.';
    if(candidate){ homeSearch.value=candidate; searchFrom(homeSearch); }
  }catch(err){ $('ocrStatus').textContent='OCR failed. Try a clearer photo.'; }
  e.target.value='';
};
function cleanOcr(text){
  const raw=(text||'').toUpperCase().replace(/[\s_]+/g,'');
  const m=raw.match(/[A-Z]{1,3}[0-9O][.][0-9O]{2}[-.]?[A-Z0-9O.\-]{0,12}/) || raw.match(/[A-Z]{1,3}[.][0-9O]{2}[-.]?[A-Z0-9O.\-]{0,12}/);
  let s=(m?m[0]:raw).replace(/O/g,'0').replace(/[^A-Z0-9.\-]/g,'');
  return s.slice(0,24);
}
