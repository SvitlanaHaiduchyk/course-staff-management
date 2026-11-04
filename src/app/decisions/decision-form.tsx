"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { messages, type Lang } from "@/lib/i18n/dict";
import {
  type Decision,
  RETURN_NEEDS_COMMENT,
  commentRequired,
  decisionLabel,
} from "@/lib/leave/decision";

import { decideRecord } from "./actions";

// Підтвердження діалогом — на розсуд розробника (…spec#17). Робимо його тому,
// що «Approved» і «Rejected» у цьому зрізі скасувати не можна.
export function DecisionForm({
  recordId,
  decision,
  summary,
  lang,
  withSplit = false,
}: {
  recordId: string;
  decision: Decision;
  summary: string;
  /** Клієнтський компонент не читає cookie — мову передає сторінка. */
  lang: Lang;
  /** Запис перевищує залишок: погоджуємо лише з поділом (AC-BALANCE-16). */
  withSplit?: boolean;
}) {
  const m = messages(lang);
  const [open, setOpen] = useState(false);
  const needsComment = commentRequired(decision);
  const commentLabel = m(needsComment ? "decisions.comment" : "decisions.commentOptional");
  // Підказка обов'язкового коментаря — дослівний текст AC-DECIDE-04, тож береться
  // з того самого місця, що й відмова сервера, і однакова в обох мовах.
  const commentPlaceholder = needsComment
    ? RETURN_NEEDS_COMMENT
    : m("decisions.commentHintOptional");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={decision === "approved" ? "default" : "outline"} size="sm">
            {decisionLabel(decision)}
          </Button>
        }
      />
      <DialogContent>
        <form action={decideRecord}>
          <input type="hidden" name="recordId" value={recordId} />
          <input type="hidden" name="decision" value={decision} />
          {withSplit ? <input type="hidden" name="withSplit" value="1" /> : null}
          <DialogHeader>
            <DialogTitle>
              {withSplit ? `${decisionLabel(decision)} with split` : decisionLabel(decision)}
            </DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor={`comment-${recordId}-${decision}`}>
              {commentLabel}
            </Label>
            <Textarea
              id={`comment-${recordId}-${decision}`}
              name="comment"
              maxLength={500}
              // Без required: інакше браузер блокує порожню форму СВОЇМ повідомленням,
              // і текст PM «Tell the employee what to fix» (AC-DECIDE-04) не з'являється.
              // Порожній коментар має дійти до сервера — там і база, і дія відмовлять
              // дослівним текстом критерію.
              aria-required={needsComment}
              placeholder={commentPlaceholder}
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" type="button">{m("decisions.cancel")}</Button>} />
            <Button type="submit">{decisionLabel(decision)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
