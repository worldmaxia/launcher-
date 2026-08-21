export function classifySite(pages){
  const types=new Set(pages.flatMap(p=>p.json?.types||[]));
  const text=pages.map(p=>`${p.title||''} ${p.h1||''} ${p.desc||''} ${p.text||''}`).join(' ').toLowerCase();
  const prices=pages.reduce((n,p)=>n+(p.prices?.length||0),0),actions=pages.reduce((n,p)=>n+(p.acts?.length||0),0),products=pages.reduce((n,p)=>n+(p.json?.productEntities||0),0);
  const s={commerce:0,hospitality:0,restaurant:0,professional:0},evidence=[];
  const has=re=>[...types].some(x=>re.test(x));
  if(has(/Product|Offer|ItemList|Store|OnlineStore/i)){s.commerce+=8;evidence.push('schema commerciale')}
  if(products>0){s.commerce+=4;evidence.push('entita Product/Offer/Service')}
  if(prices>=2)s.commerce+=3;if(actions>=1)s.commerce+=2;
  if(/\b(shop|shopping|catalogo|prodotti|products|carrello|checkout|acquista|buy|add to cart)\b/i.test(text))s.commerce+=3;
  if(has(/Hotel|LodgingBusiness|HotelRoom|Accommodation/i)){s.hospitality+=10;evidence.push('schema hospitality')}
  if(/\b(hotel|albergo|check[ -]?in|check[ -]?out|camera d['’]hotel|room booking|prenota una camera)\b/i.test(text))s.hospitality+=4;
  if(has(/Restaurant|FoodEstablishment|Menu/i)){s.restaurant+=10;evidence.push('schema ristorazione')}
  if(/\b(ristorante|restaurant|prenota tavolo|table booking)\b/i.test(text))s.restaurant+=4;
  if(has(/ProfessionalService|LegalService|AccountingService|MedicalBusiness/i)){s.professional+=9;evidence.push('schema servizi professionali')}
  if(/\b(consulenza|studio professionale|avvocato|commercialista|consulente)\b/i.test(text))s.professional+=4;
  const rank=Object.entries(s).sort((a,b)=>b[1]-a[1]),[kind,top]=rank[0],second=rank[1][1];
  if(top<4)return{type:'sito aziendale / informativo',confidence:'low',scores:s,evidence:['nessun segnale verticale forte']};
  const labels={commerce:'e-commerce / catalogo',hospitality:'hotel / hospitality',restaurant:'ristorazione',professional:'servizi professionali'};
  return{type:labels[kind],confidence:top-second>=4?'high':'medium',scores:s,evidence};
}

export function buildAccessMap({html=true,structured=false,business=false,product=false,prices=0,actions=0,forms=false,openApi=false,agentCard=false,ucp=false}){
  const paths=[
    {level:5,name:'Transactional',standard:'UCP / transactional capability',status:ucp?'available':'missing',evidence:ucp?'UCP endpoint detected':'no UCP endpoint detected'},
    {level:4,name:'Callable',standard:'OpenAPI / A2A',status:(openApi||agentCard)?'available':'missing',evidence:[openApi?'OpenAPI':'',agentCard?'A2A Agent Card':''].filter(Boolean).join(' + ')||'no callable agent interface detected'},
    {level:3,name:'Structured Web',standard:'Schema.org / JSON-LD',status:structured?'available':'partial',evidence:structured?`${business?'business entity; ':''}${product?'product/service entity; ':''}${prices?'prices detected':''}`.trim():'no validated JSON-LD in sample'},
    {level:2,name:'Semantic Web',standard:'HTML / DOM',status:html?'available':'missing',evidence:html?`${actions} commercial actions; forms ${forms?'yes':'no'}`:'HTML not available'},
    {level:1,name:'Visual fallback',standard:'browser/computer-use fallback',status:html?'available':'unknown',evidence:html?'human-facing page available; visual usability not benchmarked':'not tested'}
  ];
  const best=paths.find(p=>p.status==='available')||paths.find(p=>p.status==='partial')||paths[paths.length-1];
  return{bestLevel:best.level,bestPath:best.name,paths};
}

function capId(s){return String(s||'site').toLowerCase().replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'site'}

export function buildWebsiteSkill({url,hostname,identity,siteType,classification,pages,accessMap,prices=[],actions=[],schemaTypes=[],contacts=[],dynamicSignals={}}){
  const name=identity?.name||hostname;
  const pageLines=pages.slice(0,8).map((p,i)=>`${i+1}. ${p.title||p.url} -> ${p.url}`);
  const capabilities=[];
  capabilities.push({id:'identify_business',mode:'stable',source:url,status:'ready'});
  if(siteType.includes('e-commerce'))capabilities.push({id:'browse_catalog',mode:'live',source:'site navigation / product pages',status:'ready'});
  if(prices.length)capabilities.push({id:'get_price',mode:'live',source:'current product page / structured offer',status:'ready'});else capabilities.push({id:'get_price',mode:'live',source:'current product page',status:'verify'});
  if(actions.length)capabilities.push({id:'commercial_action',mode:'live',source:'observed site controls',status:'partial'});
  if(dynamicSignals.openApi)capabilities.push({id:'call_api',mode:'live',source:'/openapi.json',status:'ready'});
  if(dynamicSignals.agentCard)capabilities.push({id:'agent_capabilities',mode:'live',source:'/.well-known/agent-card.json',status:'ready'});
  if(dynamicSignals.ucp)capabilities.push({id:'transaction',mode:'live',source:'UCP endpoint',status:'ready'});
  const ready=capabilities.filter(c=>c.status==='ready').length,coverage=Math.round(100*ready/capabilities.length);
  const dispatch=capabilities.map(c=>`- ${c.id}: usa ${c.source}; dati ${c.mode}; stato ${c.status}`).join('\n');
  const skill=`---\nname: website-${capId(hostname)}\nversion: 0.4.0\ndescription: Skill operativa generata da ${url}. Orienta un agente verso le fonti e i percorsi migliori senza copiare i dati dinamici.\n---\n\n# SKILL-NAV\nLETTURA: usa questa skill quando devi capire o operare sul business ${name}.\nDISPATCH:\n${dispatch}\nNON_USARE_SE: il dominio o l'identita non corrispondono a ${hostname}; serve una fonte diversa; l'azione richiesta e irreversibile senza conferma.\n\n# IDENTITA\n- business: ${name}\n- domain: ${hostname}\n- site_type: ${siteType}\n- classification_confidence: ${classification?.confidence||'n/d'}\n\n# AGENT ACCESS PATH\n- best_level: ${accessMap.bestLevel}\n- best_path: ${accessMap.bestPath}\n${accessMap.paths.map(p=>`- L${p.level} ${p.name}: ${p.status} | ${p.standard} | ${p.evidence}`).join('\n')}\n\n# CAPABILITIES\n${capabilities.map(c=>`- ${c.id}: ${c.status}; source=${c.source}; freshness=${c.mode}`).join('\n')}\n\n# SOURCE MAP\n${pageLines.join('\n')||'- homepage: '+url}\n\n# LIVE DATA POLICY\n- Prezzi, disponibilita, inventario, tempi, policy e stato ordini sono dati dinamici: recuperarli dalla fonte corrente al momento della richiesta.\n- Non memorizzare un prezzo osservato come verita permanente.\n- Se due fonti del sito divergono, privilegia la fonte piu specifica e recente e segnala la divergenza.\n\n# GROUNDING RULES\n- Non inventare attributi non osservati.\n- Per ogni dato commerciale importante conserva URL sorgente e timestamp della lettura quando disponibile.\n- Se il dato non e verificabile, restituisci UNKNOWN invece di inferirlo.\n- Per azioni irreversibili richiedi conferma esplicita prima del passo finale.\n\n# FALLBACK ORDER\n1. API/OpenAPI/A2A/UCP solo se realmente disponibili E utili al task corrente.\n2. Structured data della pagina pertinente.\n3. DOM/HTML semantico.\n4. Browser visuale.\n5. Human fallback.\n\n# ADAPTIVE QUALITY GATE\nVerifica soltanto cio che serve a soddisfare il task corrente.\nOBBLIGATORIO:\n- dati esplicitamente richiesti dall'utente;\n- dati dinamici che possono cambiare la risposta finale;\n- fonte ufficiale sufficiente per i dati decisivi;\n- conflitti tra fonti che possono cambiare il risultato.\nNON OBBLIGATORIO:\n- scoprire API, endpoint, client ID o implementazione interna se il dato richiesto e gia verificabile;\n- aprire ulteriori fonti solo per aumentare genericamente la confidenza;\n- verificare proprieta non richieste e che non influenzano la scelta.\n\n# STOP RULE\nFERMATI e produci la risposta appena sono vere tutte le condizioni applicabili:\n1. il risultato richiesto e stato individuato;\n2. i dati dinamici richiesti sono stati verificati dalla fonte corrente quando possibile;\n3. esiste una fonte ufficiale sufficiente per sostenere la risposta;\n4. non esistono conflitti irrisolti capaci di cambiare il risultato.\nNon proseguire con esplorazione tecnica o verifiche aggiuntive che non possono cambiare la risposta.\n\n# QUALITY GATE\nPASS se: identita corretta; fonti decisive raggiungibili; dati dinamici richiesti letti live quando possibile; nessuna informazione inventata; azioni critiche non eseguite senza conferma; STOP RULE rispettata.\n\n# TEST PROMPTS\n1. Chi e ${name} e cosa offre?\n2. Trova una voce/prodotto pertinente e indicane la fonte.\n3. Recupera un prezzo corrente senza usare valori memorizzati.\n4. Trova una policy importante e cita la pagina esatta.\n5. Descrivi il percorso migliore per compiere un'azione senza completare un'operazione irreversibile.\n`;
  return{format:'worldmaxai-website-skill-v0.4',compileCoverage:coverage,capabilities,skill};
}
