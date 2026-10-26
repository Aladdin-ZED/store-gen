"use client";

import { RotateCcwIcon } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/admin/common/empty-state";
import { Screen } from "@/components/admin/common/screen";
import { Button } from "@/components/ui/button";

/** Panel error boundary: keeps the shell, explains briefly, offers a retry. */
export default function PanelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Screen>
      <EmptyState
        illustration="shield"
        title="This screen couldn't load"
        description={
          <>
            Something went wrong on our side — your data is safe. Try again in a moment.
            {error.digest && <span className="mt-2 block font-mono text-xs text-muted-foreground/80">Ref. {error.digest}</span>}
          </>
        }
        actions={
          <Button onClick={() => retry()} className="rounded-full">
            <RotateCcwIcon />
            Try again
          </Button>
        }
      />
    </Screen>
  );
}
