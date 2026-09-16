"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { addSitePhotos, deleteSitePhoto } from "./photo-actions";
import { PhotoGrid, type PhotoData } from "@/components/photo-grid";
import {
  PhotoUploader,
  serializeUploaderPhotos,
  type PhotoUploaderHandle,
  type UploaderPhoto,
} from "@/components/photo-uploader";
import { SectionTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";

// 現場詳細の「写真・動画」セクション。「連絡・メモ」「現場情報」の両タブに同じものを置く。
// 現調記録・日報・現場メモの写真をまとめて見せ、ここから直接追加もできる。
// 追加した写真の置き場は現場のステータスで自動で決まる（現調中なら「現調」、それ以外は「施工」）。
// 写真は選んだ時点で Blob へ上がり、上がり切ったら自動で保存する（保存ボタンは押させない）。
// 保存が済んだ分だけをアップローダーから外す（作り直さない）ので、保存中に選んだ分も失われない。

/** 一覧の1件。deletable はこのセクションから外せる写真か（日報・メモの写真は各画面から） */
export type SitePhotoItem = PhotoData & { deletable: boolean };

const FAIL_MSG = "通信に失敗しました。もう一度お試しください。";

export function SitePhotosSection({
  siteId,
  surveyPhotos,
  workPhotos,
  siteInSurvey,
}: {
  siteId: string;
  /** 現調タブ（現調記録の写真＋現調中に書いたメモの添付）。古い順 */
  surveyPhotos: SitePhotoItem[];
  /** 施工タブ（日報の写真＋現場直付けの施工写真＋受注後のメモの添付）。新しい順 */
  workPhotos: SitePhotoItem[];
  /** 現調中か（追加した写真が「現調」に入る） */
  siteInSurvey: boolean;
}) {
  const target: "survey" | "work" = siteInSurvey ? "survey" : "work";
  // 追加先のタブを開いておく。ただし追加先が空でもう一方に写真があるなら、そちらを見せる
  const defaultTab =
    target === "survey"
      ? surveyPhotos.length === 0 && workPhotos.length > 0
        ? "work"
        : "survey"
      : workPhotos.length === 0 && surveyPhotos.length > 0
        ? "survey"
        : "work";

  // アップローダーが持っている「まだ保存していない」ファイル
  const [pending, setPending] = useState<UploaderPhoto[]>([]);
  const pendingRef = useRef<UploaderPhoto[]>([]);
  const uploaderRef = useRef<PhotoUploaderHandle | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // 保存中に「保存したい」が来たら、終わってからもう一度走らせる
  const queuedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // 保存に失敗した分はアップローダーに残し、「もう一度保存」で再送する（自動保存はしない）
  const [needsRetry, setNeedsRetry] = useState(false);
  // 保存できたら追加先のタブを開き直す（別のタブを見ていても新しい写真が目に入るように）
  const [openTab, setOpenTab] = useState<{ id: "survey" | "work"; n: number } | null>(null);

  function onPendingChange(photos: UploaderPhoto[]) {
    pendingRef.current = photos;
    setPending(photos);
  }

  async function save(photos: UploaderPhoto[]) {
    if (photos.length === 0) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await addSitePhotos(siteId, serializeUploaderPhotos(photos));
      if (res && "error" in res && res.error) {
        setError(res.error);
        setNeedsRetry(true);
      } else {
        setNeedsRetry(false);
        // 送った分だけ外す。保存中に選んだ分やアップロード中の分はそのまま残る
        uploaderRef.current?.remove(
          photos.map((p) => p.blobPath).filter((p): p is string => !!p),
        );
        setOpenTab((prev) => ({ id: target, n: (prev?.n ?? 0) + 1 }));
      }
    } catch {
      setError(FAIL_MSG);
      setNeedsRetry(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        void save(pendingRef.current);
      }
    }
  }

  // アップロードが一段落したら自動で保存する
  useEffect(() => {
    if (uploading || needsRetry || pending.length === 0) return;
    void save(pending);
    // save は siteId 以外に依存しない。pending/uploading の変化だけで走らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading, pending, needsRetry]);

  const deletable = new Set(
    [...surveyPhotos, ...workPhotos].filter((p) => p.deletable).map((p) => p.id),
  );
  const canDelete = (p: PhotoData) => deletable.has(p.id);
  const onDelete = async (p: PhotoData) => {
    try {
      const res = await deleteSitePhoto(p.id);
      return res && "error" in res && res.error ? { error: res.error } : undefined;
    } catch {
      return { error: FAIL_MSG };
    }
  };

  const total = surveyPhotos.length + workPhotos.length;
  const showRetry = needsRetry && pending.length > 0;

  return (
    <section className="space-y-2.5">
      <SectionTitle
        action={
          total > 0 ? (
            <span className="text-xs font-semibold text-ink-muted tnum">{total}件</span>
          ) : undefined
        }
      >
        写真・動画
      </SectionTitle>

      {/* ここから直接追加できる。未選択のあいだはボタンだけ */}
      <div className="space-y-1.5 px-1">
        <PhotoUploader
          variant="compact"
          addLabel="写真・動画を追加"
          defaultKind={target === "survey" ? "SURVEY" : "WORK"}
          disabled={saving}
          controlRef={uploaderRef}
          onChange={onPendingChange}
          onBusyChange={setUploading}
        />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint">
          {saving ? (
            <span className="flex items-center gap-1 text-ink-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              保存しています…
            </span>
          ) : showRetry ? (
            <span className="text-ink-muted">保存できていない写真・動画があります。</span>
          ) : target === "survey" ? (
            <span>追加した写真・動画は「現調」に入ります（現調中のため）。</span>
          ) : (
            <span>追加した写真・動画は「施工」に入ります。</span>
          )}
        </p>
        {(error || showRetry) && (
          <p
            role="alert"
            className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-status-danger"
          >
            {error && <span>{error}</span>}
            {showRetry && (
              <button
                type="button"
                onClick={() => {
                  setNeedsRetry(false);
                  void save(pendingRef.current);
                }}
                disabled={saving}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-status-danger/40 px-2 text-status-danger"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                もう一度保存
              </button>
            )}
          </p>
        )}
      </div>

      {/* 保存のたびに key を変えて追加先のタブで開き直す（openTab は props に依らない明示の指定） */}
      <Tabs
        key={openTab ? `${openTab.id}-${openTab.n}` : "initial"}
        defaultId={openTab?.id ?? defaultTab}
        tabs={[
          {
            id: "survey",
            label: "現調",
            count: surveyPhotos.length,
            content:
              surveyPhotos.length > 0 ? (
                <PhotoGrid photos={surveyPhotos} canDelete={canDelete} onDelete={onDelete} />
              ) : (
                <p className="px-1 py-2 text-sm text-ink-muted">
                  現調の写真はまだありません。上の「写真・動画を追加」（現調中のとき）や現調フォーマット、現調中の現場メモから追加できます。
                </p>
              ),
          },
          {
            id: "work",
            label: "施工",
            count: workPhotos.length,
            content:
              workPhotos.length > 0 ? (
                <PhotoGrid photos={workPhotos} canDelete={canDelete} onDelete={onDelete} />
              ) : (
                <p className="px-1 py-2 text-sm text-ink-muted">
                  施工の写真はまだありません。上の「写真・動画を追加」や、日報・現場メモに付けた写真がここに並びます。
                </p>
              ),
          },
        ]}
      />
    </section>
  );
}
