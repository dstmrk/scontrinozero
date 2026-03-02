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
- **Gestione resi e annullamenti** — con un tap
- **Lotteria degli scontrini** — supporto integrato per la lettura del codice cliente
- **Multi-dispositivo** — usa la stessa cassa da smartphone, tablet o browser
- **Stampa opzionale** — condividi lo scontrino via QR code, email, WhatsApp o stampa Bluetooth
- **Dashboard vendite** — monitora incassi e corrispettivi in tempo reale
- **Export dati** — esporta i corrispettivi in CSV/Excel per il commercialista

## Tech Stack

> 🚧 In definizione — contributi e suggerimenti benvenuti

## Conformità normativa

ScontrinoZero opera come interfaccia alla procedura web dell'Agenzia delle Entrate, garantendo:

- **Contestualità** dell'adempimento (memorizzazione + trasmissione + emissione in un unico flusso)
- **Nessuna alterazione** dei dati trasmessi o ricevuti dall'AdE
- **Nessuna intermediazione** — il dispositivo dell'esercente comunica direttamente con i sistemi dell'Agenzia

## Target

Pensato per chi emette scontrini ma non vuole (o non può) investire in un registratore telematico fisico:

🏪 Piccoli negozi · 💇 Parrucchieri e centri estetici · 🏨 B&B e affittacamere · 🚐 Ambulanti · 🚗 NCC · 🔧 Artigiani · 🎪 Fiere e sagre

## Stato del progetto

📋 **Fase**: Definizione requisiti e architettura

## Licenza
O’Saasy License


---

<p align="center">Made in 🇮🇹 Italy</p>
