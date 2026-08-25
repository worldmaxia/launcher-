import{buildAgentReadyV1}from'../lib/agent-ready.js';
import{buildCanonicalWebsiteSkill,assertSkillCapabilityParity}from'../lib/canonical-skill.js';
export default async function handler(req,res){
  res.setHeader('cache-control','no-store');
  res.setHeader('content-type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'Usa POST.'});
  try{
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const out=buildAgentReadyV1(b.report||b);
    out.skill=buildCanonicalWebsiteSkill({url:out.source.url,hostname:out.source.hostname,identity:(b.report||b).identity||{name:out.capabilityGraph?.nodes?.[0]?.label},siteType:out.source.siteType,capabilities:out.capabilities});
    assertSkillCapabilityParity(out.skill,out.capabilities);
    out.guards={...(out.guards||{}),skillCapabilityParity:true};
    return res.status(200).json(out);
  }catch(e){return res.status(400).json({error:e.message||'Agent Ready analysis failed.'});}
}
