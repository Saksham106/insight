import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-soft text-foreground",
        navy: "bg-navy text-white",
        gold: "bg-gold text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={{ minWidth: "6.5rem", justifyContent: "center", ...style }}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
