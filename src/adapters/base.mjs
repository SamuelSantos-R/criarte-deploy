// ============================================================================
// BASE ADAPTER — Interface que toda base (casamento, rsvp, etc) implementa
// ============================================================================

/**
 * Cada base de site implementa este adapter.
 *
 * Métodos que o adapter DEVE implementar:
 *   name             — string, ex: "casamento", "rsvp", "generico"
 *   detect(stagingDir) — retorna true se o projeto é desta base
 *
 * Métodos OPCIONAIS (retornam defaults neutros):
 *   async prepare(stagingDir, fullSlug, config, targetUrl)
 *   getRemovePatterns()  — arquivos/dirs a remover do staging
 *   getRequiredEnv()     — env vars necessárias pro build
 *   getMessages()        — textos customizados pro CLI
 */
export class BaseAdapter {
  name = "generico";

  /**
   * Detecta se o projeto no stagingDir é desta base.
   * Primeiro tenta criarte.config.json; se não existir, usa heurísticas.
   */
  detect(stagingDir) {
    return false;
  }

  /**
   * Prepara o staging para deploy. Chamado depois da cópia, antes do envio.
   * Pode: remover arquivos, reescrever paths, registrar no servidor, etc.
   * Retorna false se o deploy deve ser abortado.
   */
  async prepare(_stagingDir, _fullSlug, _config, _targetUrl) {
    return true;
  }

  /**
   * Lista de patterns a remover do staging (ex: "app/api", "src/lib/d1.ts").
   * São arquivos server-side que não funcionam em static export.
   */
  getRemovePatterns() {
    return [];
  }

  /**
   * Lista de env vars que o projeto precisa ter no .env.local.
   * O CLI pode avisar se estiverem faltando.
   */
  getRequiredEnv() {
    return [];
  }

  /**
   * Mensagens customizadas que o CLI usa durante o deploy.
   */
  getMessages() {
    return {};
  }

  /**
   * Se true, o CLI NÃO remove API routes automaticamente.
   */
  get keepApiRoutes() {
    return false;
  }
}
