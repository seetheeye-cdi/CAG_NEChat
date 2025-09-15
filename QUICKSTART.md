# 빠른 시작 가이드

## 🚀 5분 안에 시작하기

### 1. 프로젝트 복제 및 설정

```bash
# 의존성 설치
pnpm install

# 환경 변수 파일 생성
cat > .env << EOF
GEMINI_API_KEY=AIzaSyB5om34Z0ORHl45N4U38_2F9RwvmZU6jys
GEMINI_MODEL=gemini-2.5-pro
GEMINI_CACHE_ID=local-context-mode
PORT=3000
EOF
```

### 2. 데이터 준비

샘플 데이터 사용 (권장):
```bash
npx tsx scripts/createSampleChunks.ts
```

### 3. 서버 실행

```bash
pnpm dev
```

### 4. 챗봇 사용

브라우저에서 http://localhost:3000 접속

## 📝 예시 질문들

챗봇에 다음과 같은 질문을 해보세요:

- "SNS로 선거운동을 할 수 있나요?"
- "예비후보자가 받을 수 있는 후원금 한도는?"
- "문자메시지로 선거운동이 가능한가요?"
- "선거사무소는 몇 개까지 설치할 수 있나요?"
- "공무원도 선거운동을 할 수 있나요?"
- "예비후보자가 할 수 있는 홍보활동은?"
- "기부행위 제한은 어떻게 되나요?"
- "선거 관련 집회를 개최할 수 있나요?"

## 🎯 주요 기능

1. **Chunk 기반 검색**: 질문과 가장 관련성 높은 법률 사례를 자동으로 찾아줍니다.
2. **출처 표시**: 각 답변에 참조한 사례와 법조문을 명시합니다.
3. **대화형 인터페이스**: 자연스러운 대화 형식으로 질문할 수 있습니다.

## 🔧 문제 해결

### 서버가 시작되지 않는 경우
```bash
# 포트 확인
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 다시 실행
pnpm dev
```

### "Chunks가 로드되지 않았습니다" 오류
```bash
# chunks 재생성
npx tsx scripts/createSampleChunks.ts
```

### API 키 문제
Google AI Studio에서 새 API 키를 발급받으세요:
https://aistudio.google.com/apikey