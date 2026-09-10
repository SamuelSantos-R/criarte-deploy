/**
 * O link que se tem à mão é quase sempre o curto — é o que o Google oferece
 * primeiro no botão Enviar. Mas o convite é estático e envia a resposta por POST
 * para o `/formResponse`, que só existe no endereço longo. O `forms.gle` é um
 * redirecionamento, e segui-lo é coisa que a página publicada não pode andar a
 * fazer a cada visita: resolve-se aqui uma vez, e o convite fica com o endereço
 * final gravado.
 */

/** Só o Google. Seguir um redirecionamento para onde calhar era um buraco aberto. */
const HOSTS = new Set(["forms.gle", "docs.google.com"]);

/** O endereço a que o POST vai, venha o link na forma que vier. */
function paraFormResponse(url: string): string {
  const base = url
    .split(/[?#]/)[0]
    .replace(/\/(viewform|edit|formResponse)\/?$/, "")
    .replace(/\/$/, "");
  return `${base}/formResponse`;
}

function validar(bruto: string): URL {
  let url: URL;
  try {
    url = new URL(bruto.trim());
  } catch {
    throw new Error("isto não é um endereço válido");
  }
  if (url.protocol !== "https:") throw new Error("o link tem de começar por https://");
  if (!HOSTS.has(url.hostname)) {
    throw new Error(`${url.hostname} não é um link do Google Forms`);
  }
  return url;
}

/**
 * Devolve sempre o `/formResponse` do formulário. Link longo passa direto; link
 * curto é seguido até ao destino, e o destino é conferido — um `forms.gle` morto
 * aterra na página de erro do Google, e gravar isso deixava o convite a enviar
 * respostas para o vazio outra vez.
 */
export async function resolverFormulario(bruto: string): Promise<string> {
  const url = validar(bruto);
  if (url.hostname === "docs.google.com") {
    if (!url.pathname.includes("/forms/")) throw new Error("este link do Google não é de um formulário");
    return paraFormResponse(url.toString());
  }

  const r = await fetch(url.toString(), { redirect: "follow" });
  const destino = validar(r.url);
  if (destino.hostname !== "docs.google.com" || !destino.pathname.includes("/forms/")) {
    throw new Error("o link curto não levou a nenhum formulário — confere se ainda está de pé");
  }
  return paraFormResponse(destino.toString());
}
