import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

interface Chunk {
  content: string;
  metadata: {
    category?: string;
    title?: string;
    type?: string;
    page?: number;
    caseNumber?: string;
    fileName?: string;
    pdfUrl?: string;
    note?: string;
  };
  index: number;
}

interface ChunksData {
  metadata: {
    source: string;
    title: string;
    totalChunks: number;
    createdAt: string;
    pdfUrl?: string;
    disclaimer?: string;
  };
  chunks: Chunk[];
}

let chunksData: ChunksData | null = null;

type Term = string;
interface BM25Index {
  postings: Map<Term, Map<number, number>>;
  docLengths: number[];
  avgDocLen: number;
  numDocs: number;
}

let bm25Index: BM25Index | null = null;

function cleanForIndex(text: string): string {
  return text
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .toLowerCase();
}

function tokenize(text: string): string[] {
  const cleaned = cleanForIndex(text);
  const normalized = cleaned.replace(/[^\p{L}\p{N}]+/gu, ' ');
  const tokens = normalized.split(/\s+/).filter(t => t.length > 1);
  return tokens;
}

function buildBM25Index(chunks: Chunk[]): BM25Index {
  const postings = new Map<Term, Map<number, number>>();
  const docLengths: number[] = new Array(chunks.length).fill(0);

  chunks.forEach((chunk, idx) => {
    const tokens = tokenize(chunk.content || '');
    docLengths[idx] = tokens.length;
    const tf = new Map<Term, number>();
    tokens.forEach(tok => tf.set(tok, (tf.get(tok) || 0) + 1));
    tf.forEach((count, term) => {
      let plist = postings.get(term);
      if (!plist) {
        plist = new Map<number, number>();
        postings.set(term, plist);
      }
      plist.set(idx, count);
    });
  });

  const numDocs = chunks.length;
  const avgDocLen = docLengths.reduce((a, b) => a + b, 0) / Math.max(1, numDocs);
  return { postings, docLengths, avgDocLen, numDocs };
}

export async function loadChunks(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const candidates: string[] = [
    path.join(process.cwd(), 'data/chunks.json'),
    path.join(__dirname, '../../data/chunks.json'),
    path.join(__dirname, '../data/chunks.json'),
    path.join('/var/task', 'data/chunks.json')
  ];

  let lastErr: any;
  for (const p of candidates) {
    try {
      const data = await fs.readFile(p, 'utf-8');
      const parsed: ChunksData = JSON.parse(data);
      chunksData = parsed;
      bm25Index = buildBM25Index(parsed.chunks);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('chunks.json을 찾을 수 없습니다.');
}

function calculateRelevanceScore(chunk: Chunk, query: string): number {
  const queryLower = query.toLowerCase();
  const contentLower = chunk.content.toLowerCase();
  const titleLower = chunk.metadata.title?.toLowerCase() || '';
  const categoryLower = chunk.metadata.category?.toLowerCase() || '';
  const fileNameLower = chunk.metadata.fileName?.toLowerCase() || '';

  let score = 0;
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
  const synonymMap: Record<string, string[]> = {
    'sns': ['인터넷', '정보통신망', '카카오톡', '유튜브', '페이스북', '인스타그램', '블로그', '홈페이지', '전자우편'],
    '문자': ['문자메시지', '문자 메시지', 'sms', '자동 동보통신', '82의5'],
    '문자메시지': ['문자', 'sms', '자동 동보통신', '82의5'],
    '자동동보통신': ['자동 동보통신', '82의5', '문자메시지', '문자'],
    '공무원': ['선거중립', '선거관여', '§85', '85', '§86', '86', '지방자치단체장', '지자체장'],
    '선거운동': ['§58', '58', '정의'],
    '재외선거': ['재외', '국외부재자', '해외투표', '영사관투표'],
    '학생': ['18세', '미성년', '학교', '교내'],
    '정치자금': ['후원금', '회계책임자', '선거비용', '회계실무']
  };
  const expandedWords = new Set<string>(queryWords);
  queryWords.forEach(w => {
    const syns = synonymMap[w];
    if (syns) syns.forEach(s => expandedWords.add(s.toLowerCase()));
  });

  const importantKeywords: { [key: string]: number } = {
    '집회': 15,
    '선거운동': 18,
    '선거운동의 정의': 22,
    '정의': 12,
    '의미': 10,
    '후원금': 12,
    '선거사무소': 12,
    '공무원': 12,
    '홍보물': 12,
    '기부행위': 12,
    '문자메시지': 18,
    '자동동보통신': 20,
    '자동 동보통신': 20,
    '82의5': 18,
    '§82의5': 18,
    '59조': 10,
    '제59조': 12,
    '58조': 10,
    '제58조': 12,
    'sns': 15,
    '예비후보자': 8,
    '제한': 8,
    '금지': 8,
    '허용': 8
  };

  Array.from(expandedWords).forEach(word => {
    const keywordWeight = importantKeywords[word] || 1;
    if (titleLower.includes(word)) score += 20 * keywordWeight;
    if (categoryLower.includes(word)) score += 10 * keywordWeight;
    if (fileNameLower.includes(word)) score += 12 * keywordWeight;
    const contentMatches = (contentLower.match(new RegExp(word, 'g')) || []).length;
    score += contentMatches * 3 * keywordWeight;
  });

  if (contentLower.includes(queryLower)) score += 50;
  if (queryLower.includes('집회') && (chunk.metadata.title || '').includes('집회')) score += 100;
  if (/(sns|인터넷|정보통신망|홈페이지|전자우편)/i.test(queryLower) && /(sns|인터넷|정보통신망|홈페이지|전자우편)/i.test(titleLower)) score += 100;
  if (queryLower.includes('후원금') && (chunk.metadata.title || '').includes('후원금')) score += 100;
  if (/(선거운동).*정의/.test(queryLower) || queryLower.includes('선거운동이 뭐') || queryLower.includes('선거운동이란')) {
    if (contentLower.includes('법 §58') || titleLower.includes('선거운동의 정의')) score += 150;
  }
  if (/(문자|sms|자동|82의5)/i.test(queryLower)) {
    if (contentLower.includes('82의5') || contentLower.includes('자동 동보통신') || contentLower.includes('문자메시지')) score += 150;
  }
  if (/(공무원|지방자치단체장|지자체장|선거중립|선거관여)/.test(queryLower)) {
    if (contentLower.includes('§85') || contentLower.includes('§86') || contentLower.includes('공무원') || titleLower.includes('공무원')) score += 140;
  }
  if (/재외선거|국외부재자|재외|해외투표|영사관/.test(queryLower)) {
    if (fileNameLower.includes('재외선거')) score += 200;
  }
  if (/학생|미성년|18세/.test(queryLower)) {
    if (fileNameLower.includes('학생') || fileNameLower.includes('정당활동')) score += 160;
  }
  if (/정치자금|회계|후원금/.test(queryLower)) {
    if (fileNameLower.includes('정치자금') || fileNameLower.includes('회계실무')) score += 180;
  }

  return score;
}

export function searchChunks(query: string, maxResults: number = 15, minScore: number = 30): Chunk[] {
  if (!chunksData) return [];
  if (!bm25Index) bm25Index = buildBM25Index((chunksData as ChunksData).chunks);

  const k1 = 1.2, b = 0.75;
  const qTokens = Array.from(new Set(tokenize(query)));
  const scores = new Map<number, number>();
  qTokens.forEach(term => {
    const plist = bm25Index!.postings.get(term);
    if (!plist) return;
    const n = plist.size; if (n === 0) return;
    const N = bm25Index!.numDocs;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    plist.forEach((tf, docId) => {
      const dl = bm25Index!.docLengths[docId] || 0;
      const denom = tf + k1 * (1 - b + b * (dl / Math.max(1, bm25Index!.avgDocLen)));
      const score = idf * ((tf * (k1 + 1)) / Math.max(1e-6, denom));
      scores.set(docId, (scores.get(docId) || 0) + score);
    });
  });

  const scoredChunks = (chunksData as ChunksData).chunks.map((chunk, idx) => {
    const bm = scores.get(idx) || 0;
    const kw = calculateRelevanceScore(chunk, query);
    const combined = bm * 1.0 + kw * 0.2;
    return { chunk, score: combined };
  });

  const sorted = scoredChunks.sort((a, b) => b.score - a.score);
  const topScore = sorted.length ? sorted[0].score : 0;
  const isShortQuery = qTokens.length <= 2;
  const alpha = isShortQuery ? 0.4 : 0.5;
  const minScoreAdjusted = isShortQuery ? Math.max(20, minScore - 10) : minScore;
  const dynamicThreshold = Math.max(minScoreAdjusted, Math.floor(topScore * alpha));
  let relevantChunks = sorted.filter(item => item.score >= dynamicThreshold).slice(0, maxResults).map(item => item.chunk);

  return relevantChunks.length ? relevantChunks : scoredChunks.filter(i => i.score > 0).slice(0, 2).map(i => i.chunk);
}

export function getAllCategories(): string[] {
  if (!chunksData) return [];
  const categories = new Set<string>();
  (chunksData as ChunksData).chunks.forEach(chunk => { if (chunk.metadata.category) categories.add(chunk.metadata.category); });
  return Array.from(categories);
}
