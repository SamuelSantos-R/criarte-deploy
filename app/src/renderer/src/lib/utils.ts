import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

type Result<T> = { ok: true; data: T } | { ok: false; erro: string };

/** Desembrulha o Result do IPC; erro vira throw pra quem chama tratar num lugar só. */
export async function call<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.erro);
  return r.data;
}
