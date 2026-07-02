"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Save, KeyRound } from "lucide-react";
import { updateAccount, changePassword, type SettingsState } from "./actions";
import { Field, Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { ColorPicker } from "./color-picker";

function Feedback({ state, okText }: { state: SettingsState; okText: string }) {
  if (state.error) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {state.error}
      </div>
    );
  }
  if (state.ok) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {okText}
      </div>
    );
  }
  return null;
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ className: "w-full" })}>
      {pending ? "保存中..." : children}
    </button>
  );
}

type AccountUser = { name: string; department: string | null; avatarColor: string; email: string };

export function AccountForm({ user }: { user: AccountUser }) {
  const [state, action] = useActionState<SettingsState, FormData>(updateAccount, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="メールアドレス">
        <Input defaultValue={user.email} disabled />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="氏名" htmlFor="acc-name" required>
          <Input id="acc-name" name="name" defaultValue={user.name} required />
        </Field>
        <Field label="部署" htmlFor="acc-dept" hint="任意">
          <Input id="acc-dept" name="department" defaultValue={user.department ?? ""} placeholder="例：工事部" />
        </Field>
      </div>
      <Field label="アバター色">
        <ColorPicker name="avatarColor" defaultValue={user.avatarColor} />
      </Field>
      <Feedback state={state} okText="アカウント情報を保存しました" />
      <SubmitButton><Save className="h-5 w-5" /> 保存する</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<SettingsState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="現在のパスワード" htmlFor="pw-current" required>
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="新しいパスワード" htmlFor="pw-next" required hint="6文字以上">
        <Input id="pw-next" name="next" type="password" autoComplete="new-password" required />
      </Field>
      <Feedback state={state} okText="パスワードを変更しました" />
      <SubmitButton><KeyRound className="h-5 w-5" /> パスワードを変更</SubmitButton>
    </form>
  );
}
