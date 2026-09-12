-- 現場の作成時に「現調」か「受注済」かを選べるようにしたことに伴う整理。
-- 現調は区分(siteStatus='SURVEY')で表すため、受注済の現場の工程は「配線」から始める。
-- 既存の進行中の現場は全て projectStatus='ESTIMATING'（工程バー上は「現調」）のまま
-- 作られていたので、一括で「配線」に移して表示を揃える。
-- 実際に現調段階の現場はこの時点では存在しない（現調区分で作れるようになったのが今回のため）。
UPDATE "Site"
SET "projectStatus" = 'ORDERED'
WHERE "siteStatus" = 'ACTIVE' AND "projectStatus" = 'ESTIMATING';
