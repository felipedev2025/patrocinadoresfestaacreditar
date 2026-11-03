-- Reverte 20261103130110_lista_oficial_ordem_manual.
-- ATENÇÃO: apaga listas importadas, linhas (slots), apelidos e a ordem manual dos patrocinadores.
-- Uso na VPS:
--   cd /opt/patrocinios && docker compose exec -T postgres psql -U patro -d patrocinios -v ON_ERROR_STOP=1 < prisma/migrations/20261103130110_lista_oficial_ordem_manual/down.sql
-- Depois volte o código para a versão anterior (git checkout <commit>) e rode docker compose up -d --build.
BEGIN;
ALTER TABLE "MediaAsset" DROP CONSTRAINT IF EXISTS "MediaAsset_importedListId_fkey";
DROP INDEX IF EXISTS "MediaAsset_importedListId_idx";
ALTER TABLE "MediaAsset" DROP COLUMN IF EXISTS "importedListId";
DROP TABLE IF EXISTS "SponsorSlot";
DROP TABLE IF EXISTS "ImportedList";
DROP TABLE IF EXISTS "CompanyAlias";
DROP INDEX IF EXISTS "Sponsorship_eventId_eventOrder_idx";
ALTER TABLE "Sponsorship" DROP COLUMN IF EXISTS "eventOrder";
DROP TYPE IF EXISTS "SlotStatus";
DROP TYPE IF EXISTS "ListSource";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261103130110_lista_oficial_ordem_manual';
COMMIT;
