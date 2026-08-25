const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const id=s=>String(s||'cap').toLowerCase().replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'cap';
const derive=(base,path)=>{try{return new URL(path,base).href}catch{return null}};
const COMMERCIAL_ACTION_RE=/(?:^|\b)(?:acquista(?:\s+ora)?|aggiungi(?:\s+al)?\s+carrello|vai\s+al\s+carrello|checkout|prenota(?:\s+ora)?|prenota\s+(?:un\s+)?tavolo|richiedi(?:\s+un)?\s+preventivo|contattaci|contatta|ordina(?:\s+ora)?|verifica\s+disponibilit[aà]|buy(?:\s+now)?|add\s+to\s+cart|book(?:\s+now)?|reserve(?:\s+now)?|contact\s+us|request\s+(?:a\s+)?quote|check\s+availability)\b/i;
export const isStrongCommercialAction=x=>COMMERCIAL_ACTION_RE.test(String(x||'').trim());

export function normalizeScanReport(input={}){
  const report={...input};const ex=report.extracted||{},crawl=report.crawl||{},seed=report.generated?.seedPreview||{};
  report.hostname=report.hostname||(()=>{try{return new URL(report.url).hostname}catch{return null}})();
  report.identity=report.identity||seed.identity||{name:ex.schemaNames?.[0]||ex.title||report.hostname};
  report.schemaTypes=uniq(report.schemaTypes||ex.schemaTypes||[]);
  report.prices=uniq(report.prices||ex.prices||[]);
  report.actions=uniq(report.actions||ex.observedActions||[]);
  report.contacts=report.contacts||{emails:ex.emails||[],phones:ex.phones||[]};
  report.structured=Boolean(report.structured||report.schemaTypes.length);
  report.sitemap=report.sitemap||{detected:Boolean(crawl.sitemapDetected),selected:crawl.sitemapSelected||null};
  report.robots=report.robots||{status:crawl.robotsStatus||0,ok:Number(crawl.robotsStatus)===200};
  const ds=report.dynamicSignals||{};report.signals={...ds,...(report.signals||{})};
  if(crawl.openApiStatus===200)report.signals.openApi=true;if(crawl.agentCardStatus===200)report.signals.agentCard=true;
  report.endpoints={...(report.endpoints||{})};
  if(report.signals.openApi&&!report.endpoints.openApi)report.endpoints.openApi=derive(report.url,'/openapi.json');
  if(report.signals.agentCard&&!report.endpoints.agentCard)report.endpoints.agentCard=derive(report.url,'/.well-known/agent-card.json');
  return report;
}

export function inferCapabilities(input={}){
  const report=normalizeScanReport(input),pages=Array.isArray(report.pages)?report.pages:[],signals=report.signals||{},actions=(report.actions||[]).filter(isStrongCommercialAction),prices=report.prices||[],types=report.schemaTypes||[],caps=[];
  const add=(capability,status,evidence,source='website')=>caps.push({id:id(capability),capability,status,evidence:uniq(evidence),source});
  add('identify business','ready',[report.identity?.name||report.hostname||report.url,'public website']);
  if((report.crawl?.pagesAnalyzed||0)>1||pages.length>1||report.sitemap?.detected)add('navigate site','ready',[report.crawl?.pagesAnalyzed?`${report.crawl.pagesAnalyzed} pages sampled`:null,report.sitemap?.detected?'sitemap detected':null]);
  if(types.some(x=>/Product|Offer|ItemList|Service|Store|OnlineStore/i.test(x)))add('browse catalog','ready',['structured product/service entities']);else if(/e-commerce|catalog/i.test(report.siteType||''))add('browse catalog','partial',['commerce classification without strong structured catalog evidence']);
  if(prices.length)add('read current price','ready',[`${prices.length} price-like values observed`,report.url]);
  if(actions.length)add('find commercial action','partial',actions.slice(0,5));
  if(pages.some(p=>p.forms)||report.generated?.seedPreview?.capabilitiesObserved?.forms)add('submit form','partial',['HTML forms detected','final submission not executed']);
  if(report.contacts?.emails?.length||report.contacts?.phones?.length)add('contact business','ready',['public contact data detected']);
  if(signals.openApi)add('call api','ready',['OpenAPI endpoint observed'],'openapi');
  if(signals.agentCard)add('delegate to a2a agent','ready',['A2A Agent Card observed'],'a2a');
  if(signals.mcp)add('call mcp server','ready',['MCP endpoint observed or declared by verified catalog'],'mcp');
  if(signals.ucp)add('transaction via agent protocol','ready',['UCP endpoint observed'],'ucp');
  if(!caps.some(c=>c.id==='call-api'))add('call api','missing',['no callable API verified']);
  if(!caps.some(c=>c.id==='delegate-to-a2a-agent'))add('delegate to a2a agent','missing',['no A2A Agent Card verified']);
  if(!caps.some(c=>c.id==='call-mcp-server'))add('call mcp server','missing',['no MCP endpoint verified']);
  return caps;
}

export function scoreReadiness(input={},caps){
  const report=normalizeScanReport(input),list=caps||inferCapabilities(report),sig=report.signals||{};
  const structured=Boolean(report.structured),crawl=Boolean(report.robots?.ok||report.sitemap?.detected||Number(report.crawl?.pagesAnalyzed)>0),callable=list.some(c=>['call-api','delegate-to-a2a-agent','call-mcp-server'].includes(c.id)&&c.status==='ready'),transactional=Boolean(sig.ucp)||list.some(c=>c.id==='transaction-via-agent-protocol'&&c.status==='ready'),sourceTrace=Boolean(report.url&&report.hostname);
  const components={discoverability:crawl?18:6,semantics:structured?20:8,businessIdentity:report.identity?.name||report.hostname?12:5,callable:callable?30:0,transactional:transactional?10:0,traceability:sourceTrace?10:4};
  const score=clamp(Object.values(components).reduce((a,b)=>a+b,0)),band=score>=80?'agent-ready':score>=55?'structured-but-not-callable':score>=30?'partially-readable':'low-readiness';return{score,band,components};
}

export function buildCapabilityGraph(input={},caps){const report=normalizeScanReport(input),list=caps||inferCapabilities(report),root=id(report.hostname||report.url||'website'),nodes=[{id:root,type:'business',label:report.identity?.name||report.hostname||report.url||'Website'}],edges=[];for(const c of list){nodes.push({id:c.id,type:'capability',label:c.capability,status:c.status,source:c.source});edges.push({from:root,to:c.id,relation:'offers_or_exposes',status:c.status})}const channels=[['website','HTML/DOM'],['openapi','OpenAPI'],['a2a','A2A'],['mcp','MCP'],['ucp','UCP']];for(const[k,label]of channels){if(list.some(c=>c.source===k)){const nid=`channel-${k}`;nodes.push({id:nid,type:'access-channel',label});edges.push({from:root,to:nid,relation:'accessible_via'});for(const c of list.filter(x=>x.source===k))edges.push({from:nid,to:c.id,relation:'supports',status:c.status})}}if(report.structured){nodes.push({id:'channel-structured',type:'access-channel',label:'Schema.org/JSON-LD'});edges.push({from:root,to:'channel-structured',relation:'accessible_via'})}return{nodes,edges}}

export function buildArtifacts(input={},caps){const report=normalizeScanReport(input),list=caps||inferCapabilities(report),host=report.hostname||'unknown.invalid',name=report.identity?.name||host,observed=[];const add=(identifier,displayName,type,url,capabilities)=>{if(url)observed.push({identifier:`urn:air:${host}:${identifier}`,displayName,type,url,description:`Observed resource for ${name}`,capabilities})};if(report.endpoints?.openApi)add('api:openapi','OpenAPI','application/vnd.oai.openapi+json',report.endpoints.openApi,['api']);if(report.endpoints?.agentCard)add('agent:a2a','A2A Agent','application/a2a+json',report.endpoints.agentCard,['a2a']);if(report.endpoints?.mcp)add('tool:mcp','MCP Server','application/mcp+json',report.endpoints.mcp,['mcp']);const aiCatalog=observed.length?{specVersion:'1.0',host:{displayName:name,identifier:host},entries:observed}:null,actualAgent=Boolean(report.endpoints?.agentCard&&list.some(c=>c.id==='delegate-to-a2a-agent'&&c.status==='ready')),mcpReady=list.some(c=>c.id==='call-mcp-server'&&c.status==='ready');return{ard:{observed:Boolean(report.signals?.ard),observedLocation:report.endpoints?.aiCatalog||null,status:report.signals?.ard?'existing-catalog-observed':aiCatalog?'draft-from-observed-resources':'not-applicable-yet',recommendedLocation:`https://${host}/.well-known/ai-catalog.json`,manifest:aiCatalog},a2a:{publishable:actualAgent,reason:actualAgent?'existing Agent Card observed':'No callable A2A backend verified; do not publish a generated Agent Card as if it were operational.',recommendedLocation:`https://${host}/.well-known/agent-card.json`},mcp:{publishable:mcpReady,mode:mcpReady?'observed':'proposal',recommendation:mcpReady?'Preserve and document the verified MCP surface.':'Generate an MCP adapter only after a deterministic backend/API exists; HTML-only actions remain browser fallback.'}}}

export function buildOssBuildingBlocks(caps=[]){const out=[];if(caps.some(c=>c.id==='call-mcp-server'&&c.status==='missing'))out.push({gap:'MCP adapter',repo:'modelcontextprotocol/typescript-sdk',url:'https://github.com/modelcontextprotocol/typescript-sdk',use:'official TypeScript SDK candidate; review license/version before integration'});if(caps.some(c=>c.id==='delegate-to-a2a-agent'&&c.status==='missing'))out.push({gap:'A2A server/client',repo:'a2aproject/a2a-js',url:'https://github.com/a2aproject/a2a-js',use:'A2A JavaScript SDK candidate; review license/version before integration'});return out}

export function buildInterventionPlan(input={},caps,readiness){const report=normalizeScanReport(input),list=caps||inferCapabilities(report),r=readiness||scoreReadiness(report,list),items=[];let n=1;const push=(priority,title,why,kind='standard')=>items.push({order:n++,priority,title,why,kind});if(!report.structured)push('high','Add/repair Schema.org JSON-LD','Agents currently rely mainly on unstructured HTML.');if(list.some(c=>c.id==='call-api'&&c.status==='missing'))push('high','Expose deterministic read actions through OpenAPI','Removes browser ambiguity for data retrieval.');if(list.some(c=>c.id==='call-mcp-server'&&c.status==='missing'))push('medium','Add MCP adapter after stable API exists','Makes stable capabilities directly callable by MCP clients.','agentic');if(list.some(c=>c.id==='delegate-to-a2a-agent'&&c.status==='missing'))push('medium','Publish A2A only when an actual agent backend exists','Discovery must describe a real callable service, not a synthetic card.','agentic');if(r.score<80)push('medium','Run task-based acceptance tests','Readiness score is evidence-based but not a substitute for successful tasks.');push('low','Publish ARD ai-catalog for verified callable resources','Makes verified resources discoverable without advertising nonexistent capabilities.','agentic');return items}

export function buildAgentReadyV1(input={}){if(!input||typeof input!=='object'||!input.url)throw Error('Scan report non valido: manca url.');const report=normalizeScanReport(input),caps=inferCapabilities(report),readiness=scoreReadiness(report,caps),graph=buildCapabilityGraph(report,caps),artifacts=buildArtifacts(report,caps),plan=buildInterventionPlan(report,caps,readiness);return{version:'1.0.1',generatedAt:new Date().toISOString(),scope:'Agent Ready Scanner V1',source:{url:report.url,hostname:report.hostname||null,siteType:report.siteType||null},readiness,capabilities:caps,capabilityGraph:graph,artifacts,ossBuildingBlocks:buildOssBuildingBlocks(caps),interventionPlan:plan,guards:{siteRemainsSourceOfTruth:true,noCustomerSiteMutation:true,noSyntheticCapabilityClaims:true,dynamicFactsMustBeReadLive:true,irreversibleActionsRequireConfirmation:true,strongActionEvidenceRequired:true}}}
