export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Grava o objeto em disco (usado pelo worker para montar renders sem carregar tudo em memória). */
  download(key: string, destPath: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** URL temporária e assinada para leitura direta pelo navegador / telão. */
  signedUrl(key: string, opts?: { ttlSec?: number; downloadName?: string }): Promise<string>;
}

/** Impede path traversal e caracteres inesperados nas chaves. */
export function assertSafeKey(key: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,400}$/.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Chave de armazenamento inválida: ${key}`);
  }
  return key;
}
