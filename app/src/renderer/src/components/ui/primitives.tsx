import { forwardRef, type ReactElement, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Padding/raio/elevação variam de propósito entre variantes — o "tudo com a
// mesma cara" é justamente o que faz interface parecer gerada.
const button = cva(
  "no-drag inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-sage",
  {
    variants: {
      variant: {
        primary: "bg-accent text-ground hover:brightness-90",
        ghost: "text-muted hover:text-text hover:bg-surface-2",
        outline: "border border-rule text-text hover:border-rule-strong hover:bg-surface",
        danger: "border border-bad/40 text-bad hover:bg-bad/10",
      },
      size: {
        sm: "h-[30px] px-3 text-[12px] rounded-[3px]",
        md: "h-[38px] px-5 text-[13px] rounded-[4px]",
      },
    },
    defaultVariants: { variant: "outline", size: "sm" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(button({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "no-drag h-[34px] w-full bg-surface px-3 text-[13px] text-text",
        "border-b border-rule focus:border-sage focus:outline-none",
        "placeholder:text-muted/50 transition-colors",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "no-drag w-full resize-y bg-surface p-3 text-[13px] leading-[1.6] text-text",
        "border-b border-rule focus:border-sage focus:outline-none",
        "placeholder:text-muted/50 transition-colors",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-label uppercase text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted/70">{hint}</span>}
    </label>
  );
}

/** Título de seção com régua — a régua carrega a hierarquia, não o tamanho da fonte. */
export function Rule({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="mb-5 mt-9 flex items-center gap-3 first:mt-0">
      <span className="font-mono text-label uppercase text-muted">{children}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
