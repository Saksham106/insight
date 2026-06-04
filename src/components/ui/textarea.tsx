import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, style, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "rounded-md border border-border bg-white px-3 py-2 text-sm shadow-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    style={{ minHeight: "80px", width: "100%", ...style }}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
