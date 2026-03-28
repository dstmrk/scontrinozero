-- Migration: 0008_unique_email_profiles
-- Aggiunge un vincolo UNIQUE case-insensitive sull'email in profiles.
--
-- Motivazione: il pre-check applicativo in signup è soggetto a race condition —
-- due richieste concorrenti possono entrambe passare il check e creare profili
-- duplicati con la stessa email. Il vincolo DB è l'unica garanzia atomica.
--
-- Scelta dell'indice funzionale su lower(email) invece di un UNIQUE inline:
-- - Permette di confrontare email case-insensitively (RFC 5321 consente
--   la parte locale case-sensitive, ma in pratica le email sono case-insensitive)
-- - È coerente con il pre-check applicativo (che usa eq con email normalizzata)
--
-- Nota: Supabase Auth gestisce già l'unicità in auth.users. Questo vincolo
-- protegge la tabella profiles da duplicati in edge case di concorrenza.

CREATE UNIQUE INDEX "idx_profiles_email_lower"
  ON "profiles" (lower("email"));
