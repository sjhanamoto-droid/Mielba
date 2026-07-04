"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LogIn, AlertCircle, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Field, Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    // size lg = 52px：軍手でも押しやすい 44px 以上のタップターゲット
    <button
      type="submit"
      disabled={pending}
      className={buttonClass({ size: "lg", className: "w-full" })}
    >
      {pending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" /> ログイン中...
        </>
      ) : (
        <>
          <LogIn className="h-5 w-5" /> ログイン
        </>
      )}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field label="メールアドレス" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="taro@example.com"
          required
        />
      </Field>
      <Field label="パスワード" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
