import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// 환경 변수 로드
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createCache() {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.');
  }

  try {
    // 텍스트 파일 읽기
    const textPath = path.join(__dirname, '../data/nec_election_guide.txt');
    const documentContent = await fs.readFile(textPath, 'utf-8');
    
    console.log(`문서 크기: ${documentContent.length} 문자`);

    // Gemini AI 클라이언트 초기화
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    // 일반 모델로 진행 (캐싱 기능 없이)
    console.log('Gemini API 초기화 완료');
    console.log(`모델: ${modelName}`);
    
    // 캐시 정보 파일로 저장 (실제 캐시는 아니지만 호환성을 위해)
    const cacheInfo = {
      cacheId: 'local-context-mode',
      modelName,
      createdAt: new Date().toISOString(),
      documentLength: documentContent.length,
      note: '캐싱 기능 대신 컨텍스트 기반 응답 모드를 사용합니다.'
    };
    
    await fs.writeFile(
      path.join(__dirname, '../data/cache-info.json'),
      JSON.stringify(cacheInfo, null, 2)
    );

    console.log('\n✅ 초기화 완료!');
    console.log('참고: Gemini API의 캐싱 기능 대신 컨텍스트 기반 응답을 사용합니다.');
    console.log('\n.env 파일의 GEMINI_CACHE_ID를 다음과 같이 설정하세요:');
    console.log('GEMINI_CACHE_ID=local-context-mode');

  } catch (error) {
    console.error('초기화 중 오류 발생:', error);
    throw error;
  }
}

// 스크립트 실행
createCache();