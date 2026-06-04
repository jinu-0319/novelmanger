# Moneta — AI 웹소설 창작 어시스턴트

한국 웹소설 작가를 위한 AI 기반 통합 집필 플랫폼입니다.  
원고 집필부터 일관성 검사, AI 리뷰, 내보내기까지 창작의 전 과정을 지원합니다.

---

## 주요 기능

| 기능 | 설명 | AI 모델 |
|---|---|---|
| **Story Keeper** | 캐릭터·플롯·세계관 일관성 3-pass 병렬 검사 | Gemini 2.5 Flash |
| **Clio 팩트 체커** | 역사·사실 오류 탐지 및 수정 제안 | Gemini 2.5 Flash + Google Serper |
| **AI 리뷰** | 7개 카테고리 점수 + 서술형 피드백 | Gemini 2.5 Flash |
| **위키 자동 추출** | 에피소드에서 인물·세계관·사건 자동 분류 | Gemini 2.5 Flash |
| **플롯 추천·생성** | 다음 전개 방향 3가지 추천 / 신규 플롯 생성 | GPT-4o |
| **맞춤법 검사** | 문장 단위 교정 제안 | Naver 맞춤법 API |
| **원고 내보내기** | txt / md / docx / pdf / epub 변환 | — |

> 리뷰·위키·플롯 기능은 **장르·플랫폼·태그**를 입력하면 네이버 시리즈·카카오페이지·문피아·노벨피아 기준에 맞는 맞춤 피드백을 제공합니다.

---

## 기술 스택

### 백엔드
- **Python 3.12+** / FastAPI / Uvicorn
- **LLM**: Google Gemini 2.5 Flash (분석·리뷰·위키), OpenAI GPT-4o (플롯)
- **임베딩**: Google text-embedding-004
- **벡터 DB**: ChromaDB (역사 지식 RAG)
- **인증**: JWT (python-jose), bcrypt

### 프론트엔드
- **Next.js 14** (App Router) / React / TypeScript
- **상태 관리**: Zustand (persist)
- **에디터**: TipTap (리치 텍스트)
- **스타일**: Tailwind CSS

### 인프라
- Docker / Kubernetes (k8s 매니페스트 포함)
- AWS EC2 배포 상정

---

## 프로젝트 구조

```
novelmanger/
├── main.py                        # FastAPI 앱 진입점
├── pyproject.toml
├── app/
│   ├── auth/                      # JWT 인증
│   ├── novels/                    # 소설·캐릭터·세계관 CRUD
│   ├── plot/                      # 플롯 추천·생성
│   ├── spell/                     # 맞춤법 검사
│   ├── wiki/                      # 위키 자동 추출
│   ├── core/
│   │   ├── llm.py                 # LLM/임베딩 팩토리 (모델 교체 시 여기만 수정)
│   │   └── paths.py               # 사용자별 데이터 경로 리졸버
│   ├── service/
│   │   ├── story_keeper_agent/    # Story Keeper (일관성 검사)
│   │   ├── clio_fact_checker_agent/ # Clio (팩트 체킹)
│   │   ├── review/                # AI 리뷰
│   │   └── export/                # 원고 내보내기
│   ├── common/
│   │   └── history/               # 역사 지식 DB + ChromaDB 벡터 스토어
│   └── data/
│       ├── history_db.json        # 역사 지식 샘플 데이터
│       └── users/{user_id}/{novel_id}/  # 사용자별 격리 저장소
└── frontend/
    ├── src/
    │   ├── app/                   # Next.js 페이지 (editor, projects, characters …)
    │   ├── components/            # UI 컴포넌트
    │   ├── store/                 # Zustand 스토어
    │   ├── lib/                   # API 클라이언트, 파일 가져오기
    │   └── types/                 # TypeScript 타입 정의
    └── package.json
```

---

## 시작하기

### 사전 요구 사항

- Python 3.12 이상
- Node.js 18 이상
- Google Gemini API 키
- OpenAI API 키 (플롯 기능 사용 시)

### 1. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일에 아래 값을 입력합니다:

```env
# Google Gemini (분석·리뷰·임베딩)
GEMINI_API_KEY=your_gemini_api_key

# OpenAI (플롯 추천·생성)
OPENAI_API_KEY=your_openai_api_key

# Google Serper (Clio 웹 검색, 선택)
SERPER_API_KEY=your_serper_api_key

# JWT 시크릿 (반드시 변경)
JWT_SECRET_KEY=your-secret-key-change-this

# CORS 허용 오리진 (쉼표 구분)
ALLOWED_ORIGINS=http://localhost:3000

# ChromaDB (기본값: 로컬 파일 모드)
CHROMA_HOST=localhost
CHROMA_PORT=8800
```

### 2. 백엔드 실행

```bash
# 의존성 설치
pip install -e .
# 또는 uv 사용
uv sync

# 서버 실행
uvicorn main:app --reload --port 8000
```

서버가 실행되면 API 문서를 확인할 수 있습니다:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 3. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:3000 으로 접속합니다.

---

## Docker로 실행

```bash
# 백엔드
docker build -t moneta-backend .
docker run -p 8000:8000 --env-file .env moneta-backend

# 프론트엔드
docker build -f Dockerfile.frontend -t moneta-frontend ./frontend
docker run -p 3000:3000 moneta-frontend
```

---

## API 엔드포인트

모든 AI 엔드포인트는 `Authorization: Bearer <token>` 헤더 필수

| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/auth/register` | 회원가입 |
| POST | `/auth/login` | 로그인 (JWT 발급) |
| GET | `/novels` | 소설 목록 조회 |
| POST | `/novels` | 소설 생성 |
| POST | `/novels/{id}/characters` | 캐릭터 저장 |
| POST | `/story/manuscript_feedback` | Story Keeper 일관성 검사 |
| POST | `/review/analyze` | AI 리뷰 (7개 카테고리) |
| POST | `/wiki/extract` | 위키 자동 추출 |
| POST | `/plot/suggest` | 플롯 전개 방향 추천 |
| POST | `/plot/generate` | 신규 플롯 아이디어 생성 |
| POST | `/manuscript/analyze` | Clio 팩트 체커 |
| POST | `/spell/check` | 맞춤법 검사 |
| POST | `/export/download` | 원고 파일 내보내기 |

---

## 사용자 흐름

```
1단계 프로젝트 시작    →    2단계 설정 구축    →    3단계 AI 보조 집필    →    4단계 검수 & 완성
회원가입·로그인              캐릭터 등록                에디터 집필                 Story Keeper
소설 생성                   세계관 설정                플롯 AI 추천                Clio 팩트 체크
장르·플랫폼·태그 설정         역사 DB 등록               맞춤법 검사                 AI 리뷰
                            자료 등록                  위키 자동 추출               내보내기
```

---

## 장르 및 플랫폼 지원

리뷰·위키·플롯 API에 `genre`, `platform`, `tags` 파라미터를 전달하면 장르·플랫폼에 맞는 맞춤 기준이 적용됩니다.

**지원 장르**: 회귀 / 빙의 / 환생 / 로판 / 판타지 / 무협 / 현대 / SF / 스릴러 / 로맨스 / 역사·대체역사

**지원 플랫폼**: 네이버 시리즈 / 카카오페이지 / 문피아 / 노벨피아

**태그 예시**: `#회귀물`, `#대체역사`, `#현대판타지`, `#이세계`

---

## 라이선스

MIT License
