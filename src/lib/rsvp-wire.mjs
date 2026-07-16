// ============================================================================
// RSVP-WIRE — liga o formulário de RSVP ao useGuest (token) automaticamente
// ============================================================================
// O `tokenizar` copia guest.tsx + guests.example.json, mas o convite só vira
// "por convidado" quando o RSVP lê o token: preenche o nome do convidado e
// TRAVA o campo. Fazer isso na mão é o passo que quebrava as coisas.
//
// Aqui a gente faz de forma CONSERVADORA: só mexe se reconhecer as âncoras
// canônicas (estado do nome via useState + <input value={nome}>). Se não bater
// o padrão, devolve null e o chamador cai no passo manual. Depois de aplicar, o
// CLI roda `tsc --noEmit` e reverte se quebrar — o convite nunca fica num estado
// que não compila.
// ============================================================================
import { relative, sep } from "node:path";

// Recebe o source do RSVP e o caminho de import do guest lib. Retorna:
//   { already:true }  → já estava ligado (nada a fazer)
//   { text }          → novo conteúdo pronto pra escrever
//   null              → estrutura não reconhecida (usar passo manual)
export function buildRsvpWiring(src, importPath) {
  if (/\buseGuest\b/.test(src)) return { already: true };

  // Âncora 1: linha do estado do nome, com a indentação — captura tudo (m[0]).
  //   ^<indent>const [<nome>, set<Nome>] = useState(...)$
  const stateRe = /^([^\S\n]*)const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\b[^\n]*$/gm;
  let nameMatch = null;
  let m;
  while ((m = stateRe.exec(src))) {
    if (/nome|name/i.test(m[2])) { nameMatch = m; break; }
  }
  if (!nameMatch) return null;
  const nameLine = nameMatch[0];
  const indent = nameMatch[1];
  const nameVar = nameMatch[2];
  const setter = nameMatch[3];

  // Âncora 2: o input do nome usa value={<nome>} — pra travar o campo.
  const valueBind = new RegExp(`value=\\{\\s*${nameVar}\\s*\\}`);
  if (!valueBind.test(src)) return null;

  // Âncora 3: import do react reconhecível — senão não arrisca.
  const reactImp = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+(['"])react\2;?/;
  const rm = src.match(reactImp);
  if (!rm) return null;

  let out = src;

  // 1+2) Reescreve o import do react (com useEffect) e adiciona o do useGuest.
  const names = rm[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.includes("useEffect")) names.push("useEffect");
  out = out.replace(
    reactImp,
    `import { ${names.join(", ")} } from "react";\nimport { useGuest } from "${importPath}";`,
  );

  // 3) hook + sync do nome, em volta da linha de estado (mesma indentação).
  const block =
    `${indent}const guest = useGuest();\n` +
    `${nameLine}\n` +
    `${indent}useEffect(() => { if (guest.name) ${setter}(guest.name); }, [guest.name]);`;
  out = out.replace(nameLine, block);

  // 4) Trava o input do nome quando o token é válido.
  out = out.replace(valueBind, (full) => `${full} readOnly={guest.valid}`);

  return { text: out };
}

// Caminho de import relativo (posix, sem extensão) de `fromDir` até `toFileNoExt`.
export function relativeImport(fromDir, toFileNoExt) {
  let rel = relative(fromDir, toFileNoExt).split(sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}
