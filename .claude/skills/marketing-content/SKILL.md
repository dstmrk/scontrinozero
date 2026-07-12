---
name: marketing-content
description: Use when writing or editing marketing/SEO content or any user-facing copy that mentions plans or features — the data files src/lib/help/articles.ts, src/lib/guide/articles.ts, src/lib/per/categories.ts, src/lib/confronto/comparisons.ts, src/lib/strumenti/tools.ts, pages under src/app/(marketing)/, components in src/components/marketing/ and src/components/help/, and plan/referral copy outside the marketing group (src/components/settings/referral-section.tsx). Covers never promising unshipped features (conditional/roadmap wording, what is currently "in arrivo" on Pro), /help vs /guide slug separation to avoid canonical clashes, the grep checklist to sync copy after feature/label/gating changes, and LLM-generated content requiring human review (Italian, Italy-only target).
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

## Produzione contenuti

Contenuti generati via LLM con **review umana**, in italiano, target Italia.
