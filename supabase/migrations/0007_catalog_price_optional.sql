-- Rende il prezzo del catalogo opzionale (NULL = prezzo da definire al momento)
ALTER TABLE "catalog_items" ALTER COLUMN "default_price" DROP NOT NULL;
