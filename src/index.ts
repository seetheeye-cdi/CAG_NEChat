import Fastify from 'fastify';
import cors from '@fastify/cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import { loadChunks, searchChunks, getAllCategories } from './chunkSearch.js';

// 환경 변수 로드
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fastify 인스턴스 생성
const fastify = Fastify({
  logger: true
});

// CORS 설정
await fastify.register(cors, {
  origin: true
});

// Gemini AI 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
let model: any;

// 모델 초기화
async function initializeModel() {
  try {
    // Chunks 로드
    await loadChunks();
    
    // 모델 초기화
    model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-pro' });
    
    console.log('모델 및 chunks 초기화 완료');
  } catch (error) {
    console.error('초기화 실패:', error);
    throw error;
  }
}

// 채팅 엔드포인트
interface ChatRequest {
  message: string;
  history?: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
}

interface ChatResponse {
  response: string;
  error?: string;
  sources?: Array<{
    title: string;
    category: string;
    preview: string;
    page?: number;
    caseNumber?: string;
    fileName?: string;
    pdfUrl?: string;
    note?: string;
  }>;
}

// API 라우트를 먼저 등록
fastify.post<{ Body: ChatRequest }>('/api/chat', async (request, reply) => {
  try {
    const { message, history = [] } = request.body;

    if (!message) {
      return reply.code(400).send({ error: '메시지가 필요합니다.' });
    }

    // 관련 chunks 검색 (최대 3개, 최소 점수 50점 이상만 선택)
    const relevantChunks = searchChunks(message, 3, 50);
    
    // 검색된 chunks로 컨텍스트 구성
    let context = '';
    const sources: ChatResponse['sources'] = [];
    
    if (relevantChunks.length > 0) {
      context = relevantChunks.map((chunk, idx) => {
        sources.push({
          title: chunk.metadata.title || `참조 ${idx + 1}`,
          category: chunk.metadata.category || '일반',
          preview: chunk.content.substring(0, 100) + '...',
          page: chunk.metadata.page,
          caseNumber: chunk.metadata.caseNumber,
          fileName: chunk.metadata.fileName,
          pdfUrl: chunk.metadata.pdfUrl,
          note: chunk.metadata.note
        });
        
        // 참조 형식: 페이지 또는 사례 번호를 포함
        const pageInfo = chunk.metadata.page ? `, p.${chunk.metadata.page}` : '';
        const caseInfo = chunk.metadata.caseNumber ? `, ${chunk.metadata.caseNumber}` : '';
        const refInfo = `${chunk.metadata.fileName || '문서'}${caseInfo || pageInfo}`;
          
        return `[참조 ${idx + 1} - ${refInfo}]\n${chunk.content}`;
      }).join('\n\n---\n\n');
    }

    // 시스템 프롬프트 구성
    const systemPrompt = `당신은 대한민국 중앙선거관리위원회의 "제21대 대통령선거 정치관계법 사례예시집"을 기반으로 답변하는 선거법 전문 도우미입니다.

다음 원칙을 따라주세요:
1. 제공된 참조 자료의 내용을 정확하게 인용하여 답변합니다.
2. 선거법과 관련된 질문에는 구체적인 법조문과 사례를 참조합니다.
3. 불확실한 내용은 추측하지 않고, 참조 자료에 없는 내용임을 명시합니다.
4. 한국어로 친절하고 명확하게 답변합니다.
5. 법적 조언이 필요한 경우 관할 선거관리위원회에 문의하도록 안내합니다.
6. 답변 시 참조한 자료가 있다면 [참조 번호 - 파일명, 사례 번호] 형식으로 명시합니다.
7. 실제로 질문과 관련된 참조만 인용하고, 관련성이 낮은 참조는 언급하지 마세요.

답변 형식 규칙:
- 마크다운 볼드(**) 표시를 사용하지 마세요. 대신 일반 텍스트로 작성하세요.
- 두괄식으로 핵심 내용을 먼저 제시한 후 세부 사항을 설명하세요.
- 목록을 나열할 때는 번호나 불릿 포인트를 사용하되, 간결하게 정리하세요.
- 중요한 내용은 별도의 단락으로 구분하여 가독성을 높이세요.
- 참조를 인용할 때는 반드시 [참조 번호 - 파일명, 사례 번호] 형식을 사용하세요.

${context ? `다음은 질문과 관련된 참조 자료입니다 (관련성 높은 ${relevantChunks.length}개만 선택됨):\n\n${context}` : '관련 참조 자료를 찾을 수 없습니다.'}

사용자 질문: ${message}`;
    
    // 채팅 세션 시작
    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });

    // 프롬프트 전송
    const result = await chat.sendMessage(systemPrompt);
    const response = await result.response;
    const text = response.text();

    return reply.send({ 
      response: text,
      sources: sources.length > 0 ? sources : undefined
    });

  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ 
      error: '응답 생성 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 카테고리 목록 엔드포인트
fastify.get('/api/categories', async (request, reply) => {
  try {
    const categories = getAllCategories();
    return reply.send({ categories });
  } catch (error) {
    return reply.code(500).send({ 
      error: '카테고리 목록을 가져올 수 없습니다.'
    });
  }
});

// 건강 체크 엔드포인트
fastify.get('/api/health', async (request, reply) => {
  try {
    const categories = getAllCategories();
    return reply.send({
      status: 'ok',
      mode: 'chunk-based',
      categories: categories.length,
      chunks: 'loaded'
    });
  } catch (error) {
    return reply.send({
      status: 'ok',
      mode: 'chunk-based',
      chunks: 'not loaded'
    });
  }
});

// 정적 파일 제공 (프론트엔드) - API 라우트 이후에 등록
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  prefix: '/',
  decorateReply: false
});

// 서버 시작
const start = async () => {
  try {
    // 모델 초기화
    await initializeModel();
    
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
    console.log(`브라우저에서 http://localhost:${port} 접속`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();