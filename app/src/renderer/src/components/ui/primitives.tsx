import { forwardRef, type ReactElement, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Um botão veste a tinta do estado que resolve: ciano põe o servidor de pé,
// amarelo grava o que está por gravar, magenta fala com a outra mão, lápis
// desfaz. Bloco cheio, aresta viva, sem sombra — é tinta, não relevo.
const button = cva(
  "no-drag inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-0 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-cyan text-reg hover:bg-cyan/85",
        save: "bg-yellow text-reg hover:bg-yellow/85",
        coop: "bg-magenta text-white hover:bg-magenta/85",
        danger: "bg-pencil text-white hover:bg-pencil/85",
        outline: "border border-rule-strong text-text hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-text",
      },
      size: {
        sm: "h-[28px] px-3 text-[12px]",
        md: "h-[34px] px-5 text-[13px]",
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

// O campo é uma calha fresada: fundo recuado e a régua de baixo é a única
// aresta. Ao focar, a régua engrossa e toma a tinta da região.
const campo =
  "no-drag w-full bg-surface text-[13px] text-text border-b-2 border-rule focus:border-focus focus:outline-none placeholder:text-muted transition-colors duration-0";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(campo, "h-[32px] px-2.5", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(campo, "resize-y p-2.5 leading-[1.6]", className)} {...props} />
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
      <span className="mb-1.5 block font-narrow text-label font-semibold uppercase text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/** Título de seção com régua — a régua carrega a hierarquia, não o corpo da fonte. */
export function Rule({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="mb-5 mt-9 flex items-center gap-3 first:mt-0">
      <span className="font-narrow text-label font-semibold uppercase text-muted">{children}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
