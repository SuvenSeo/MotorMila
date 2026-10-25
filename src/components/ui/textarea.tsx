import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/ui/input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return <textarea className={cn(fieldClass, "flex min-h-[88px] py-2.5", className)} ref={ref} {...props} />;
});
Textarea.displayName = "Textarea";

export { Textarea };
