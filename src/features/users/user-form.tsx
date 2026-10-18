"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Save, UserPlus } from "lucide-react";
import { createUser, updateUser, type UserFormState } from "./actions";
import { Field, Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { ColorPicker } from "@/features/settings/color-picker";
import { AvatarImageField } from "./avatar-image-field";
import { PayRateFields } from "./pay-rate-fields";
import { ROLE_OPTIONS, ROLE_OPTIONS_SUPER_ADMIN, ROLE_LABEL } from "@/lib/constants";

type UserData = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  avatarColor: string;
  avatarImage?: string | null;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      {pending ? "保存中..." : isEdit ? (
        <><Save className="h-5 w-5" /> 保存する</>
      ) : (
        <><UserPlus className="h-5 w-5" /> スタッフを追加</>
      )}
    </button>
  );
}

export function UserForm({
  user,
  canAssignSuperAdmin = false,
  payRateTodayKey,
}: {
  user?: UserData;
  /** 最高管理者の付与可否（最高管理者のみ true）。選択肢の出し分けに使う */
  canAssignSuperAdmin?: boolean;
  /** 指定時は新規追加フォームに「給与・原価単価」欄を出す（最高管理者のみ。値は今日の日付キー） */
  payRateTodayKey?: string;
}) {
  const [role, setRole] = useState(user?.role ?? "STAFF");
  const isEdit = !!user;
  const [state, formAction] = useActionState<UserFormState, FormData>(
    isEdit ? updateUser : createUser,
    {},
  );
  // 編集中の相手が既に最高管理者なら、その選択肢は必ず出す（最高管理者本人が編集する前提）
  const roleOptions =
    canAssignSuperAdmin || user?.role === "SUPER_ADMIN"
      ? ROLE_OPTIONS_SUPER_ADMIN
      : ROLE_OPTIONS;

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={user.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="氏名" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={user?.name} placeholder="例：山田 太郎" required />
        </Field>
        <Field label="権限" htmlFor="role" required>
          <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </Select>
        </Field>
        <Field label="メールアドレス" htmlFor="email" required className="sm:col-span-2">
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="off" defaultValue={user?.email} placeholder="user@example.com" required />
        </Field>
        <Field label="部署" htmlFor="department" hint="任意" className="sm:col-span-2">
          <Input id="department" name="department" defaultValue={user?.department ?? ""} placeholder="例：工事部 / 内装 / 設備" />
        </Field>
      </div>

      {!isEdit && payRateTodayKey && (
        <fieldset className="space-y-3 rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-bold text-ink">
            給与・原価単価 <span className="text-xs font-normal text-ink-faint">任意・最高管理者のみ表示</span>
          </legend>
          <PayRateFields role={role} todayKey={payRateTodayKey} />
        </fieldset>
      )}

      <Field label="プロフィール画像" hint="任意">
        <AvatarImageField
          personName={user?.name ?? "スタッフ"}
          color={user?.avatarColor}
          defaultImage={user?.avatarImage ?? null}
        />
      </Field>

      <Field label="アバター色" hint="画像未設定のときの色">
        <ColorPicker name="avatarColor" defaultValue={user?.avatarColor} />
      </Field>

      <Field
        label={isEdit ? "パスワード" : "初期パスワード"}
        htmlFor="password"
        required={!isEdit}
        hint={isEdit ? "変更する場合のみ入力（空欄なら変更しません）" : "6文字以上"}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder={isEdit ? "••••••••" : "6文字以上で設定"}
          required={!isEdit}
        />
      </Field>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton isEdit={isEdit} />
    </form>
  );
}
