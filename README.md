# WorldMaxAI Agent Ready Scanner V1

V1 isolata del progetto AI Presence Lab: **URL → scan → discovery → Capability Graph → Agent Readiness → piano di intervento**, senza modificare il sito analizzato.

## Flusso operativo
1. `api/scan.js` — crawl leggero multi-pagina, robots/sitemap, metadata, JSON-LD, identità, contatti, prezzi e azioni osservate, con protezioni SSRF.
2. `api/discovery.js` — discovery separata e verificata di ARD (`/.well-known/ai-catalog.json`, `rel=ai-catalog`, `Agentmap:`), A2A Agent Card e OpenAPI. MCP viene riconosciuto solo se dichiarato da una risorsa/catologo osservato: non viene inventato un endpoint standard.
3. `lib/agent-ready.js` — normalizza anche i report legacy, inferisce capacità, calcola Agent Readiness, costruisce Capability Graph, artefatti e piano.
4. `api/agent-ready.js` — espone il motore V1 come endpoint JSON.
5. `api/compile.js` — conserva il Website→Skill compiler già collaudato: i dati commerciali dinamici restano live.
6. `api/v1-selftest.js` — 18 controlli deterministici su normalizzazione, capability inference, scoring e guardrail.

## Guardrail V1
- Il sito umano resta la fonte di verità.
- Nessuna modifica automatica al sito cliente.
- Nessun Agent Card/A2A dichiarato operativo senza backend realmente osservato.
- Nessun ARD catalog sintetico che pubblicizzi risorse non verificate.
- Prezzi, disponibilità e policy dinamiche non vengono congelati nella skill.
- Azioni irreversibili richiedono conferma prima del passo finale.

## Standard e output
La V1 produce:
- Agent Readiness score trasparente e componentizzato;
- mappa delle capacità `ready / partial / missing`;
- Capability Graph;
- discovery ARD/A2A/OpenAPI;
- bozza `ai-catalog.json` solo a partire da risorse callable osservate;
- proposta MCP solo quando esiste un backend/API deterministico;
- building block OSS verificati per gap MCP/A2A;
- piano di intervento ordinato;
- Website Skill scaricabile;
- report JSON scaricabile.

## OSS building blocks verificati
- `modelcontextprotocol/typescript-sdk` — candidato ufficiale per adapter MCP TypeScript.
- `a2aproject/a2a-js` — candidato per server/client A2A JavaScript.

Le dipendenze non sono incluse automaticamente: licenza e versione vanno verificate al momento dell'integrazione.

## Supabase
La tabella esistente `public.ai_presence_scans` è compatibile con la V1 tramite il campo `report jsonb`. È stata verificata con RLS attivo e policy pubblica **INSERT-only**; nessuna migrazione è necessaria. La V1 continua a funzionare anche senza database.

## Branch e rollback
- sviluppo V1: `agent-ready-scanner-v1`
- base preservata: `ai-presence-lab-v1`
- `main` non viene modificato
- i deploy V0.3/V0.4/V0.5 restano disponibili come rollback

## Verifica locale/CI
```bash
node --check lib/agent-ready.js
node --check api/discovery.js
node --check api/agent-ready.js
node --check api/v1-selftest.js
```

L'endpoint `/api/v1-selftest` deve restituire `ok: true`, `version: 1.0.0`, `tests: 18`.
