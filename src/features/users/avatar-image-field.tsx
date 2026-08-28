"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

// アバター画像は小さく使う（円形・最大48px程度）ので、256pxのJPEGに圧縮すれば十分。
const MAX_DIM = 256;
const JPEG_QUALITY = 0.82;

function scaleDims(width: number, height: number, max: number): { width: number; height: number } {
  if (width > height && width > max) {
    return { width: max, height: Math.round((height * max) / width) };
  }
  if (height >= width && height > max) {
    return { width: Math.round((width * max) / height), height: max };
  }
  return { width, height };
}

// 画像を最大256pxのJPEG data URLに圧縮する
function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const d = scaleDims(img.width, img.height, MAX_DIM);
          const canvas = document.createElement("canvas");
          canvas.width = d.width;
          canvas.height = d.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas error");
          ctx.drawImage(img, 0, 0, d.width, d.height);
          resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * スタッフのプロフィール画像アップロード欄。
 * hidden input `name`（既定 avatarImage）に data URL（未設定なら空文字）を載せる。
 * サーバー側は空文字→null（画像なし＝色＋イニシャル）として扱う。
 */
export function AvatarImageField({
  name = "avatarImage",
  defaultImage = null,
  personName,
  color,
}: {
  name?: string;
  defaultImage?: string | null;
  personName: string;
  color?: string;
}) {
  const [image, setImage] = useState<string | null>(defaultImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setImage(await compressAvatar(file));
    } catch {
      setError("画像の読み込みに失敗しました。別の画像でお試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input type="hidden" name={name} value={image ?? ""} />
      <Avatar name={personName} color={color} image={image} size="lg" className="h-16 w-16 text-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-bold text-ink-soft active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-brand-600" />}
            {image ? "画像を変更" : "画像を選ぶ"}
          </button>
          {image && (
            <button
              type="button"
              onClick={() => setImage(null)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-bold text-status-danger active:scale-95 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              削除
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-faint">
          任意。未設定なら色＋イニシャルで表示します。選んだ画像は自動で軽量化（最大{MAX_DIM}px）します。
        </p>
        {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
