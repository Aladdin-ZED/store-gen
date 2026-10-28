"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // insecure context / denied permission: fall back to a hidden textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Icon (or labelled) copy button with a morphing check and a toast. */
export function CopyButton({
  value,
  label,
  toastMessage = "Copied to clipboard",
  className,
  size = "icon-sm",
  variant = "ghost",
  children,
}: {
  value: string;
  /** accessible name (and visible text when `children` is not given and size isn't an icon size) */
  label: string;
  toastMessage?: string;
  className?: string;
  size?: "icon-xs" | "icon-sm" | "icon" | "sm" | "default";
  variant?: "ghost" | "outline" | "secondary";
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const iconOnly = size.startsWith("icon");
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={cn("relative", className)}
      onClick={async (e) => {
        e.stopPropagation();
        if (await writeClipboard(value)) {
          setCopied(true);
          toast.success(toastMessage);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1600);
        } else {
          toast.error("Couldn't copy — select the text and copy it manually.");
        }
      }}
    >
      <span className="relative inline-flex size-4 items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={copied ? "done" : "copy"}
            initial={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
            transition={{ type: "tween", duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute inline-flex"
          >
            {copied ? <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" /> : <CopyIcon className="size-4" />}
          </motion.span>
        </AnimatePresence>
      </span>
      {!iconOnly && (children ?? label)}
    </Button>
  );
}

export { writeClipboard };
