/**
 * Normalização e match aproximado de nomes de empresas.
 *
 * Usado para cruzar a lista oficial do evento (muitas vezes manuscrita) com os
 * patrocinadores cadastrados e com os nomes dos arquivos de logotipo enviados em lote.
 * Tudo roda em memória: uma lista tem no máximo algumas centenas de linhas.
 */

/** Palavras que não identificam a empresa (sufixos societários e termos comuns em nomes de arquivo). */
const GENERIC_WORDS = new Set([
  "ltda",
  "me",
  "mei",
  "epp",
  "eireli",
  "sa",
  "s a",
  "cia",
  "logo",
  "logotipo",
  "logomarca",
  "marca",
  "final",
  "oficial",
  "copia",
  "copy",
  "novo",
  "nova",
  "img",
  "image",
  "imagem",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "webp",
]);

const FILE_EXT = /\.(png|jpe?g|svg|webp|gif|pdf|heic|bmp|tiff?)$/i;

/**
 * "Blandy-Seguros_LTDA.png" → "blandy seguros"
 * "R&C Eletritec"          → "r c eletritec"
 * "S/A Comercial"          → "comercial"
 */
export function normalizeName(input: string): string {
  let s = input.trim().replace(FILE_EXT, "");
  s = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bs\s*\/\s*a\b/g, " ") // s/a
    .replace(/\(\d+\)$/g, " ") // "logo (1)"
    .replace(/[^a-z0-9]+/g, " ") // & - _ . / etc.
    .trim();
  const tokens = s.split(/\s+/).filter((t) => t && !GENERIC_WORDS.has(t));
  // Junta o "s a" que sobra de "S.A." / "S A"
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "s" && tokens[i + 1] === "a" && i + 2 === tokens.length) break;
    out.push(tokens[i]!);
  }
  return out.join(" ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

function levRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

function trigrams(s: string): Map<string, number> {
  const padded = `  ${s} `;
  const m = new Map<string, number>();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre trigramas (0..1). */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of ta) {
    inter += Math.min(n, tb.get(g) ?? 0);
    total += n;
  }
  for (const n of tb.values()) total += n;
  return (2 * inter) / total;
}

/**
 * Similaridade entre dois nomes já normalizados (0..1).
 * Combina três sinais e fica com o maior:
 *  - nome inteiro sem espaços (Levenshtein e trigramas): "Port Net" × "Porto Net";
 *  - alinhamento palavra a palavra, penalizado pela cobertura: "Segatex" × "Segato Madeiras" fica na faixa de sugestão;
 *  - todas as palavras do nome curto presentes no nome longo: "R & C" × "R&C Eletritec" (limitado a 0,82, exige confirmação).
 */
const PARTIAL_MAX = 0.84;

export function nameSimilarity(na: string, nb: string): number {
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ca = na.replace(/ /g, "");
  const cb = nb.replace(/ /g, "");
  if (ca === cb) return 0.98; // só diferem em espaços: "R&C" × "R C"

  const whole = Math.max(levRatio(ca, cb), trigramSimilarity(ca, cb));

  const ta = na.split(" ");
  const tb = nb.split(" ");
  const [short, long] = ca.length <= cb.length ? [ta, tb] : [tb, ta];
  const shortLen = short.join("").length;
  const longLen = long.join("").length;

  let weighted = 0;
  let allContained = true;
  for (const t of short) {
    let best = 0;
    for (const u of long) best = Math.max(best, levRatio(t, u));
    weighted += best * t.length;
    if (!long.includes(t)) allContained = false;
  }
  const tokenSim = weighted / Math.max(1, shortLen);
  const coverage = shortLen / Math.max(1, longLen);
  // Nome parcial (cobre menos de 70% do outro) nunca passa do limite de vínculo automático:
  // "segato.png" × "Segato Madeiras" precisa de confirmação quando existe "Segatex" na lista.
  const partialCap = coverage >= 0.7 ? 1 : PARTIAL_MAX;
  const tokenScore = Math.min(partialCap, tokenSim * (0.75 + 0.25 * coverage));

  // Nome curto contido no longo: forte indício, mas nunca vincula sozinho (abreviações são ambíguas)
  const containScore = allContained ? (coverage >= 0.7 ? 0.9 : 0.82) : 0;

  return Math.min(1, Math.max(whole, tokenScore, containScore));
}

export const AUTO_LINK_MIN = 0.85;
export const SUGGEST_MIN = 0.6;
export const MIN_GAP = 0.1;

export type MatchCandidate<T> = { item: T; names: string[] };
export type ScoredCandidate<T> = { item: T; score: number; matchedName: string };
export type MatchDecision<T> =
  | { kind: "link"; best: ScoredCandidate<T>; ranking: ScoredCandidate<T>[] }
  | { kind: "suggest"; best: ScoredCandidate<T>; ranking: ScoredCandidate<T>[]; reason: "medium" | "close-tie" }
  | { kind: "none"; ranking: ScoredCandidate<T>[] };

/** Ordena os candidatos pela melhor similaridade entre qualquer um dos seus nomes (nome, apelidos…). */
export function rankCandidates<T>(query: string, candidates: MatchCandidate<T>[], alreadyNormalized = false): ScoredCandidate<T>[] {
  const q = alreadyNormalized ? query : normalizeName(query);
  const scored: ScoredCandidate<T>[] = [];
  for (const c of candidates) {
    let best = 0;
    let matchedName = "";
    for (const raw of c.names) {
      const n = normalizeName(raw);
      const s = nameSimilarity(q, n);
      if (s > best) {
        best = s;
        matchedName = raw;
      }
    }
    if (best > 0) scored.push({ item: c.item, score: Math.round(best * 1000) / 1000, matchedName });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Regra de decisão:
 *  - ≥ 0,85 e pelo menos 0,10 acima do 2º colocado → vincula automaticamente;
 *  - entre 0,60 e 0,85, ou ≥ 0,85 com empate próximo → sugere (pede confirmação);
 *  - < 0,60 → não identificado.
 */
export function decideMatch<T>(ranking: ScoredCandidate<T>[]): MatchDecision<T> {
  const [best, second] = ranking;
  if (!best || best.score < SUGGEST_MIN) return { kind: "none", ranking };
  const gap = best.score - (second?.score ?? 0);
  if (best.score >= AUTO_LINK_MIN && gap >= MIN_GAP) return { kind: "link", best, ranking };
  return { kind: "suggest", best, ranking, reason: best.score >= AUTO_LINK_MIN ? "close-tie" : "medium" };
}

export function matchName<T>(query: string, candidates: MatchCandidate<T>[]): MatchDecision<T> {
  return decideMatch(rankCandidates(query, candidates));
}

/**
 * Cruza N consultas com M candidatos sem reutilizar candidatos: atribuição gulosa pelos
 * maiores scores globais. Evita que dois slots da lista fiquem ligados ao mesmo patrocinador.
 */
export function assignMatches<Q, T extends { id: string }>(
  queries: { key: Q; name: string }[],
  candidates: MatchCandidate<T>[],
): Map<Q, MatchDecision<T>> {
  const rankings = queries.map((q) => ({ key: q.key, ranking: rankCandidates(q.name, candidates) }));
  const pairs: { qi: number; c: ScoredCandidate<T> }[] = [];
  rankings.forEach((r, qi) => r.ranking.forEach((c) => c.score >= SUGGEST_MIN && pairs.push({ qi, c })));
  pairs.sort((a, b) => b.c.score - a.c.score);

  const takenCandidates = new Set<string>();
  const assigned = new Map<number, ScoredCandidate<T>>();
  for (const p of pairs) {
    if (assigned.has(p.qi) || takenCandidates.has(p.c.item.id)) continue;
    assigned.set(p.qi, p.c);
    takenCandidates.add(p.c.item.id);
  }

  const out = new Map<Q, MatchDecision<T>>();
  rankings.forEach((r, qi) => {
    const chosen = assigned.get(qi);
    if (!chosen) {
      out.set(r.key, { kind: "none", ranking: r.ranking });
      return;
    }
    // O 2º colocado considerado para o "empate" é o melhor candidato diferente do escolhido
    const others = r.ranking.filter((c) => c.item.id !== chosen.item.id);
    const decision = decideMatch([chosen, ...others]);
    out.set(r.key, decision);
  });
  return out;
}
