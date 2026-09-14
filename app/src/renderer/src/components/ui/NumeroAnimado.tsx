import { type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Número que troca com desfoque e escala, em vez de saltar. A troca com blur é
 * a do "Animated number" do Skiper UI (skiper37, componente free — skiper-ui.com).
 */
export function NumeroAnimado({ valor, className }: { valor: number; className?: string }): ReactElement {
  return (
    <span className={cn("relative inline-flex overflow-hidden tabular-nums", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={valor}
          initial={{ opacity: 0, y: 8, scale: 0.6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, scale: 0.6, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          {valor}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
