# AI Presence Lab V0.1

Primo prototipo funzionante della direzione WorldMaxAI: **scan prima, diagnosi, poi intervento**.

## Cosa fa
- scansione server-side di un URL pubblico con protezioni SSRF;
- crawl leggero multi-pagina;
- robots.txt e sitemap.xml;
- metadata, JSON-LD/Schema.org, identità, contatti, prezzi e azioni osservate;
- due score euristici trasparenti: AI Visibility e Agent Readiness;
- piano intervento ordinato standard / experimental / future;
- preview non installata di Agent Entry e llms.txt;
- persistenza opzionale Supabase.

## Principi approvati
1. Il sito umano resta la fonte di verità.
2. La V1 non modifica il sito cliente.
3. Il “semino”/Agent Entry è un esperimento, non una promessa di ranking o discovery universale.
4. Prima si correggono crawlability, struttura e dati semanticamente affidabili; poi si testano i segnali agentici.
5. Evoluzione modulare: standard fixes → Agent Entry → interpreter dinamico → API/MCP/A2A → UCP/commerce.

## Supabase
La V1 si avvia anche senza database. Quando viene collegato un progetto Supabase separato, impostare su Vercel `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` e creare la tabella `ai_presence_scans` con RLS e policy INSERT-only per il ruolo pubblico. Nessuna service-role key deve finire nel client.

## Stato
Branch sperimentale isolato: `ai-presence-lab-v1`. Il vecchio `main` non è stato modificato.
