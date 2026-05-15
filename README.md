# ScontrinoZero

**Il registratore di cassa virtuale. Zero hardware, zero complicazioni.**

[![CI](https://github.com/dstmrk/scontrinozero/actions/workflows/ci.yml/badge.svg)](https://github.com/dstmrk/scontrinozero/actions/workflows/ci.yml)

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=bugs)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=dstmrk_scontrinozero&metric=coverage)](https://sonarcloud.io/summary/new_code?id=dstmrk_scontrinozero)

ScontrinoZero è un'applicazione mobile-first che consente a esercenti e professionisti di emettere scontrini elettronici e trasmettere i corrispettivi all'Agenzia delle Entrate direttamente da smartphone, tablet o PC — senza bisogno di un registratore telematico fisico.

## Il problema

In Italia, chi effettua vendite al dettaglio è obbligato a memorizzare e trasmettere telematicamente i corrispettivi (D.Lgs. 127/2015). La soluzione tradizionale — un registratore telematico (RT) — comporta costi di acquisto (300-600€), fiscalizzazione, verifiche periodiche biennali e canoni di assistenza. Per micro-attività, ambulanti, B&B e professionisti con pochi scontrini al giorno, è un peso sproporzionato.

## La soluzione

ScontrinoZero sfrutta la procedura web "Documento Commerciale Online" messa a disposizione dall'Agenzia delle Entrate, automatizzandone l'utilizzo nel pieno rispetto della normativa vigente (cfr. [Interpello AdE n. 956-1523/2020](https://www.my-cassa.it/wp-content/uploads/Interpello_CassApp.pdf)).

### Funzionalità principali

- **Emissione scontrini elettronici** — direttamente dal tuo dispositivo, con invio in tempo reale all'AdE
- **Lotteria degli Scontrini** — inserisci il codice fiscale del cliente per partecipare automaticamente
- **Gestione resi e annullamenti** — con un tap
- **Catalogo prodotti** — accesso rapido ai prodotti più venduti
- **Multi-dispositivo** — usa la stessa cassa da smartphone, tablet o browser
- **Stampa e condivisione** — condividi lo scontrino via QR code, link pubblico o stampa
- **Storico corrispettivi** — consulta e scarica i tuoi scontrini in qualsiasi momento

## Tech Stack

| Layer        | Tecnologie                                                    |
| ------------ | ------------------------------------------------------------- |
| Frontend     | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Componenti   | shadcn/ui, TanStack Query v5                                  |
| Database     | Supabase (PostgreSQL), Drizzle ORM, Row Level Security        |
| Pagamenti    | Stripe (Starter €4.99/mese · Pro €8.99/mese · Self-hosted €0) |
| Email        | Resend + React Email                                          |
| Integrazione | HTTP dirette verso portale AdE (no headless browser)          |
| Deploy       | Docker standalone su VPS, Cloudflare Tunnel                   |
| Qualità      | Vitest, SonarCloud, Sentry                                    |

## Conformità normativa

ScontrinoZero opera come interfaccia alla procedura web dell'Agenzia delle Entrate, garantendo:

- **Contestualità** dell'adempimento (memorizzazione + trasmissione + emissione in un unico flusso)
- **Nessuna alterazione** dei dati trasmessi o ricevuti dall'AdE
- **Nessuna intermediazione** — il dispositivo dell'esercente comunica direttamente con i sistemi dell'Agenzia

## Target

Pensato per chi emette scontrini ma non vuole (o non può) investire in un registratore telematico fisico:

🏪 Piccoli negozi · 💇 Parrucchieri e centri estetici · 🏨 B&B e affittacamere · 🚐 Ambulanti · 🚗 NCC · 🔧 Artigiani · 🎪 Fiere e sagre

## Guide pubbliche

Approfondimenti normativi e operativi (top-of-funnel SEO, accessibili a tutti):

- [Documento commerciale online: cos'è e come funziona](https://scontrinozero.it/guide/documento-commerciale-online)
- [Emettere scontrino senza registratore di cassa: si può?](https://scontrinozero.it/guide/scontrino-senza-registratore-di-cassa)
- [Differenza fra scontrino, ricevuta fiscale e fattura](https://scontrinozero.it/guide/differenza-scontrino-ricevuta-fattura)
- [Collegamento POS-RT: obbligo, scadenze e sanzioni 2026](https://scontrinozero.it/guide/pos-rt-obbligo-2026)
- [Scontrino in regime forfettario: cosa devi sapere](https://scontrinozero.it/guide/scontrino-regime-forfettario)
- [Migrare dal registratore telematico al software](https://scontrinozero.it/guide/migrare-da-registratore-telematico-a-software)
- [Chiusura giornaliera dei corrispettivi: come funziona oggi](https://scontrinozero.it/guide/chiusura-giornaliera-corrispettivi)
- [Annullare uno scontrino elettronico: procedura e normativa](https://scontrinozero.it/guide/annullare-scontrino-elettronico)
- [Lotteria degli Scontrini: cosa deve fare il commerciante](https://scontrinozero.it/guide/lotteria-scontrini-commerciante)
- [Come scegliere un software per scontrini elettronici](https://scontrinozero.it/guide/scegliere-software-scontrini-elettronici)

Tutte le guide sono disponibili anche dall'[hub `/guide`](https://scontrinozero.it/guide).

## Self-hosting

Per chi preferisce gestire l'installazione in autonomia (gratis, ma anche tutta la responsabilità):

1. Clona il repository e configura le variabili d'ambiente (`.env.example` come riferimento).
2. Crea un progetto Supabase Cloud (free tier sufficiente per cominciare) e applica le migrazioni:
   ```bash
   npx tsx scripts/migrate.ts
   ```
3. Genera la chiave di cifratura per le credenziali Fisconline:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   e impostala in `ENCRYPTION_KEY` (vedi `CLAUDE.md` per la procedura di rotazione).
4. Build e run con Docker Compose (`next-app` + `cloudflared`):
   ```bash
   docker compose pull && docker compose up -d
   ```
5. Punta il tuo dominio via Cloudflare Tunnel.

La versione self-hosted include tutte le funzionalità della versione SaaS; il vantaggio della versione hosted su `scontrinozero.it` sono backup, aggiornamenti automatici, supporto e hosting gestito.

## Stato del progetto

🚀 **v1.2.13 — in produzione su [scontrinozero.it](https://scontrinozero.it)**

Roadmap dettagliata in [`PLAN.md`](./PLAN.md). Lavoro in corso su SEO foundations (v1.2.8 → v1.2.15) e lancio open source.

## Licenza

O'Saasy License — self-hosted gratuito, SaaS a pagamento. Vietato usare il software per offrire un servizio hosted concorrente.

---

<p align="center">Made in 🇮🇹 Italy</p>
