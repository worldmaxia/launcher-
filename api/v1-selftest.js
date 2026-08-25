import{buildAgentReadyV1,normalizeScanReport,isStrongCommercialAction}from'../lib/agent-ready.js';
import{buildCanonicalWebsiteSkill,assertSkillCapabilityParity}from'../lib/canonical-skill.js';
const assert=(x,m)=>{if(!x)throw Error(m)};
export default function handler(req,res){
  try{
    let n=0;const ok=(x,m)=>{assert(x,m);n++};
    const legacy={version:'0.2.0',url:'https://shop.test/',hostname:'shop.test',siteType:'e-commerce / catalogo',crawl:{pagesAnalyzed:4,robotsStatus:200,sitemapDetected:true},extracted:{title:'Test Shop',schemaTypes:['Organization','Product','Offer'],schemaNames:['Test Shop'],prices:['€ 9'],emails:['info@shop.test'],phones:[],observedActions:['Add to cart']},generated:{seedPreview:{identity:{name:'Test Shop'},capabilitiesObserved:{forms:true}}}};
    const norm=normalizeScanReport(legacy);ok(norm.identity.name==='Test Shop','legacy identity');ok(norm.structured===true,'structured');ok(norm.prices.length===1,'price normalization');
    let v=buildAgentReadyV1(legacy);ok(v.version==='1.1.0','version');ok(v.capabilities.some(c=>c.id==='browse-catalog'&&c.status==='ready'),'catalog ready');ok(v.capabilities.some(c=>c.id==='submit-form'&&c.status==='partial'),'form partial');ok(v.capabilities.some(c=>c.id==='find-commercial-action'&&c.status==='partial'),'strong CTA capability');
    ok(isStrongCommercialAction('Add to cart'),'strong CTA accepted');ok(!isStrongCommercialAction('Goditi subito i tuoi acquisti, pagali con calma a tasso zero'),'IKEA promo rejected');
    const promo={...legacy,extracted:{...legacy.extracted,observedActions:['Goditi subito i tuoi acquisti, pagali con calma a tasso zero']}};v=buildAgentReadyV1(promo);ok(!v.capabilities.some(c=>c.id==='find-commercial-action'),'promo capability suppressed');
    const skill=buildCanonicalWebsiteSkill({url:v.source.url,hostname:v.source.hostname,identity:promo.identity||norm.identity,siteType:v.source.siteType,capabilities:v.capabilities});
    ok(assertSkillCapabilityParity(skill,v.capabilities),'skill/report parity');ok(skill.includes('- browse-catalog: ready;'),'catalog in skill');ok(skill.includes('- submit-form: partial;'),'form in skill');ok(!skill.includes('- find-commercial-action:'),'suppressed promo absent in skill');ok(skill.includes('CONDITIONAL STOP RULE'),'conditional stop');ok(skill.includes('RANKING / SUPERLATIVO'),'ranking rule');ok(skill.includes('ESAUSTIVA / TUTTI'),'exhaustive rule');ok(!skill.includes('€ 9'),'dynamic price excluded');
    return res.status(200).json({ok:true,version:'1.1.0',tests:n,checks:['legacy identity','structured','price normalization','version','catalog ready','form partial','strong CTA capability','strong CTA accepted','IKEA promo rejected','promo capability suppressed','skill/report parity','catalog in skill','form in skill','promo absent in skill','conditional stop','ranking rule','exhaustive rule','dynamic-price exclusion']});
  }catch(e){return res.status(500).json({ok:false,version:'1.1.0',error:e.message});}
}
