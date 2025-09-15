import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export async function loadChunks(): Promise<void> {
  const chunksPath = path.join(__dirname, '../data/chunks.json');
  const data = await fs.readFile(chunksPath, 'utf-8');
  chunksData = JSON.parse(data);
  console.log(`Chunks 로드 완료: ${chunksData.chunks.length}개`);
}

// 단순 키워드 점수 계산
function calculateRelevanceScore(chunk: Chunk, query: string): number {
  const queryLower = query.toLowerCase();
  const contentLower = chunk.content.toLowerCase();
  const titleLower = chunk.metadata.title?.toLowerCase() || '';
  const categoryLower = chunk.metadata.category?.toLowerCase() || '';
  
  let score = 0;
  
  // 쿼리 단어들로 분리
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
  
  // 중요 키워드 가중치
  const importantKeywords: { [key: string]: number } = {
    '집회': 15,
    '선거운동': 12,
    '후원금': 12,
    '선거사무소': 12,
    '공무원': 12,
    '홍보물': 12,
    '기부행위': 12,
    '문자메시지': 12,
    'sns': 15,
    '예비후보자': 8,
    '제한': 8,
    '금지': 8,
    '허용': 8
  };
  
  queryWords.forEach(word => {
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
  if (query.includes('SNS') && chunk.metadata.title?.includes('SNS')) {
    score += 100;
  }
  if (query.includes('후원금') && chunk.metadata.title?.includes('후원금')) {
    score += 100;
  }
  
  return score;
}

// 관련 chunks 검색 (관련성 높은 것만 선택)
export function searchChunks(query: string, maxResults: number = 5, minScore: number = 30): Chunk[] {
  if (!chunksData) {
    throw new Error('Chunks가 로드되지 않았습니다.');
  }
  
  // 각 chunk의 관련도 점수 계산
  const scoredChunks = chunksData.chunks.map(chunk => ({
    chunk,
    score: calculateRelevanceScore(chunk, query)
  }));
  
  // 최소 점수 이상인 것만 필터링하고 점수순으로 정렬
  const relevantChunks = scoredChunks
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.chunk);
  
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
  
  return chunksData.chunks.filter(
    chunk => chunk.metadata.category?.toLowerCase() === category.toLowerCase()
  );
}

// 모든 카테고리 목록 가져오기
export function getAllCategories(): string[] {
  if (!chunksData) {
    throw new Error('Chunks가 로드되지 않았습니다.');
  }
  
  const categories = new Set<string>();
  chunksData.chunks.forEach(chunk => {
    if (chunk.metadata.category) {
      categories.add(chunk.metadata.category);
    }
  });
  
  return Array.from(categories);
}