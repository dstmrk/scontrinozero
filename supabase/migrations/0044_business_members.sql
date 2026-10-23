-- Migration 0044: appartenenza alle attività e autore dei documenti
--
-- Prima PR dati della issue #1099 (piano Team con collaboratori). Due cose,
-- entrambe idempotenti e senza effetti visibili.
--
-- 1. `business_members`: chi può operare su un'attività, con un ruolo. Oggi
--    contiene solo i titolari, una riga per attività (backfill qui sotto); i
--    collaboratori arriveranno con gli inviti. `profiles` resta l'account del
--    titolare (piano, trial, P.IVA, referral): un collaboratore esisterà solo
--    qui, senza profilo.
--
--    `auth_user_id` è nullable: quando un collaboratore viene rimosso il suo
--    account si cancella, ma la riga resta perché i documenti restano suoi.
--    Nessuna FK verso auth.users, come `subscriptions.user_id`.
--
-- 2. `commercial_documents.created_by`: il membro che ha emesso, annullato o
--    reso il documento. NULL sui documenti della Developer API, che restano
--    attribuiti via `api_key_id`. Le righe esistenti non-API vanno al
--    titolare: è l'unica attribuzione che conosciamo, anche per i documenti
--    emessi da chi usava la sua password.
--
--    FK senza ON DELETE (NO ACTION): un membro non si cancella finché ha
--    documenti. L'unica cancellazione è la cascata dell'attività, che porta via
--    documenti e membri nello stesso statement, e NO ACTION controlla a fine
--    statement. Mai CASCADE: cancellerebbe documenti fiscali.

CREATE TABLE IF NOT EXISTS business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  auth_user_id uuid,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_members_role_check
    CHECK (role IN ('owner', 'collaborator'))
);

-- Una persona appartiene a una sola attività.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_members_auth_user
  ON business_members (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Un solo titolare per attività.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_members_one_owner
  ON business_members (business_id)
  WHERE role = 'owner';

-- Cascata dalla cancellazione dell'attività ed elenco dei membri.
CREATE INDEX IF NOT EXISTS idx_business_members_business
  ON business_members (business_id);

-- Server-only, come referral_redemptions e partners (0035): RLS senza policy
-- vuol dire nessuna riga per anon e authenticated. L'app la legge e la scrive
-- solo come owner `postgres` via Drizzle. La revoca delle scritture la fanno
-- già i default privileges di 0043; ripetuta qui per un DB ricreato senza.
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON business_members FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END $$;

-- Un titolare per ogni attività esistente. ON CONFLICT senza target copre
-- entrambi gli indici unici: un re-run non duplica nulla.
INSERT INTO business_members (business_id, auth_user_id, role)
SELECT b.id, p.auth_user_id, 'owner'
FROM businesses b
JOIN profiles p ON p.id = b.profile_id
ON CONFLICT DO NOTHING;

-- Backfill legato alla creazione della colonna (skill db-migrations): al
-- secondo passaggio un `WHERE created_by IS NULL` prenderebbe i documenti
-- della Developer API emessi dopo, dove NULL vuol dire "via API".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commercial_documents' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE commercial_documents ADD COLUMN created_by uuid;
    UPDATE commercial_documents cd
       SET created_by = m.id
      FROM business_members m
     WHERE m.business_id = cd.business_id
       AND m.role = 'owner'
       AND cd.api_key_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_comm_docs_created_by'
  ) THEN
    ALTER TABLE commercial_documents
      ADD CONSTRAINT fk_comm_docs_created_by
      FOREIGN KEY (created_by)
      REFERENCES business_members (id);
  END IF;
END $$;

-- Filtro e totali per collaboratore nello storico del titolare.
CREATE INDEX IF NOT EXISTS idx_commercial_documents_business_created_by
  ON commercial_documents (business_id, created_by);
