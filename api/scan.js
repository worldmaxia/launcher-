import dns from 'node:dns/promises';
import net from 'node:net';

const UA='WorldMaxAI-AIPresenceLab/0.2';
const MAX_PAGES=8;

function privateIp(ip){
  const v=net.isIP(ip);
  if(v===4){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a>=224}
  if(v===6){const s=ip.toLowerCase();return s==='::'||s==='::1'||/^f[cd]/.test(s)||/^fe[89ab]/.test(s)}
  return true;
}
async function safeUrl(input){
  const raw=String(input||'').trim(); if(!raw) throw Error('Inserisci un URL.');
  const u=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw Error('URL non ammesso.');
  if(u.port&&!['80','443'].includes(u.port)) throw Error('Porte personalizzate non ammesse.');
  if(u.hostname==='localhost'||/\.(local|localhost|internal|home|lan)$/i.test(u.hostname)) throw Error('Host locale non ammesso.');
  if(net.isIP(u.hostname)){if(privateIp(u.hostname)) throw Error('IP privato non ammesso.');}
  else {const r=await dns.lookup(u.hostname,{all:true,verbatim:true}); if(!r.length||r.some(x=>privateIp(x.address))) throw Error('Dominio non pubblico.');}
  u.hash=''; return u;
}
async function getText(input,max=1500000){
  let u=await safeUrl(input);
  for(let i=0;i<5;i++){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),8000); let r;
    try{r=await fetch(u,{redirect:'manual',signal:c.signal,headers:{'user-agent':UA,accept:'text/html,application/xml,text/xml,text/plain,application/json;q=.8,*/*;q=.1'}})}finally{clearTimeout(t)}
    if([301,302,303,307,308].includes(r.status)){const l=r.headers.get('location');if(!l)throw Error('Redirect non valido.');u=await safeUrl(new URL(l,u).href);continue}
    const len=Number(r.headers.get('content-length')||0); if(len>max) throw Error(`Risorsa troppo grande (${len} bytes).`);
    const text=(await r.text()).slice(0,max); return {status:r.status,ok:r.ok,url:u.href,type:r.headers.get('content-type')||'',text};
  }
  throw Error('Troppi redirect.');
}
async function maybe(url,max){try{return await getText(url,max)}catch(e){return {status:0,ok:false,url:String(url),type:'',text:'',error:e.message}}}
const clean=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();
const one=(h,r)=>{const m=r.exec(h);return m?clean(m[1]):''};
function attr(tag,n){const m=new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i').exec(tag);return m?.[1]??m?.[2]??m?.[3]??''}
function meta(h,k,v){for(const t of h.match(/<meta\b[^>]*>/gi)||[])if(attr(t,k).toLowerCase()===v.toLowerCase())return attr(t,'content');return ''}
function jsonld(h){
  const types=new Set(),names=new Set(); let valid=0,bad=0,productEntities=0,businessEntities=0;
  for(const m of h.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const x=JSON.parse(m[1]);valid++; const walk=o=>{if(Array.isArray(o))return o.forEach(walk);if(o&&typeof o==='object'){
      const raw=o['@type'],ts=(Array.isArray(raw)?raw:[raw]).filter(Boolean).map(String); ts.forEach(z=>types.add(z));
      if(typeof o.name==='string'&&o.name.trim())names.add(o.name.trim());
      if(ts.some(z=>/Product|Offer|ItemList|Service/i.test(z)))productEntities++;
      if(ts.some(z=>/Organization|LocalBusiness|Corporation|Store|Hotel|LodgingBusiness|Restaurant/i.test(z)))businessEntities++;
      Object.values(o).forEach(walk);
    }}; walk(x);}catch{bad++}
  }
  return {valid,bad,types:[...types],names:[...names].slice(0,20),productEntities,businessEntities};
}
function links(h,base){const out=new Set(),b=new URL(base);for(const m of h.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)){try{const u=new URL(m[1]||m[2]||m[3],b);u.hash='';if(u.hostname===b.hostname&&['http:','https:'].includes(u.protocol))out.add(u.href)}catch{}}return [...out]}
function page(h,url){
  const text=clean(h),j=jsonld(h),title=one(h,/<title\b[^>]*>([\s\S]*?)<\/title>/i),desc=meta(h,'name','description');
  const prices=text.match(/(?:€|EUR\s?|\$|USD\s?|£|GBP\s?)\s?\d[\d.,]*/gi)||[];
  const emails=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  const phones=text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g)||[];
  const acts=[...h.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)].map(m=>clean(m[1])).filter(x=>/prenot|book|acquist|buy|cart|preventiv|quote|contact|contatt|order|reserve|availability|disponibil|aggiungi al carrello|checkout/i.test(x));
  return {url,title,desc,text:text.slice(0,5000),textLength:text.length,json:j,links:links(h,url),prices:[...new Set(prices)].slice(0,30),emails:[...new Set(emails)].slice(0,10),phones:[...new Set(phones.map(x=>x.trim()))].slice(0,10),acts:[...new Set(acts)].slice(0,25),forms:(h.match(/<form\b/gi)||[]).length,h1:one(h,/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)};
}
function robots(t,ua='*'){
  const lines=t.split(/\r?\n/).map(x=>x.replace(/#.*$/,'').trim()).filter(Boolean),groups=[];let g=null;const sitemaps=[];
  for(const l of lines){const i=l.indexOf(':');if(i<0)continue;const k=l.slice(0,i).trim().toLowerCase(),v=l.slice(i+1).trim();if(k==='sitemap'){if(v)sitemaps.push(v);continue}if(k==='user-agent'){if(!g||g.rules.length){g={agents:[],rules:[]};groups.push(g)}g.agents.push(v.toLowerCase())}else if((k==='allow'||k==='disallow')&&g)g.rules.push({type:k,path:v})}
  const exact=groups.filter(x=>x.agents.includes(ua.toLowerCase())),fallback=groups.filter(x=>x.agents.includes('*'));
  return {rules:(exact.length?exact:fallback).flatMap(x=>x.rules),sitemaps:[...new Set(sitemaps)]};
}
function blockedAll(r){return r.rules.some(x=>x.type==='disallow'&&x.path==='/')}
function xmlLocs(t,root){const out=[];for(const m of t.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi))try{const u=new URL(clean(m[1]),root);if(u.hostname===new URL(root).hostname)out.push(u.href)}catch{}return [...new Set(out)]}
async function discoverSitemap(base,rp){
  const declared=(rp.sitemaps||[]).filter(Boolean); const guesses=[new URL('/sitemap.xml',base).href,new URL('/sitemap_index.xml',base).href];
  const candidates=[...new Set([...declared,...guesses])];
  const attempts=[]; let selected=null, urls=[];
  for(const u of candidates.slice(0,4)){
    let safe; try{safe=new URL(u,base); if(safe.hostname!==base.hostname)continue}catch{continue}
    const r=await maybe(safe.href,2200000); const isXml=r.status===200&&(/xml/i.test(r.type)||/<(?:urlset|sitemapindex)\b/i.test(r.text));
    attempts.push({url:safe.href,status:r.status,error:r.error||null,isXml});
    if(!isXml)continue;
    const locs=xmlLocs(r.text,base); selected=safe.href;
    if(/<sitemapindex\b/i.test(r.text)){
      const childLocs=locs.slice(0,3); const childResults=await Promise.all(childLocs.map(x=>maybe(x,2200000)));
      for(const c of childResults) if(c.status===200) urls.push(...xmlLocs(c.text,base));
      if(!urls.length) urls=locs;
    } else urls=locs;
    break;
  }
  return {declared,selected,urls:[...new Set(urls)],attempts,detected:Boolean(selected)};
}
function classify(pages){
  const types=new Set(pages.flatMap(p=>p.json.types)); const text=pages.map(p=>`${p.title} ${p.h1} ${p.desc} ${p.text}`).join(' ').toLowerCase();
  const prices=pages.reduce((n,p)=>n+p.prices.length,0), actions=pages.reduce((n,p)=>n+p.acts.length,0), products=pages.reduce((n,p)=>n+p.json.productEntities,0);
  const scores={commerce:0,hospitality:0,restaurant:0,professional:0}; const evidence=[];
  const hasType=re=>[...types].some(x=>re.test(x));
  if(hasType(/Product|Offer|ItemList|Store|OnlineStore/i)){scores.commerce+=8;evidence.push('schema commerciale')}
  if(products>0){scores.commerce+=4;evidence.push('entità Product/Offer/Service')}
  if(prices>=2)scores.commerce+=3; if(actions>=1)scores.commerce+=2;
  if(/\b(shop|shopping|catalogo|prodotti|products|carrello|checkout|acquista|buy)\b/i.test(text))scores.commerce+=3;
  if(hasType(/Hotel|LodgingBusiness|HotelRoom|Accommodation/i)){scores.hospitality+=10;evidence.push('schema hospitality')}
  if(/\b(hotel|albergo|check[ -]?in|check[ -]?out|camera d['’]hotel|room booking|prenota una camera)\b/i.test(text))scores.hospitality+=4;
  if(hasType(/Restaurant|FoodEstablishment|Menu/i)){scores.restaurant+=10;evidence.push('schema ristorazione')}
  if(/\b(ristorante|restaurant|menu|prenota tavolo|table booking)\b/i.test(text))scores.restaurant+=4;
  if(hasType(/ProfessionalService|LegalService|AccountingService|MedicalBusiness/i))scores.professional+=9;
  if(/\b(consulenza|studio professionale|avvocato|commercialista|consulente)\b/i.test(text))scores.professional+=4;
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]); const [kind,top]=ranked[0],second=ranked[1][1];
  if(top<4)return {type:'sito aziendale / informativo',confidence:'low',scores,evidence:['nessun segnale verticale forte']};
  const labels={commerce:'e-commerce / catalogo',hospitality:'hotel / hospitality',restaurant:'ristorazione',professional:'servizi professionali'};
  return {type:labels[kind],confidence:top-second>=4?'high':'medium',scores,evidence};
}
async function persist(report){const b=process.env.SUPABASE_URL,k=process.env.SUPABASE_PUBLISHABLE_KEY;if(!b||!k)return {enabled:false,ok:false};try{const r=await fetch(`${b.replace(/\/$/,'')}/rest/v1/ai_presence_scans`,{method:'POST',headers:{apikey:k,authorization:`Bearer ${k}`,'content-type':'application/json',prefer:'return=minimal'},body:JSON.stringify({url:report.url,hostname:report.hostname,site_type:report.siteType,visibility_score:report.scores.aiVisibility,readiness_score:report.scores.agentReadiness,report})});return {enabled:true,ok:r.ok,status:r.status}}catch{return {enabled:true,ok:false,status:0}}}

export default async function handler(req,res){
  res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');
  if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Usa POST.'}))}
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}),root=await safeUrl(body.url),home=await getText(root.href);
    if(!home.ok||!/html/i.test(home.type||'text/html'))throw Error(`Homepage non analizzabile (HTTP ${home.status}).`);
    const base=new URL(home.url),rr=await maybe(new URL('/robots.txt',base).href,300000),rp=rr.status===200?robots(rr.text):{rules:[],sitemaps:[]},oai=rr.status===200?robots(rr.text,'oai-searchbot'):{rules:[],sitemaps:[]};
    const sm=await discoverSitemap(base,rp);
    const homeLinks=links(home.text,base.href); const pageCandidates=[...new Set([...sm.urls.filter(x=>!(/\.xml($|\?)/i.test(x))),...homeLinks])].filter(x=>x!==base.href).slice(0,MAX_PAGES-1);
    const children=await Promise.all(pageCandidates.map(x=>maybe(x,1000000)));
    const pages=[page(home.text,base.href),...children.filter(x=>x.status===200&&(/html/i.test(x.type)||/<html\b/i.test(x.text))).map(x=>page(x.text,x.url))];
    const [ll,ac,oa]=await Promise.all([maybe(new URL('/llms.txt',base).href,250000),maybe(new URL('/.well-known/agent-card.json',base).href,250000),maybe(new URL('/openapi.json',base).href,400000)]);
    const types=[...new Set(pages.flatMap(p=>p.json.types))],names=[...new Set(pages.flatMap(p=>p.json.names))],prices=[...new Set(pages.flatMap(p=>p.prices))],emails=[...new Set(pages.flatMap(p=>p.emails))],phones=[...new Set(pages.flatMap(p=>p.phones))],acts=[...new Set(pages.flatMap(p=>p.acts))];
    const structured=pages.some(p=>p.json.valid),business=pages.some(p=>p.json.businessEntities>0)||types.some(x=>/Organization|LocalBusiness|Corporation|Store|Hotel|Restaurant/i.test(x)),product=pages.some(p=>p.json.productEntities>0)||types.some(x=>/Product|Service|Offer|ItemList/i.test(x));
    const contact=emails.length||phones.length,actions=acts.length||pages.some(p=>p.forms),textLen=pages.reduce((a,p)=>a+p.textLength,0),classification=classify(pages);
    const sitemapSignal=sm.detected||sm.declared.length>0;
    let vis=(base.protocol==='https:'?10:4)+(rr.status===200&&!blockedAll(rp)?12:5)+(sitemapSignal?10:0)+(pages[0].title?8:0)+(pages[0].desc?8:0)+(pages[0].h1?5:0)+(structured?18:0)+(textLen>1800?10:textLen>600?5:0)+(contact?6:0)+(ll.status===200?5:0);
    let ready=(business?16:structured?7:0)+(product?16:/\b(prodott|serviz|shop|prenot|booking)\b/i.test(pages.map(p=>p.text).join(' '))?8:0)+(prices.length?10:0)+(contact?9:0)+(actions?14:0)+(ll.status===200?6:0)+(ac.status===200?8:0)+(oa.status===200?12:0);
    vis=Math.min(100,vis);ready=Math.min(100,ready);
    const issues=[]; const add=(c,severity,title,detail,autoFix,phase='standard',evidence=null)=>c&&issues.push({severity,title,detail,autoFix,phase,evidence});
    add(rr.status!==200,'medium','robots.txt non verificato','Lo scanner non è riuscito a confermare robots.txt; non significa necessariamente che sia assente.',true,'standard',rr.error||`HTTP ${rr.status}`);
    add(blockedAll(rp),'critical','Crawling globale bloccato','robots.txt contiene Disallow: /.',false);
    add(blockedAll(oai),'high','OAI-SearchBot risulta bloccato','Verificare che il blocco sia intenzionale.',false);
    add(!sm.detected&&sm.declared.length===0,'medium','Sitemap non rilevata','Nessuna sitemap è stata dichiarata in robots.txt né confermata nei percorsi standard controllati. È una rilevazione, non una prova di assenza.',true,'standard',sm.attempts);
    add(!sm.detected&&sm.declared.length>0,'low','Sitemap dichiarata ma non analizzata','robots.txt dichiara una sitemap, ma lo scanner non è riuscito a leggerla completamente. Non viene considerata assente.',false,'standard',sm.declared);
    add(!pages[0].title,'high','Title non rilevato','La homepage analizzata non ha esposto un title HTML leggibile.',true);
    add(!pages[0].desc,'medium','Meta description non rilevata','La homepage analizzata non ha esposto una meta description leggibile.',true);
    add(!structured,'high','JSON-LD non rilevato','Nessun JSON-LD valido è emerso dal campione analizzato; altri formati o pagine potrebbero contenerlo.',true);
    add(!business,'medium','Identità business non confermata','Il campione non espone un tipo business strutturato riconosciuto. Non equivale a dire che l’identità sia assente.',true,'standard',types);
    add(!product&&/\b(prodott|serviz|shop|prenot|booking)\b/i.test(pages.map(p=>p.text).join(' ')),'medium','Offerta commerciale non confermata strutturalmente','Il testo suggerisce prodotti/servizi, ma il campione non espone entità Product/Service/Offer riconosciute.',true);
    add(!contact,'low','Contatti non rilevati nel campione','Email o telefono non sono emersi dalle pagine campionate; possono esistere altrove.',false);
    add(!actions,'low','Azioni commerciali non rilevate','Nel campione non emergono chiaramente contatto, prenotazione, acquisto o preventivo.',false);
    add(ll.status!==200,'low','llms.txt non rilevato','Segnale sperimentale: non è un ranking signal garantito.',true,'experimental');
    add(ac.status!==200,'low','Agent Card non rilevata','Rilevante solo se il business espone vere capacità agentiche.',false,'future');
    const rank={critical:0,high:1,medium:2,low:3};issues.sort((a,b)=>rank[a.severity]-rank[b.severity]);
    const siteType=classification.type,identity={name:names.find(x=>/ikea/i.test(x))||pages[0].title||base.hostname,description:pages[0].desc||pages[0].h1||'',siteType,emails,phones};
    const seed={version:'0.2-experimental',source:base.href,identity,classification,discovery:{sitemap:sm.selected||sm.declared[0]||null,llms:ll.status===200?new URL('/llms.txt',base).href:null,agentCard:ac.status===200?new URL('/.well-known/agent-card.json',base).href:null},capabilitiesObserved:{contact:Boolean(contact),forms:pages.some(p=>p.forms),commercialActions:acts,pricesObserved:prices.slice(0,10)},note:'Preview diagnostica: non viene installata automaticamente.'};
    const llmsPreview=`# ${identity.name}\n\n> ${identity.description||'Descrizione da verificare.'}\n\n## Official site\n- ${base.href}\n\n## Key pages\n${pages.slice(0,8).map(p=>`- ${p.title||p.url}: ${p.url}`).join('\n')}\n\n## Machine notes\n- Site type: ${siteType}\n- Classification confidence: ${classification.confidence}\n- Structured types: ${types.join(', ')||'none detected'}\n- Generated preview: verify before publication.\n`;
    const report={version:'0.2.0',scannedAt:new Date().toISOString(),url:base.href,hostname:base.hostname,siteType,classification,scores:{aiVisibility:vis,agentReadiness:ready,methodology:'heuristic-v2'},crawl:{pagesAnalyzed:pages.length,pageUrls:pages.map(p=>p.url),robotsStatus:rr.status,sitemapDetected:sm.detected,sitemapDeclared:sm.declared,sitemapSelected:sm.selected,sitemapUrlsFound:sm.urls.length,sitemapAttempts:sm.attempts,llmsStatus:ll.status,agentCardStatus:ac.status,openApiStatus:oa.status},extracted:{title:pages[0].title,description:pages[0].desc,h1:pages[0].h1,schemaTypes:types,schemaNames:names,prices,emails,phones,observedActions:acts,internalLinks:new Set(pages.flatMap(p=>p.links)).size,totalTextCharacters:textLen},issues,summary:{totalIssues:issues.length,autoFixable:issues.filter(x=>x.autoFix).length,standardIssues:issues.filter(x=>x.phase==='standard').length,experimentalIssues:issues.filter(x=>x.phase!=='standard').length},generated:{seedPreview:seed,llmsPreview},notes:['I punteggi V1 sono euristiche trasparenti, non ranking ufficiali di OpenAI/Google.','Le diagnosi distinguono ora tra “non rilevato” e “assente”.','llms.txt e Agent Card sono segnali sperimentali/futuri, non garanzie di visibilità.','La V1 non modifica il sito: analizza e genera preview.']};
    report.persistence=await persist(report);res.statusCode=200;res.end(JSON.stringify(report));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e?.message||'Scansione fallita.'}))}
}
