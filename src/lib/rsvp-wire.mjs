// ============================================================================
// RSVP-WIRE — liga o formulário de RSVP ao useGuest (token) automaticamente
// ============================================================================
// O `tokenizar` copia guest.tsx + guests.example.json, mas o convite só vira
// "por convidado" quando o RSVP lê o token: preenche o nome do convidado e
// TRAVA o campo. Fazer isso na mão é o passo que quebrava as coisas.
//
// A gente reconhece o campo do nome pelo BINDING do input — value={<algo>} —
// e cobre os dois padrões que os convites usam de verdade:
//   escalar:  value={nome}            + const [nome, setNome] = useState("")
//   objeto:   value={formData.nome}   + const [formData, setFormData] = useState({...})
// A partir daí liga: import + const guest = useGuest() + useEffect que preenche
// o nome quando o token resolve + readOnly no input. Se não bater nenhum padrão,
// devolve null e o chamador cai no passo manual (nunca edita no chute). Depois de
// aplicar, o CLI roda `tsc --noEmit` e reverte se quebrar.
// ============================================================================
import { relative, sep } from "node:path";

// Recebe o source do RSVP e o caminho de import do guest lib. Retorna:
//   { already:true }  → já estava ligado (nada a fazer)
//   { text }          → novo conteúdo pronto pra escrever
//   null              → estrutura não reconhecida (usar passo manual)
export function buildRsvpWiring(src, importPath) {
  if (/\buseGuest\b/.test(src)) return { already: true };

  // Âncora 1: o input do nome — value={<var>} ou value={<obj>.<campo>} cujo
  // "leaf" case-insensível bate nome/name. Guarda a substring EXATA pro replace.
  const valueRe = /value=\{\s*([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?\s*\}/g;
  let bind = null;
  let vm;
  while ((vm = valueRe.exec(src))) {
    const leaf = vm[2] || vm[1];
    if (/nome|name/i.test(leaf)) {
      bind = { full: vm[0], base: vm[1], field: vm[2] || null };
      break;
    }
  }
  if (!bind) return null;

  // Âncora 2: o setter do estado que segura esse input.
  //   const [<base>, <setter>] = useState(...)
  const setterRe = new RegExp(
    `const\\s*\\[\\s*${bind.base}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\]\\s*=\\s*useState`,
  );
  const sm = src.match(setterRe);
  if (!sm) return null;
  const setter = sm[1];

  // Âncora 3: import do react reconhecível (pra garantir useEffect).
  const reactImp = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+(['"])react\2;?/;
  const rm = src.match(reactImp);
  if (!rm) return null;

  // Âncora 4: primeira linha de estado single-line — ponto de inserção do hook.
  const anchorRe = /^([^\S\n]*)const\s*\[[^\]\n]*\]\s*=\s*useState\b[^\n]*$/m;
  const am = src.match(anchorRe);
  if (!am) return null;
  const anchorLine = am[0];
  const indent = am[1];

  let out = src;

  // 1+2) Reescreve o import do react (com useEffect) e adiciona o do useGuest.
  const names = rm[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.includes("useEffect")) names.push("useEffect");
  out = out.replace(
    reactImp,
    `import { ${names.join(", ")} } from "react";\nimport { useGuest } from "${importPath}";`,
  );

  // 3) hook + sync do nome. Escalar troca o valor; objeto faz merge do campo.
  //    guest.name é string|null → ?? "" pra casar com o tipo string do estado.
  const syncCall = bind.field
    ? `${setter}((prev) => ({ ...prev, ${bind.field}: guest.name ?? "" }));`
    : `${setter}(guest.name ?? "");`;
  const block =
    `${indent}const guest = useGuest();\n` +
    `${anchorLine}\n` +
    `${indent}useEffect(() => { if (guest.name) ${syncCall} }, [guest.name]);`;
  out = out.replace(anchorLine, block);

  // 4) Trava o input do nome quando o token é válido (substring exata do binding).
  out = out.replace(bind.full, `${bind.full} readOnly={guest.valid}`);

  return { text: out };
}

// Caminho de import relativo (posix, sem extensão) de `fromDir` até `toFileNoExt`.
export function relativeImport(fromDir, toFileNoExt) {
  let rel = relative(fromDir, toFileNoExt).split(sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}
