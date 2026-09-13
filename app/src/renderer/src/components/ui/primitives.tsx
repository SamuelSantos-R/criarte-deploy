import { forwardRef, type ReactElement, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Os cargos das tintas continuam: primária põe o servidor de pé e é a ação
// principal, "save" grava o que está por gravar, "coop" fala com a outra mão,
// "danger" apaga. O que muda é a pele: botão macio, canto de 10px, e um
// afundar de 1px no clique — o Canva responde ao dedo, não pisca.
const button = cva(
  [
    "no-drag inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-cyan text-on-cyan shadow-sm hover:bg-cyan/90",
        save: "bg-yellow text-on-yellow shadow-sm hover:bg-yellow/90",
        coop: "bg-magenta text-on-magenta shadow-sm hover:bg-magenta/90",
        danger: "bg-pencil text-white shadow-sm hover:bg-pencil/90",
        outline: "border border-rule bg-surface text-text hover:border-rule-strong hover:bg-surface-2 rounded-lg",
        ghost: "text-muted hover:bg-surface-2 hover:text-text",
      },
      size: {
        sm: "h-8 px-3 text-[12px]",
        md: "h-10 px-5 text-[13px]",
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

// Campo de caixa inteira, como os do Canva: fundo do painel, borda fina que
// escurece sob o mouse e ganha anel na cor de foco do tema.
const campo = [
  "no-drag w-full rounded-lg border border-rule bg-surface text-[13px] text-text placeholder:text-muted",
  "transition-[border-color,box-shadow] duration-150 hover:border-rule-strong",
  "focus:border-focus focus:outline-hidden focus:ring-3 focus:ring-focus/20 disabled:opacity-50",
].join(" ");

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(campo, "h-9 px-3", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(campo, "resize-y px-3 py-2.5 leading-[1.6]", className)} {...props} />
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
      <span className="mb-1.5 block text-[12px] font-semibold text-text">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-[1.5] text-muted">{hint}</span>}
    </label>
  );
}

/** Título de grupo: peso e espaço em cima fazem a hierarquia; a régua fina só separa. */
export function Rule({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="mb-4 mt-10 flex items-center gap-3 first:mt-0">
      <span className="text-[13px] font-bold text-text">{children}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
