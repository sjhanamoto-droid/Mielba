// ブラウザから Vercel Blob へ直接アップロードする（クライアント専用）。
//
// サーバーで署名付き PUT URL を発行してもらい（/api/media/upload-url）、本体はそこへ直接 PUT する。
// アプリの関数を通さないので Vercel の 4.5MB ボディ上限に当たらない。
// 日報の写真・動画と、現場の図面・工程表・キーBOX写真で共通に使う。

/** 進捗つきで Blob へ直接 PUT する（fetch では進捗が取れないので XHR を使う） */
function putWithProgress(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // 署名に含めた形式と一致させる（ここがずれると CDN 側で弾かれる）
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(file);
  });
}

/** Blob のアップロード先を取り、本体を直接 PUT する。label はエラー文に出すファイル名 */
export async function uploadToBlob(
  body: Blob,
  contentType: string,
  label: string,
  onProgress: (ratio: number) => void = () => {},
): Promise<{ blobPath: string } | { error: string }> {
  let res: Response;
  try {
    res = await fetch("/api/media/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType, sizeBytes: body.size }),
    });
  } catch {
    return { error: `${label} のアップロードを開始できませんでした。電波の良い場所で再度お試しください` };
  }
  if (!res.ok) {
    const info = (await res.json().catch(() => null)) as { error?: string } | null;
    return { error: info?.error ?? `${label} のアップロードを開始できませんでした` };
  }
  const { uploadUrl, blobPath } = (await res.json()) as {
    uploadUrl: string;
    blobPath: string;
  };
  try {
    await putWithProgress(uploadUrl, body, contentType, onProgress);
  } catch {
    return { error: `${label} のアップロードに失敗しました。電波の良い場所で再度お試しください` };
  }
  return { blobPath };
}
