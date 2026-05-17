-- Migration number: 0003 	 2026-05-17T08:30:00.000Z
--
-- Rows written before 0002 added stats_json/sources_json got the column
-- DEFAULT '{}' / '[]'. The daily catch-up path uses INSERT ... skipIfExists,
-- so those rows were never repopulated — listBriefings (and therefore the
-- livesnap card, /threatintel pulse, and the briefings list page) reported
-- 0 findings / 0 IOCs while the full body JSON held the real numbers.
--
-- Backfill the two derived columns from the authoritative body JSON.
-- json_extract(body,'$.stats') returns the stats object as JSON text.

UPDATE briefings
SET
  stats_json   = COALESCE(json_extract(body, '$.stats'), stats_json),
  sources_json = COALESCE(json_extract(body, '$.sources'), sources_json)
WHERE stats_json IS NULL
   OR stats_json = ''
   OR stats_json = '{}';
