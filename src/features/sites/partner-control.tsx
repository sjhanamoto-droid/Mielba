"use client";

import { useTransition, useState } from "react";
import { HardHat, Phone, Plus, X } from "lucide-react";
import { addSitePartner, removeSitePartner } from "./actions";
import { Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PartnerRow = {
  id: string;
  name: string;
  role: string | null;
  contact: string | null;
};

export function PartnerControl({
  siteId,
  partners,
}: {
  siteId: string;
  partners: PartnerRow[];
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!name.trim()) {
      setError("協力会社名を入力してください");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("role", role);
    fd.set("contact", contact);
    start(async () => {
      const res = await addSitePartner(siteId, fd);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setName("");
      setRole("");
      setContact("");
    });
  }

  function remove(id: string) {
    start(async () => {
      await removeSitePartner(id);
    });
  }

  // 現場詳細の「その他の情報」タブ内で使う（外側のカードはタブが持つ）。
  // 右レールの狭い幅でも崩れないよう、名前＋役割／電話 を縦に積む。
  return (
    <div className={cn("space-y-2.5", pending && "opacity-70")}>
      {partners.length > 0 ? (
        <div className="divide-y divide-line">
          {partners.map((p) => (
            <div key={p.id} className="flex items-start gap-2 py-2 text-sm">
              <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {p.name}
                  {p.role && <span className="ml-1.5 text-xs font-normal text-ink-muted">{p.role}</span>}
                </p>
                {p.contact && (
                  <a
                    href={`tel:${p.contact}`}
                    className="mt-0.5 inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-brand-600"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {p.contact}
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={pending}
                aria-label="協力会社を削除"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-muted active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-1 text-center text-sm text-ink-muted">協力会社の登録はありません</p>
      )}

      <div className="space-y-2 rounded-xl border border-dashed border-line-strong bg-surface/50 p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="協力会社名"
        />
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="担当工種・役割（任意）"
        />
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="連絡先（任意）"
        />
        {error && <p className="text-xs font-medium text-status-danger">{error}</p>}
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className={buttonClass({ size: "md", className: "w-full" })}
        >
          <Plus className="h-4 w-4" />
          協力会社を追加
        </button>
      </div>
    </div>
  );
}
