"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { addComment } from "./actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="送信"
      className={buttonClass({ variant: "primary", size: "icon", className: "shrink-0" })}
    >
      <Send className="h-5 w-5" />
    </button>
  );
}

export function CommentForm({ reportId }: { reportId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        const res = await addComment(formData);
        if (res?.ok) formRef.current?.reset();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="reportId" value={reportId} />
      <Input
        name="body"
        placeholder="コメントを入力..."
        autoComplete="off"
        required
        className="flex-1"
      />
      <SendButton />
    </form>
  );
}
