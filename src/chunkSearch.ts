import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname 대체: ESM/CJS 환경 모두에서 안전하게 동작
let __dirnameSafe: string;
try {
  // ESM 환경
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  __dirnameSafe = path.dirname(fileURLToPath(import.meta.url));
} catch {
  // CJS 또는 import.meta.url 미지원 환경
  __dirnameSafe = process.cwd();
}

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

// chunks 데이터 로드
let chunksData: ChunksData | null = null;

// BM25 인덱스
type Term = string;
interface BM25Index {
  // 토큰 -> (docId -> tf)
  postings: Map<Term, Map<number, number>>;
  // 각 문서 길이(토큰 수)
  docLengths: number[];
  // 평균 문서 길이
  avgDocLen: number;
  // 문서 수
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
  // 한글/영문/숫자 유지, 그 외는 공백으로 치환
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
  // 1) 빌드 산출물 기준(서버리스 번들에 포함) 2) CWD 3) 소스 기준 순으로 시도
  const candidates = [
    path.join(process.cwd(), 'data/chunks.json'),
    path.join(__dirnameSafe, '../data/chunks.json'),
    path.join(__dirnameSafe, 'data/chunks.json')
  ];
  let data: string;
  let lastErr: any;
  for (const p of candidates) {
    try {
      data = await fs.readFile(p, 'utf-8');
      const parsed: ChunksData = JSON.parse(data);
      chunksData = parsed;
      bm25Index = buildBM25Index(parsed.chunks);
      console.log(`Chunks 로드 완료: ${parsed.chunks.length}개 (path=${p})`);
      return;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error('chunks.json을 찾을 수 없습니다.');
}

// 단순 키워드 점수 계산
function calculateRelevanceScore(chunk: Chunk, query: string): number {
  const queryLower = query.toLowerCase();
  const contentLower = chunk.content.toLowerCase();
  const titleLower = chunk.metadata.title?.toLowerCase() || '';
  const categoryLower = chunk.metadata.category?.toLowerCase() || '';
  const fileNameLower = chunk.metadata.fileName?.toLowerCase() || '';
  
  let score = 0;
  
  // 쿼리 단어들로 분리
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);

  // 키워드 동의어/관련어 확장
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
  
  // 중요 키워드 가중치
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
    // 중요 키워드 매칭
    const keywordWeight = importantKeywords[word] || 1;
    
    // 제목에 포함된 경우 높은 점수
    if (titleLower.includes(word)) {
      score += 20 * keywordWeight;
    }
    
    // 카테고리에 포함된 경우
    if (categoryLower.includes(word)) {
      score += 10 * keywordWeight;
    }

    // 파일명(문서명)에 포함된 경우 가중치 (문서 단위 매칭 강화)
    if (fileNameLower.includes(word)) {
      score += 12 * keywordWeight;
    }
    
    // 내용에 포함된 경우 (빈도수 고려)
    const contentMatches = (contentLower.match(new RegExp(word, 'g')) || []).length;
    score += contentMatches * 3 * keywordWeight;
  });
  
  // 전체 쿼리가 그대로 포함된 경우 보너스
  if (contentLower.includes(queryLower)) {
    score += 50;
  }
  
  // 문장의 핵심 구조 매칭
  if (query.includes('집회') && chunk.metadata.title?.includes('집회')) {
    score += 100;
  }
  if (/(sns|인터넷|정보통신망|홈페이지|전자우편)/i.test(query) && /(sns|인터넷|정보통신망|홈페이지|전자우편)/i.test(titleLower)) {
    score += 100;
  }
  if (query.includes('후원금') && chunk.metadata.title?.includes('후원금')) {
    score += 100;
  }
  // 선거운동 정의/법조문 가중치
  if (/(선거운동).*정의/.test(queryLower) || queryLower.includes('선거운동이 뭐') || queryLower.includes('선거운동이란')) {
    if (contentLower.includes('법 §58') || contentLower.includes('법 §58') || titleLower.includes('선거운동의 정의')) {
      score += 150;
    }
  }
  // 문자/자동동보통신 가중치
  if (/(문자|sms|자동|82의5)/i.test(queryLower)) {
    if (contentLower.includes('82의5') || contentLower.includes('자동 동보통신') || contentLower.includes('문자메시지')) {
      score += 150;
    }
  }
  // 공무원 가중치
  if (/(공무원|지방자치단체장|지자체장|선거중립|선거관여)/.test(queryLower)) {
    if (contentLower.includes('§85') || contentLower.includes('§86') || contentLower.includes('공무원') || titleLower.includes('공무원')) {
      score += 140;
    }
  }

  // 재외선거/학생/정치자금 문서명과의 강한 정합성 부스팅
  if (/재외선거|국외부재자|재외|해외투표|영사관/.test(queryLower)) {
    if (fileNameLower.includes('재외선거')) score += 200;
  }
  if (/학생|미성년|18세/.test(queryLower)) {
    if (fileNameLower.includes('학생') || fileNameLower.includes('정당활동')) score += 160;
  }
  if (/정치자금|회계|후원금/.test(queryLower)) {
    if (fileNameLower.includes('정치자금') || fileNameLower.includes('회계실무')) score += 180;
  }

  // 도메인 개념 부스팅
  const concepts: Array<{ trigger: RegExp; indicator: RegExp; boost: number }> = [
    { trigger: /(연설|대담|공개장소|마이크|확성장치)/, indicator: /(공개장소\s*연설|연설\s*·\s*대담|확성장치|말\(言\))/, boost: 160 },
    { trigger: /(밥|식사|음식|음식물|다과|사줘|제공)/, indicator: /(기부행위|음식물|다과|법\s*§?113|§113|제113조)/, boost: 170 },
    { trigger: /(자원봉사|봉사자|자원 봉사|선거사무관계자|전화\s*자원봉사|콜)/, indicator: /(자원봉사자|선거사무관계자|법\s*§?135|§135|전화를\s*이용|ARS)/, boost: 150 },
    { trigger: /(예비후보|예비 후보)/, indicator: /(예비후보자|§60의3|§60의4|명함|공약집)/, boost: 140 },
    { trigger: /(미성년|18세)/, indicator: /(18세|미성년자)/, boost: 120 },
  ];
  concepts.forEach(c => {
    if (c.trigger.test(queryLower) && (c.indicator.test(contentLower) || c.indicator.test(titleLower))) {
      score += c.boost;
    }
  });
  
  return score;
}

// 관련 chunks 검색 (관련성 높은 것만 선택)
export function searchChunks(query: string, maxResults: number = 15, minScore: number = 30): Chunk[] {
  if (!chunksData) {
    throw new Error('Chunks가 로드되지 않았습니다.');
  }
  if (!bm25Index) {
    bm25Index = buildBM25Index((chunksData as ChunksData).chunks);
  }
  
  // BM25 점수 계산
  const k1 = 1.2, b = 0.75;
  const qTokens = Array.from(new Set(tokenize(query)));
  const scores = new Map<number, number>();
  qTokens.forEach(term => {
    const plist = bm25Index!.postings.get(term);
    if (!plist) return;
    const n = plist.size; // DF
    if (n === 0) return;
    const N = bm25Index!.numDocs;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    plist.forEach((tf, docId) => {
      const dl = bm25Index!.docLengths[docId] || 0;
      const denom = tf + k1 * (1 - b + b * (dl / Math.max(1, bm25Index!.avgDocLen)));
      const score = idf * ((tf * (k1 + 1)) / Math.max(1e-6, denom));
      scores.set(docId, (scores.get(docId) || 0) + score);
    });
  });

  // 키워드 가중치와 결합
  const scoredChunks = (chunksData as ChunksData).chunks.map((chunk, idx) => {
    const bm = scores.get(idx) || 0;
    const kw = calculateRelevanceScore(chunk, query);
    const combined = bm * 1.0 + kw * 0.2; // 가중 합산
    return { chunk, score: combined };
  });
  
  // 점수순으로 정렬
  const sorted = scoredChunks.sort((a, b) => b.score - a.score);
  const topScore = sorted.length ? sorted[0].score : 0;
  // 짧고 포괄적인 질의(토큰 수 <= 2)는 임계치 완화
  const isShortQuery = qTokens.length <= 2;
  const alpha = isShortQuery ? 0.4 : 0.5;
  const minScoreAdjusted = isShortQuery ? Math.max(20, minScore - 10) : minScore;
  const dynamicThreshold = Math.max(minScoreAdjusted, Math.floor(topScore * alpha));
  let relevantChunks = sorted
    .filter(item => item.score >= dynamicThreshold)
    .slice(0, maxResults)
    .map(item => item.chunk);

  // 주제별 보강: SNS/인터넷/전자우편 관련 요청 시 해당 키워드가 포함된 페이지를 추가 확보
  const q = query.toLowerCase();
  const needInternet = /(sns|인터넷|정보통신망|홈페이지|전자우편|이메일)/.test(q);
  if (needInternet) {
    const extra = (chunksData as ChunksData).chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      return /(인터넷\s*홈페이지|전자우편|sns|카카오톡|유튜브|블로그)/.test(t);
    }).slice(0, 6);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }

  // 재외선거 강화
  const needAbroad = /(재외선거|국외부재자|재외|해외투표|영사관)/.test(q);
  if (needAbroad) {
    const extra = (chunksData as ChunksData).chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      const f = (c.metadata.fileName || '').toLowerCase();
      return f.includes('재외선거') || /(재외선거|국외부재자|재외|해외투표|영사관)/.test(t);
    }).slice(0, 8);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }

  // 학생/미성년 강화
  const needStudent = /(학생|미성년|18세)/.test(q);
  if (needStudent) {
    const extra = (chunksData as ChunksData).chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      const f = (c.metadata.fileName || '').toLowerCase();
      return f.includes('학생') || /(학생|미성년|18세|학교|교내)/.test(t);
    }).slice(0, 8);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }

  // 정치자금/회계 강화
  const needFinance = /(정치자금|회계|후원금|회계책임자|선거비용)/.test(q);
  if (needFinance) {
    const extra = (chunksData as ChunksData).chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      const f = (c.metadata.fileName || '').toLowerCase();
      return f.includes('정치자금') || f.includes('회계실무') || /(정치자금|회계|후원금|회계책임자|선거비용)/.test(t);
    }).slice(0, 8);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }

  // 연설/확성장치/공개장소 강화
  const needSpeech = /(연설|대담|공개장소|마이크|확성장치|말\(言\))/i.test(query);
  if (needSpeech) {
    const extra = (chunksData as ChunksData).chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      return /(공개장소\s*연설|연설\s*·\s*대담|확성장치|말\(言\)|전화를\s*이용)/.test(t);
    }).slice(0, 6);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }

  // 음식물/식사/다과/기부행위 강화
  const needFood = /(밥|식사|음식|음식물|다과|사줘|제공)/i.test(query);
  if (needFood) {
    const extra = chunksData!.chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      return /(음식물|다과|기부행위|§113|제113조)/.test(t);
    }).slice(0, 6);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }

  // 자원봉사/전화/콜센터 강화
  const needVolunteer = /(자원봉사|봉사자|자원 봉사|전화\s*자원봉사|콜)/i.test(query);
  if (needVolunteer) {
    const extra = chunksData!.chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      return /(자원봉사자|법\s*§?135|§135|전화를\s*이용|ars)/.test(t);
    }).slice(0, 6);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }

  // 명함/학력/비정규학력 강화
  const needProfile = /(명함|학력|비정규학력|홍보물)/i.test(query);
  if (needProfile) {
    const extra = chunksData!.chunks.filter(c => {
      const t = (c.content || '').toLowerCase();
      return /(명함|정규학력|비정규학력|예비후보자홍보물|§60의3|§60의4)/.test(t);
    }).slice(0, 6);
    const seen = new Set(relevantChunks.map(c => `${c.metadata.pdfUrl}-${c.index}`));
    extra.forEach(c => {
      const key = `${c.metadata.pdfUrl}-${c.index}`;
      if (!seen.has(key) && relevantChunks.length < maxResults) {
        seen.add(key);
        relevantChunks.push(c);
      }
    });
  }
  
  // 관련성 높은 chunk가 없으면 상위 1-2개만 반환
  if (relevantChunks.length === 0) {
    return scoredChunks
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(item => item.chunk);
  }
  
  return relevantChunks;
}

// 카테고리별 chunks 가져오기
export function getChunksByCategory(category: string): Chunk[] {
  if (!chunksData) {
    throw new Error('Chunks가 로드되지 않았습니다.');
  }
  
  return (chunksData as ChunksData).chunks.filter(
    chunk => chunk.metadata.category?.toLowerCase() === category.toLowerCase()
  );
}

// 모든 카테고리 목록 가져오기
export function getAllCategories(): string[] {
  if (!chunksData) {
    throw new Error('Chunks가 로드되지 않았습니다.');
  }
  
  const categories = new Set<string>();
  (chunksData as ChunksData).chunks.forEach(chunk => {
    if (chunk.metadata.category) {
      categories.add(chunk.metadata.category);
    }
  });
  
  return Array.from(categories);
}