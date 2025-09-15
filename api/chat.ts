import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadChunks, searchChunks } from './lib/chunkSearch';

let initialized = false;
async function ensureInit() {
  if (!initialized) {
    await loadChunks();
    initialized = true;
  }
}

function cleanText(input: string): string {
  return (input || '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    try {
      await ensureInit();
    } catch (e: any) {
      res.status(200).json({ response: '초기화 지연으로 간단 요약을 제공합니다.', sources: [] });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const message: string = body?.message || '';
    const history = Array.isArray(body?.history) ? body.history : [];
    if (!message) {
      res.status(400).json({ error: '메시지가 필요합니다.' });
      return;
    }

    // 검색
    const relevantChunks = searchChunks(message, 8, 40);
    const seen = new Set<string>();
    const uniqueRelevant = relevantChunks.filter(c => {
      const key = c.metadata.pdfUrl || `${c.metadata.fileName || ''}-${c.metadata.page || ''}-${c.index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 컨텍스트 + 출처
    const sources: Array<any> = [];
    const context = uniqueRelevant.map((chunk, idx) => {
      sources.push({
        title: chunk.metadata.page ? `p.${chunk.metadata.page}` : (chunk.metadata.caseNumber || `참조 ${idx + 1}`),
        category: chunk.metadata.category || '일반',
        preview: cleanText(chunk.content).substring(0, 160) + '...',
        page: chunk.metadata.page,
        caseNumber: chunk.metadata.caseNumber,
        fileName: chunk.metadata.fileName,
        pdfUrl: chunk.metadata.pdfUrl,
        note: chunk.metadata.note
      });
      const pageInfo = chunk.metadata.page ? `, p.${chunk.metadata.page}` : '';
      const caseInfo = chunk.metadata.caseNumber ? `, ${chunk.metadata.caseNumber}` : '';
      const refInfo = `${chunk.metadata.fileName || '문서'}${caseInfo || pageInfo}`;
      const cleaned = cleanText(chunk.content);
      const snippet = cleaned.length > 800 ? cleaned.slice(0, 800) : cleaned;
      return `[참조 ${idx + 1} - ${refInfo}]\n${snippet}`;
    }).join('\n\n---\n\n');

    // 시스템 프롬프트
    const systemPrompt = `당신은 대한민국 중앙선거관리위원회 자료를 기반으로 답변하는 선거법 전문 도우미입니다.\n\n다음 원칙을 따라주세요:\n1. 제공된 참조 자료의 내용을 정확하게 인용합니다. 참조가 있을 때는 "정보 없음"이라고 하지 마세요.\n2. 질문과 직접 관련된 참조만 인용합니다.\n3. 한국어, 두괄식, 간결한 목록 위주로 답합니다.\n4. 마크다운 볼드를 쓰지 않습니다.\n5. 인용은 [참조 번호 - 파일명, 페이지/사례] 형식을 사용합니다.\n\n${context ? `다음은 질문과 관련된 참조 자료입니다 (총 ${uniqueRelevant.length}개):\n\n${context}` : '관련 참조 자료를 찾을 수 없습니다.'}\n\n사용자 질문: ${message}`;

    const apiKey = process.env.GEMINI_API_KEY || '';
    let text = '';
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-pro' });
      const chat = model.startChat({ history, generationConfig: { temperature: 0.3, topP: 0.8, topK: 40, maxOutputTokens: 2048 } });
      const result = await chat.sendMessage(systemPrompt);
      const response = await result.response;
      text = cleanText(response.text());
      // 중복 인라인 참조 제거
      if (sources.length > 0) {
        const usedKeys = new Set<string>();
        sources.forEach((src, idx) => {
          const key = src.pdfUrl || `${src.fileName || ''}-${src.page || ''}`;
          const pattern = new RegExp(`\\[참조 ${idx + 1}[^\\]]*\\]`, 'g');
          let first = true;
          const pageInfo = src.page ? `, p.${src.page}` : '';
          const caseInfo = src.caseNumber ? `, ${src.caseNumber}` : '';
          const normalizedRef = `[참조 ${idx + 1} - ${src.fileName || '문서'}${caseInfo || pageInfo}]`;
          text = text.replace(pattern, () => {
            if (first && !usedKeys.has(key)) {
              first = false;
              usedKeys.add(key);
              return normalizedRef;
            }
            return '';
          });
        });
      }
    } else {
      // Fallback: 모델 키가 없을 경우, 관련 스니펫을 요약한 간단 응답
      const bullets = uniqueRelevant.slice(0, 4).map((c, i) => {
        const pageInfo = c.metadata.page ? `p.${c.metadata.page}` : (c.metadata.caseNumber || '');
        return `- ${cleanText(c.content).slice(0, 180)} ... [참조 ${i + 1} - ${c.metadata.fileName || '문서'}, ${pageInfo}]`;
      }).join('\n');
      text = `핵심 요약:\n${bullets || '관련 페이지를 찾지 못했습니다.'}`;
    }

    res.status(200).json({ response: text, sources: sources.length > 0 ? sources : undefined });
  } catch (err: any) {
    res.status(500).json({ error: '응답 생성 중 오류가 발생했습니다.', details: err?.message || String(err) });
  }
}


