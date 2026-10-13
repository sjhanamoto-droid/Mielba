// 仮登録の現場で、現場に行けば分かる項目（住所・キーBOX・キーBOX写真）のうち足りないもの。
// 日報を書く前の「現場情報の確認」画面で、足りない項目だけを聞くために使う。
// 図面・工程表は事務所で入れる前提なのでここでは扱わない。

export type SiteEntryFields = {
  address: string | null;
  keyboxStatus: string | null;
  keyboxNumber: string | null;
  keyboxNoneReason: string | null;
  keyboxPhotoNoneReason: string | null;
};

export type SiteEntryMissing = { address: boolean; keybox: boolean; keyboxPhoto: boolean };

export function siteEntryMissing(site: SiteEntryFields, keyboxPhotoCount: number): SiteEntryMissing {
  const keyboxOk =
    site.keyboxStatus === "HAS"
      ? !!site.keyboxNumber?.trim()
      : site.keyboxStatus === "NONE"
        ? !!site.keyboxNoneReason?.trim()
        : false;
  return {
    address: !site.address?.trim(),
    keybox: !keyboxOk,
    keyboxPhoto: keyboxPhotoCount === 0 && !site.keyboxPhotoNoneReason?.trim(),
  };
}

export function hasSiteEntryMissing(m: SiteEntryMissing): boolean {
  return m.address || m.keybox || m.keyboxPhoto;
}
