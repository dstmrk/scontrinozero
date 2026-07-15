---
name: marketing-content
description: Use when writing or editing marketing/SEO/GEO content or any user-facing copy that mentions plans or features — the data files src/lib/help/articles.ts, src/lib/guide/articles.ts, src/lib/per/categories.ts, src/lib/confronto/comparisons.ts, src/lib/strumenti/tools.ts, pages under src/app/(marketing)/, components in src/components/marketing/ and src/components/help/, and plan/referral copy outside the marketing group (src/components/settings/referral-section.tsx). Covers never promising unshipped features (conditional/roadmap wording, what is currently "in arrivo" on Pro), /help vs /guide slug separation to avoid canonical clashes, the grep checklist to sync copy after feature/label/gating changes, the permanent GEO checklist for AI-citable content (risposta secca in the first two lines, dated legal references, FAQPage, citable numbered facts), the SEO competitive positioning (depth + freshness + AI-citable answers, single /confronto landing), and LLM-generated content requiring human review (Italian, Italy-only target).
---

# marketing-content — contenuti marketing & SEO

## Dove vivono i contenuti (route → data file)

| Route               | Scopo                           | Data file                          |
| ------------------- | ------------------------------- | ---------------------------------- |
| `/help`             | operativo                       | `src/lib/help/articles.ts`         |
| `/guide`            | educativo                       | `src/lib/guide/articles.ts`        |
| `/per/[slug]`       | categorie esercenti             | `src/lib/per/categories.ts`        |
| `/confronto`        | comparazioni competitor         | `src/lib/confronto/comparisons.ts` |
| `/strumenti/[slug]` | tool gratuiti (backlink-magnet) | `src/lib/strumenti/tools.ts`       |

Copy che parla di piani/feature vive anche **fuori** dal gruppo
`(marketing)/`: `src/components/marketing/`, `src/components/help/` e
`src/components/settings/referral-section.tsx` (termini del bonus referral).

## Niente promesse di feature non live

In _nessun_ copy marketing una feature non implementata va scritta al
presente: condizionale/roadmap, mai "c'è". Stato attuale:

- Sul Pro resta "in arrivo" **solo** il recupero dei **documenti
  commerciali/corrispettivi da AdE** (roadmap v1.9.0).
- Il sync del **catalogo prodotti** da AdE **non** è più promesso
  (nice-to-have gated su domanda).
- Analytics avanzata ed Export CSV sono **spedite e Pro-gated**
  (commit ae1c481).

Se lo stato di una feature cambia (spedita, rimossa dalla roadmap), questo
elenco e la tabella Pricing in `CLAUDE.md` vanno aggiornati nello stesso PR.

Esempio del costo di questa regola violata: REVIEW.md #47 — la copy di
`/help` è rimasta Fisconline-only dopo che il login CIE è stato spedito in
v1.5.0, e il sito contraddiceva il prodotto.

## Slug separati /help vs /guide (canonical clash)

Sulle keyword condivise usare slug **diversi** per evitare canonical clash:
es. `/help/regime-forfettario` ≠ `/guide/regime-forfettario-scontrini`;
le due pagine si linkano a vicenda.

## Checklist sync copy dopo un cambio funzionalità

Se modifichi una funzionalità (label, menu, stati, filtri, error flow,
gating piani, nomi bottoni, termini del bonus referral) **prima di chiudere
il task**:

```bash
grep -rn "<termine>" 'src/app/(marketing)' src/components/marketing src/components/help src/components/settings/referral-section.tsx
```

e aggiorna ogni occorrenza stale nei data file / componenti sopra.

## Checklist GEO (per ogni contenuto nuovo o aggiornato)

I due canali a budget zero sono **ricerca organica Google** e **risposte AI**
(ChatGPT, Perplexity, Google AI Overviews). Per farsi citare dalle AI, ogni
guida/help/tool nuovo o revisionato rispetta:

1. **Risposta secca nelle prime 2 righe** di ogni pagina e di ogni sezione: le
   AI citano il paragrafo che _risponde_, non quello che introduce. Vale anche
   per ogni FAQ (la risposta apre col fatto, non col contesto).
2. **Riferimenti normativi espliciti e datati** (es. "art. 1, commi 54-89, L.
   190/2014", "dal 1° gennaio 2021") e `updatedAt` reale a ogni revisione.
3. **FAQ a video su ogni pagina** → FAQPage schema automatico (già cablato via
   `faqPageJsonLd` in `src/components/json-ld.tsx`). Minimo 2 FAQ.
4. **Fatti citabili con numeri** ("sanzione del 90%", "bollo 2,00 € oltre
   77,47 €"): le AI preferiscono claim verificabili.
5. **Slug separati `/help` vs `/guide`** sulle keyword condivise (vedi sopra):
   help = operativo in-app, guide = educativo/reference. I `metaTitle` devono
   riflettere intent distinti per non cannibalizzarsi.

## Vantaggio competitivo SEO

Il differenziatore vs competitor è **profondità + freschezza + risposte secche
citabili dalle AI** (guide editoriali con schema Article/FAQPage). Da giocare:
verticali di settore, pagina stampanti, credenziali via SPID. Decisione presa:
**niente pagine confronto per-competitor** — resta la landing unica
`/confronto` (`src/lib/confronto/comparisons.ts`), da aggiornare
trimestralmente perché i pricing dei competitor cambiano.

## Produzione contenuti

Contenuti generati via LLM con **review umana**, in italiano, target Italia.
