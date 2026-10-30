import { describe, expect, it } from "vitest";
import { roleCan } from "@/lib/rbac";
import { assertSafeKey } from "@/lib/storage/types";
import { LocalStorage } from "@/lib/storage/local";
import { contentHash, stableStringify } from "@/lib/render-input";
import { normalizeCompanyName } from "@/lib/text";

describe("permissões", () => {
  it("captador cadastra mas não aprova nem gera vídeos", () => {
    expect(roleCan("USER", "CAPTADOR", "sponsorship.create")).toBe(true);
    expect(roleCan("USER", "CAPTADOR", "sponsorship.review")).toBe(false);
    expect(roleCan("USER", "CAPTADOR", "sponsorship.viewAll")).toBe(false);
    expect(roleCan("USER", "CAPTADOR", "render.create")).toBe(false);
  });
  it("operador opera o telão mas não aprova", () => {
    expect(roleCan("USER", "OPERATOR", "screen.operate")).toBe(true);
    expect(roleCan("USER", "OPERATOR", "sponsorship.review")).toBe(false);
  });
  it("sem vínculo com o evento não há acesso; admin geral tem tudo", () => {
    expect(roleCan("USER", null, "event.view")).toBe(false);
    expect(roleCan("SUPER_ADMIN", null, "event.manage")).toBe(true);
  });
});

describe("storage", () => {
  it("bloqueia path traversal", () => {
    expect(() => assertSafeKey("../etc/passwd")).toThrow();
    expect(() => assertSafeKey("orgs/a/../../x")).toThrow();
    expect(() => assertSafeKey("/abs/path")).toThrow();
    expect(assertSafeKey("orgs/abc/assets/x/processed.png")).toBeTruthy();
  });
  it("URL assinada expira e não pode ser adulterada", async () => {
    const st = new LocalStorage("/tmp/x", "segredo-de-teste-com-tamanho-suficiente", "");
    const url = new URL(await st.signedUrl("orgs/a/b.png", { ttlSec: 60 }), "http://h");
    const exp = url.searchParams.get("exp")!;
    const sig = url.searchParams.get("sig")!;
    expect(st.verify("orgs/a/b.png", exp, sig, "")).toBe(true);
    expect(st.verify("orgs/a/c.png", exp, sig, "")).toBe(false);
    expect(st.verify("orgs/a/b.png", String(Number(exp) + 1000), sig, "")).toBe(false);
    expect(st.verify("orgs/a/b.png", "1", sig, "")).toBe(false);
  });
});

describe("detecção de vídeo desatualizado", () => {
  it("hash independe da ordem das chaves e muda com o conteúdo", () => {
    expect(stableStringify({ a: 1, b: [2, { c: 3, d: 4 }] })).toBe(stableStringify({ b: [2, { d: 4, c: 3 }], a: 1 }));
    const p = { sponsors: [{ id: "1" }] } as never;
    const q = { sponsors: [{ id: "1" }, { id: "2" }] } as never;
    expect(contentHash(p, { crf: 18 })).not.toBe(contentHash(q, { crf: 18 }));
  });
});

describe("deduplicação de empresas", () => {
  it("normaliza acentos, pontuação e sufixos societários", () => {
    expect(normalizeCompanyName("Padaria Pão-Quente LTDA.")).toBe("padaria pao quente");
    expect(normalizeCompanyName("  PADARIA pão quente ")).toBe("padaria pao quente");
  });
});
