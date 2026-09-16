import { useState } from "react";
import { Button } from "./button";

/**
 * A "Delete" button that arms into an inline "Cancel / Yes, delete" pair on
 * first click, rather than a native `window.confirm()` (which looks and
 * behaves inconsistently across mobile browsers and installed PWAs, and
 * doesn't match this app's own Dialog-based styling).
 */
export function DeleteButton({
  onConfirm,
  label = "Delete",
  disabled,
  pending,
}: {
  onConfirm: () => void;
  label?: string;
  disabled?: boolean;
  pending?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Delete for good?</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setArmed(false)} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => {
            onConfirm();
            setArmed(false);
          }}
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={() => setArmed(true)}>
      {label}
    </Button>
  );
}
