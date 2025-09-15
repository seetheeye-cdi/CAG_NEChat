# NEChat_CAG - 선관위 데이터 기반 선거법 챗봇

중앙선거관리위원회의 "제21대 대통령선거 정치관계법 사례예시집"을 기반으로 하는 Context-Augmented Generation (CAG) 챗봇입니다.

## 🚀 주요 기능

- 📚 **Chunk 기반 검색**: 문서를 작은 단위로 나누어 효율적인 검색
- 💬 **자연스러운 대화형 인터페이스**: 질문-답변 형식의 직관적인 UI
- 🎯 **정확한 답변 생성**: Google Gemini API를 활용한 정확한 답변
- 📍 **출처 표시**: 각 답변에 참조한 사례 출처 명시
- 🌐 **웹 기반 인터페이스**: 별도 설치 없이 브라우저에서 사용

## 🛠️ 기술 스택

- **Backend**: Node.js, TypeScript, Fastify
- **AI**: Google Gemini API (gemini-2.5-pro)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Search**: Chunk-based keyword matching

## 📦 설치 및 실행

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Google Gemini API 접근 키 (Google AI Studio 발급 API Key)
GEMINI_API_KEY=YOUR_API_KEY_HERE

# 사용할 Gemini 모델
GEMINI_MODEL=gemini-2.5-pro

# 캐시 ID (사용하지 않는 경우 기본값 유지)
GEMINI_CACHE_ID=local-context-mode

# Fastify 서버 포트
PORT=3000
```

### 3. Chunks 데이터 생성

샘플 데이터로 chunks 생성:
```bash
npx tsx scripts/createSampleChunks.ts
```

실제 PDF에서 chunks 생성 (PDF 파싱 라이브러리 필요):
```bash
npx tsx scripts/downloadAndChunkPDF.ts
```

### 4. 서버 실행

개발 모드:
```bash
pnpm dev
```

프로덕션 모드:
```bash
pnpm build
pnpm start
```

### 5. 챗봇 사용

브라우저에서 `http://localhost:3000`에 접속하여 챗봇을 사용할 수 있습니다.

## 📂 프로젝트 구조

```
CAG_NEChat/
├── src/
│   ├── index.ts          # 메인 서버 파일
│   ├── chunkSearch.ts    # Chunk 검색 엔진
│   └── types.d.ts        # 타입 정의
├── scripts/
│   ├── createSampleChunks.ts     # 샘플 chunks 생성
│   ├── downloadAndChunkPDF.ts    # PDF chunk 처리
│   └── initCache.ts              # 캐시 초기화
├── public/
│   ├── index.html        # 프론트엔드 HTML
│   ├── styles.css        # CSS 스타일
│   └── script.js         # 프론트엔드 JavaScript
├── data/                 # Chunks 및 데이터 저장
│   └── chunks.json       # 검색 가능한 chunks
├── package.json
├── tsconfig.json
├── .env                  # 환경 변수
└── README.md
```

## 🔍 Chunk 기반 검색 시스템

이 챗봇은 효율적인 검색을 위해 chunk 기반 시스템을 사용합니다:

1. **문서 분할**: 긴 문서를 작은 의미 단위(chunks)로 분할
2. **키워드 매칭**: 사용자 질문과 관련된 chunks를 찾기
3. **관련도 점수**: 제목, 카테고리, 내용 기반 점수 계산
4. **상위 K개 선택**: 가장 관련성 높은 chunks만 선택
5. **컨텍스트 생성**: 선택된 chunks로 AI에게 전달할 컨텍스트 구성

## 📋 API 엔드포인트

### POST /api/chat
챗봇과 대화를 나눕니다.

**요청:**
```json
{
  "message": "SNS로 선거운동을 할 수 있나요?",
  "history": []
}
```

**응답:**
```json
{
  "response": "네, 예비후보자는 SNS를 통해 선거운동을 할 수 있습니다...",
  "sources": [
    {
      "title": "SNS를 이용한 선거운동",
      "category": "선거운동",
      "preview": "【사례 1】 SNS를 통한 선거운동의 허용 범위..."
    }
  ]
}
```

### GET /api/categories
사용 가능한 카테고리 목록을 반환합니다.

### GET /api/health
서버 상태를 확인합니다.

## 🎯 사용 예시

### 질문 예시:
- "SNS로 선거운동을 할 수 있나요?"
- "예비후보자가 받을 수 있는 후원금 한도는?"
- "선거사무소는 몇 개까지 설치할 수 있나요?"
- "공무원도 선거운동을 할 수 있나요?"
- "예비후보자가 할 수 있는 홍보활동은?"

## ⚠️ 주의사항

- 이 챗봇은 참고용이며, 법적 조언은 관할 선거관리위원회에 문의하시기 바랍니다.
- 샘플 데이터는 실제 사례를 단순화한 것으로, 실제 법률 자문에는 사용할 수 없습니다.
- PDF 파싱이 실패하는 경우 샘플 데이터가 사용됩니다.

## 🔧 문제 해결

### Chunks 로드 실패
`data/chunks.json` 파일이 존재하는지 확인하고, 없다면 스크립트를 재실행하세요.

### API 키 오류
Google AI Studio에서 유효한 API 키를 발급받아 `.env` 파일에 설정하세요.

### 포트 충돌
다른 포트를 사용하려면 `.env` 파일의 `PORT` 값을 변경하세요.
