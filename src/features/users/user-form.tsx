"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Save, UserPlus } from "lucide-react";
import { createUser, updateUser, type UserFormState } from "./actions";
import { Field, Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { ColorPicker } from "@/features/settings/color-picker";
import { ROLE_OPTIONS, ROLE_LABEL } from "@/lib/constants";

type UserData = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  avatarColor: string;
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

export function UserForm({ user }: { user?: UserData }) {
  const isEdit = !!user;
  const [state, formAction] = useActionState<UserFormState, FormData>(
    isEdit ? updateUser : createUser,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={user.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="氏名" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={user?.name} placeholder="例：山田 太郎" required />
        </Field>
        <Field label="権限" htmlFor="role" required>
          <Select id="role" name="role" defaultValue={user?.role ?? "STAFF"}>
            {ROLE_OPTIONS.map((r) => (
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

      <Field label="アバター色">
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
