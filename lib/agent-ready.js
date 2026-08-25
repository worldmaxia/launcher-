const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const id=s=>String(s||'cap').toLowerCase().replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'cap';

export function inferCapabilities(report={}){
  const pages=Array.isArray(report.pages)?report.pages:[];
  const signals=report.signals||{};
  const schema=report.schema||{};
  const actions=uniq(report.actions||report.acts||pages.flatMap(p=>p.acts||[]));
  const prices=uniq(report.prices||pages.flatMap(p=>p.prices||[]));
  const types=uniq(report.schemaTypes||schema.types||pages.flatMap(p=>p.json?.types||[]));
  const caps=[];
  const add=(capability,status,evidence,source='website')=>caps.push({id:id(capability),capability,status,evidence:uniq(evidence),source});
  add('identify business','ready',[report.identity?.name||report.hostname||report.url,'public website']);
  if(pages.length>1||report.sitemap?.detected)add('navigate site','ready',[pages.length?`${pages.length} pages sampled`:null,report.sitemap?.detected?'sitemap detected':null]);
  if(types.some(x=>/Product|Offer|ItemList|Service|Store|OnlineStore/i.test(x))) add('browse catalog','ready',['structured product/service entities']);
  else if(/e-commerce|catalog/i.test(report.siteType||'')) add('browse catalog','partial',['commerce classification without strong structured catalog evidence']);
  if(prices.length)add('read current price','ready',[`${prices.length} price-like values observed`]);
  if(actions.length)add('find commercial action','partial',actions.slice(0,5));
  if(pages.some(p=>p.forms))add('submit form','partial',['HTML forms detected','final submission not executed']);
  if(report.contacts?.emails?.length||report.contacts?.phones?.length)add('contact business','ready',['public contact data detected']);
  if(signals.openApi||report.dynamicSignals?.openApi)add('call api','ready',['OpenAPI endpoint observed'],'openapi');
  if(signals.agentCard||report.dynamicSignals?.agentCard)add('delegate to a2a agent','ready',['A2A Agent Card observed'],'a2a');
  if(signals.mcp)add('call mcp server','ready',['MCP endpoint observed'],'mcp');
  if(signals.ucp||report.dynamicSignals?.ucp)add('transaction via agent protocol','ready',['UCP endpoint observed'],'ucp');
  if(!caps.some(c=>c.id==='call-api'))add('call api','missing',['no callable API verified']);
  if(!caps.some(c=>c.id==='delegate-to-a2a-agent'))add('delegate to a2a agent','missing',['no A2A Agent Card verified']);
  if(!caps.some(c=>c.id==='call-mcp-server'))add('call mcp server','missing',['no MCP endpoint verified']);
  return caps;
}

export function scoreReadiness(report={},caps=inferCapabilities(report)){
  const sig=report.signals||{};
  const pages=Array.isArray(report.pages)?report.pages:[];
  const structured=Boolean(report.structured||report.schema?.valid||pages.some(p=>p.json?.valid));
  const crawl=Boolean(report.robots?.ok||report.robots?.status===200||report.sitemap?.detected||pages.length);
  const callable=caps.some(c=>c.id==='call-api'&&c.status==='ready')||caps.some(c=>c.id==='delegate-to-a2a-agent'&&c.status==='ready')||caps.some(c=>c.id==='call-mcp-server'&&c.status==='ready');
  const transactional=Boolean(sig.ucp)||caps.some(c=>c.id==='transaction-via-agent-protocol'&&c.status==='ready');
  const sourceTrace=Boolean(report.url&&report.hostname);
  const components={discoverability:crawl?18:6,semantics:structured?20:8,businessIdentity:report.identity?.name||report.hostname?12:5,callable:callable?30:0,transactional:transactional?10:0,traceability:sourceTrace?10:4};
  const score=clamp(Object.values(components).reduce((a,b)=>a+b,0));
  const band=score>=80?'agent-ready':score>=55?'structured-but-not-callable':score>=30?'partially-readable':'low-readiness';
  return{score,band,components};
}

export function buildCapabilityGraph(report={},caps=inferCapabilities(report)){
  const root=id(report.hostname||report.url||'website');
  const nodes=[{id:root,type:'business',label:report.identity?.name||report.hostname||report.url||'Website'}];
  const edges=[];
  for(const c of caps){nodes.push({id:c.id,type:'capability',label:c.capability,status:c.status,source:c.source});edges.push({from:root,to:c.id,relation:'offers_or_exposes',status:c.status});}
  const channels=[['web','HTML/DOM'],['structured','Schema.org/JSON-LD'],['openapi','OpenAPI'],['a2a','A2A'],['mcp','MCP'],['ucp','UCP']];
  for(const [k,label] of channels){if(caps.some(c=>c.source===k)||(k==='web'&&caps.length)){const nid=`channel-${k}`;nodes.push({id:nid,type:'access-channel',label});edges.push({from:root,to:nid,relation:'accessible_via'});for(const c of caps.filter(x=>x.source===k||(k==='web'&&x.source==='website')))edges.push({from:nid,to:c.id,relation:'supports',status:c.status});}}
  return{nodes,edges};
}

export function buildArtifacts(report={},caps=inferCapabilities(report)){
  const host=report.hostname||(()=>{try{return new URL(report.url).hostname}catch{return'unknown.invalid'}})();
  const name=report.identity?.name||host;
  const observed=[];
  const add=(identifier,displayName,type,url,capabilities)=>{if(url)observed.push({identifier:`urn:air:${host}:${identifier}`,displayName,type,url,description:`Observed resource for ${name}`,capabilities});};
  if(report.endpoints?.openApi)add('api:openapi','OpenAPI','application/vnd.oai.openapi+json',report.endpoints.openApi,['api']);
  if(report.endpoints?.agentCard)add('agent:a2a','A2A Agent','application/a2a+json',report.endpoints.agentCard,['a2a']);
  if(report.endpoints?.mcp)add('tool:mcp','MCP Server','application/mcp+json',report.endpoints.mcp,['mcp']);
  const aiCatalog=observed.length?{specVersion:'1.0',host:{displayName:name,identifier:host},entries:observed}:null;
  const actualAgent=report.endpoints?.agentCard&&caps.some(c=>c.id==='delegate-to-a2a-agent'&&c.status==='ready');
  const a2a={publishable:Boolean(actualAgent),reason:actualAgent?'existing Agent Card observed':'No callable A2A backend verified; do not publish a generated Agent Card as if it were operational.',recommendedLocation:`https://${host}/.well-known/agent-card.json`};
  const mcpReady=caps.some(c=>c.id==='call-mcp-server'&&c.status==='ready');
  const mcp={publishable:mcpReady,mode:mcpReady?'observed':'proposal',recommendation:mcpReady?'Preserve and document the verified MCP surface.':'Generate an MCP adapter only after a deterministic backend/API exists; HTML-only actions remain browser fallback.'};
  return{ard:{status:aiCatalog?'draft-from-observed-resources':'not-applicable-yet',recommendedLocation:`https://${host}/.well-known/ai-catalog.json`,manifest:aiCatalog},a2a,mcp};
}

export function buildInterventionPlan(report={},caps=inferCapabilities(report),readiness=scoreReadiness(report,caps)){
  const items=[];let n=1;const push=(priority,title,why,kind='standard')=>items.push({order:n++,priority,title,why,kind});
  if(!report.structured&&!report.schema?.valid&&!((report.pages||[]).some(p=>p.json?.valid)))push('high','Add/repair Schema.org JSON-LD','Agents currently rely mainly on unstructured HTML.');
  if(caps.some(c=>c.id==='call-api'&&c.status==='missing'))push('high','Expose deterministic read actions through OpenAPI','Removes browser ambiguity for data retrieval.');
  if(caps.some(c=>c.id==='call-mcp-server'&&c.status==='missing'))push('medium','Add MCP adapter after stable API exists','Makes stable capabilities directly callable by MCP clients.','agentic');
  if(caps.some(c=>c.id==='delegate-to-a2a-agent'&&c.status==='missing'))push('medium','Publish A2A only when an actual agent backend exists','Discovery must describe a real callable service, not a synthetic card.','agentic');
  if(readiness.score<80)push('medium','Run task-based acceptance tests','Readiness score is evidence-based but not a substitute for successful tasks.');
  push('low','Publish ARD ai-catalog for verified callable resources','Makes verified resources discoverable without advertising nonexistent capabilities.','agentic');
  return items;
}

export function buildAgentReadyV1(report={}){
  if(!report||typeof report!=='object'||!report.url)throw Error('Scan report non valido: manca url.');
  const caps=inferCapabilities(report),readiness=scoreReadiness(report,caps),graph=buildCapabilityGraph(report,caps),artifacts=buildArtifacts(report,caps),plan=buildInterventionPlan(report,caps,readiness);
  return{version:'1.0.0',generatedAt:new Date().toISOString(),scope:'Agent Ready Scanner V1',source:{url:report.url,hostname:report.hostname||null,siteType:report.siteType||null},readiness,capabilities:caps,capabilityGraph:graph,artifacts,interventionPlan:plan,guards:{siteRemainsSourceOfTruth:true,noCustomerSiteMutation:true,noSyntheticCapabilityClaims:true,dynamicFactsMustBeReadLive:true,irreversibleActionsRequireConfirmation:true}};
}
