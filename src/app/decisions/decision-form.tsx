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
import { type Decision, commentRequired, decisionLabel } from "@/lib/leave/decision";

import { decideRecord } from "./actions";

// Підтвердження діалогом — на розсуд розробника (…spec#17). Робимо його тому,
// що «Approved» і «Rejected» у цьому зрізі скасувати не можна.
export function DecisionForm({
  recordId,
  decision,
  summary,
}: {
  recordId: string;
  decision: Decision;
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const needsComment = commentRequired(decision);

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
          <DialogHeader>
            <DialogTitle>{decisionLabel(decision)}</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor={`comment-${recordId}-${decision}`}>
              Коментар{needsComment ? "" : " (необов'язковий)"}
            </Label>
            <Textarea
              id={`comment-${recordId}-${decision}`}
              name="comment"
              maxLength={500}
              required={needsComment}
              placeholder={
                needsComment ? "Tell the employee what to fix" : "Видно працівнику в «My requests»"
              }
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="ghost" type="button">Скасувати</Button>} />
            <Button type="submit">{decisionLabel(decision)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
