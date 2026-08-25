const slug=s=>String(s||'site').toLowerCase().replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'site';

export function buildCanonicalWebsiteSkill({url,hostname,identity,siteType,capabilities=[]}){
  const name=identity?.name||hostname||url||'Website';
  const caps=(capabilities||[]).map(c=>`- ${c.id}: ${c.status}; source=${c.source||'website'}; evidence=${(c.evidence||[]).join(' | ')||'none'}`).join('\n');
  return `---\nname: website-${slug(hostname||url)}\nversion: 1.1.0\ndescription: Evidence-first Website Skill generated from the same canonical capability map used by the Agent Ready report.\n---\n\n# IDENTITA\n- business: ${name}\n- domain: ${hostname||''}\n- site_type: ${siteType||'unknown'}\n\n# CAPABILITIES\n${caps||'- none observed'}\n\n# CONSISTENCY CONTRACT\n- Questa sezione CAPABILITIES deriva direttamente dalla capability map del report Agent Ready V1.1.\n- Una capability non puo comparire nel report senza comparire qui con lo stesso stato.\n- Non promuovere partial/missing a ready.\n\n# LIVE DATA POLICY\n- Prezzi, disponibilita, inventario, tempi e policy sono dati dinamici: rileggili dalla fonte corrente.\n- Non incorporare valori dinamici osservati durante la scansione come verita permanenti.\n- Se il dato non e verificabile, restituisci UNKNOWN.\n\n# CONDITIONAL STOP RULE\n- LOOKUP SEMPLICE: fermati dopo una risposta esatta verificata, salvo ambiguita rilevanti.\n- RANKING / SUPERLATIVO: non fermarti al primo candidato; confronta un insieme ragionevole di candidati pertinenti e tutti quelli necessari a sostenere il superlativo.\n- ESAUSTIVA / TUTTI: continua finche il perimetro richiesto e coperto oppure dichiara esplicitamente il limite verificabile.\n- Se paginazione, filtri o categorie possono cambiare il vincitore, esplorali prima di dichiarare un superlativo.\n- Distingui trovato da verificato e verificato da completo.\n\n# FALLBACK ORDER\n1. API/OpenAPI/A2A/MCP realmente verificati.\n2. Structured data della pagina pertinente.\n3. HTML/DOM semantico.\n4. Browser visuale.\n5. Human fallback.\n\n# GROUNDING / GUARDRAIL\n- Nessuna capability operativa senza evidenza osservata.\n- Una frase promozionale non e automaticamente un'azione operativa.\n- Per ogni dato commerciale importante conserva la fonte corrente.\n- Nessuna azione irreversibile senza conferma esplicita.\n`;
}

export function assertSkillCapabilityParity(skill,capabilities=[]){
  for(const c of capabilities||[]){
    const line=`- ${c.id}: ${c.status};`;
    if(!String(skill||'').includes(line))throw Error(`Skill/report capability drift: ${c.id}=${c.status}`);
  }
  return true;
}
