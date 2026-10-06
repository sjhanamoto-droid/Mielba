-- 現場メモ（SiteMemo の時系列）を廃止し、現場情報の「備考」（Site.memo）へ移植する。
-- 各メモを「YYYY/MM/DD 投稿者：本文」として古い順に空行区切りで連結する。
-- 旧 Site.memo は 0015 で SiteMemo へ移行済みのため、ここで上書きする（メモの無い現場は NULL）。
-- SiteMemo の行は残す（添付の写真・動画が Photo.memoId で紐づいており、「写真・動画」に出し続けるため）。
UPDATE "Site" s SET "memo" = (
  SELECT string_agg(
    to_char(m."createdAt" + interval '9 hours', 'YYYY/MM/DD')
      || COALESCE(' ' || u."name", '') || '：' || m."content",
    E'\n\n' ORDER BY m."createdAt"
  )
  FROM "SiteMemo" m
  LEFT JOIN "User" u ON u."id" = m."createdById"
  WHERE m."siteId" = s."id"
);
