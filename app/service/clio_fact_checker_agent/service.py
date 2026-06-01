import json
import re
from typing import List, Dict, Any, Set, Optional
import difflib
from cachetools import TTLCache

# ── 웹 검색 결과 캐시 (최대 500개 항목, 1시간 TTL) ─────────────────────────
_search_cache: TTLCache = TTLCache(maxsize=500, ttl=3600)

# LangChain & AI 관련
from app.core.llm import get_llm
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.utilities import GoogleSerperAPIWrapper

# 로컬 DB 레포지토리
from app.service.clio_fact_checker_agent.repo import ManuscriptRepository

class ManuscriptAnalyzer:
    def __init__(
        self,
        setting_path: str,
        character_path: str,
        extra_fiction_terms: list[str] | None = None,
    ):
        # 1. LLM 설정
        self.llm = get_llm(temperature=0.1)

        # 2. 소설 설정(Plot DB) 로드 -> 허구 정보 필터링용
        self.settings = self._load_settings(setting_path)
        self.character_data = self._load_settings(character_path)
        self.setting_keywords = self._extract_setting_keywords()

        # 3. 위키에서 넘어온 허구 고유명사 추가 (웹 검색 오작동 방지)
        if extra_fiction_terms:
            for term in extra_fiction_terms:
                t = (term or "").strip()
                if t:
                    self.setting_keywords.add(t)

        # 3. 로컬 벡터 DB (기존 지식)
        self.repo = ManuscriptRepository()

        # 4. Web Search 도구 (Serper)
        # gl='kr': 한국 구글, hl='ko': 한국어 인터페이스 (필요시 'en'으로 변경 가능)
        self.search_tool = GoogleSerperAPIWrapper(gl='kr', hl='ko')

        # 5. 텍스트 분할기
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    def _load_settings(self, path: str) -> Dict[str, Any]:
        """설정 파일(JSON)을 로드합니다."""
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"⚠️ 설정 파일을 찾을 수 없습니다: {path}")
            return {}

    def _extract_setting_keywords(self) -> Set[str]:
        """소설 속 허구의 고유명사 + characters.json의 인물들을 필터링 키워드로 추출"""
        keywords = set()

        # 1. plot.json 데이터 처리 (기존 로직 유지)
        plot_data = self.settings
        for char in plot_data.get("characters", []):
            name = char.get("name", "").strip()
            if name: keywords.add(name)

        factions = plot_data.get("world_view", {}).get("factions", [])
        for f in factions:
            if isinstance(f, str):
                keywords.add(f.split("(")[0].strip())

        # 2. [추가] characters.json 데이터 처리
        if self.character_data:
            for name_key in self.character_data.keys():
                keywords.add(name_key.strip())

        return keywords

    @staticmethod
    def _is_content_equal(text1: str, text2: str) -> bool:
        """공백·특수문자를 제거한 뒤 두 문자열이 동일한지 비교"""
        def normalize(s: str) -> str:
            return re.sub(r'[\s\W_]+', '', s)
        return normalize(text1) == normalize(text2)

    def _retry_extract_sentence(self, chunk_text: str, keyword: str) -> Optional[str]:
        """LLM을 통해 키워드가 포함된 원문 문장을 재추출"""
        prompt = f"키워드 '{keyword}'가 포함된 문장을 원문 그대로 추출하세요. 없으면 None."
        try:
            res = self.llm.invoke([
                SystemMessage(content=prompt),
                HumanMessage(content=chunk_text[:3000]),
            ])
            val = res.content.strip().strip('"\'')
            return None if val == "None" or len(val) < 2 else val
        except Exception:
            return None

    def analyze_manuscript(self, text: str) -> Dict[str, Any]:
        """
        1차(탐지) + 2차(감수) 의견 동시 리포팅
        """
        print(f"📄 원고 분석 시작 (총 {len(text)}자)")

        chunks = self.text_splitter.split_text(text)

        # 1. 텍스트 분할 및 명제(Query) 추출
        all_query_items = []

        for chunk in chunks:
            items = self._extract_search_queries(chunk)

            for item in items:
                kw = item['keyword']
                origin_snippet = item.get('original_sentence', '')

                start_idx, end_idx = self._find_exact_position(
                    full_text=text,
                    target_snippet=origin_snippet,
                    start_from=0,
                )

                # 위치 검증 및 재시도
                is_match_success = False
                if start_idx != -1:
                    actual_found_text = text[start_idx:end_idx]
                    if (actual_found_text == origin_snippet
                            or self._is_content_equal(actual_found_text, origin_snippet)):
                        is_match_success = True

                if start_idx == -1 or not is_match_success:
                    new_snippet = self._retry_extract_sentence(chunk, kw)
                    if new_snippet:
                        start_idx, end_idx = self._find_exact_position(text, new_snippet, 0)
                        if start_idx != -1:
                            item['original_sentence'] = new_snippet

                item['start_index'] = start_idx if start_idx != -1 else -1
                item['end_index'] = end_idx if start_idx != -1 else -1
                all_query_items.append(item)

        print(f"   -> 총 {len(all_query_items)}개의 검색 후보 추출됨")

        known_settings = []
        historical_context = []
        verification_queue = []

        # 2. 검색 수행 (Search)
        for item_data in all_query_items:
            keyword = item_data['keyword']
            query_string = item_data['search_query']
            origin_sent = item_data.get('original_sentence', '')

            # 허구 필터링
            is_fiction = any(
                fiction_term in keyword or keyword in fiction_term
                for fiction_term in self.setting_keywords
            )

            if is_fiction:
                known_settings.append(keyword)
                continue

            print(f"🔍 검색 수행: '{keyword}'")

            search_data = self._check_local_db(keyword)
            if not search_data:
                search_data = self._search_web(query_string)

            if search_data:
                item_id = str(len(verification_queue))
                verification_queue.append({
                    "id": item_id,
                    "keyword": keyword,
                    "query": query_string,
                    "content": search_data['content'],
                    "context": origin_sent,
                    "source": search_data.get('source', 'Unknown'),
                    "start_index": item_data.get('start_index'),
                    "end_index": item_data.get('end_index')
                })

        # 3. 일괄/교차 검증 (Batch Verification)
        if verification_queue:
            print(f"🚀 총 {len(verification_queue)}건에 대해 2단계(교차) 검증을 수행합니다...")

            BATCH_SIZE = 5
            for i in range(0, len(verification_queue), BATCH_SIZE):
                batch_items = verification_queue[i : i + BATCH_SIZE]
                print(f"   -> Batch {i//BATCH_SIZE + 1} 처리 중 ({len(batch_items)}건)...")

                # [1차] 기본 검증 수행
                first_results = self._verify_batch_relevance(batch_items)

                # [2차] 교차 검증 수행 (1차 결과를 입력으로 넣음)
                final_results = self._double_check_batch_results(batch_items, first_results)

                # 결과 매핑 및 합치기
                for item in batch_items:
                    item_id = item['id']

                    # 1차, 2차 결과 개별 추출
                    res_1 = first_results.get(item_id, {})
                    res_2 = final_results.get(item_id, {})

                    # [관련성 판단] 2차가 있으면 2차 기준, 없으면 1차 기준
                    is_relevant = res_2.get('is_relevant', res_1.get('is_relevant', True))

                    if is_relevant:
                        # [최종 승인 여부] 2차 결과 우선 (없으면 1차, 둘 다 없으면 True)
                        final_is_positive = res_2.get('is_positive', res_1.get('is_positive', True))

                        # [핵심] 1차 이유와 2차 이유를 합침
                        reason_1 = res_1.get('reason', '1차 의견 없음')
                        reason_2 = res_2.get('reason', '2차 의견 없음')

                        # 보기 좋게 포맷팅
                        combined_reason = f"🔹[1차 탐지] {reason_1}\n🔸[2차 감수] {reason_2}"

                        final_obj = {
                            "keyword": item['keyword'],
                            "content": item['content'],
                            "source": item['source'],
                            "is_relevant": True,
                            "is_positive": final_is_positive, # 판정은 2차 기준
                            "reason": combined_reason,        # 이유는 둘 다 표시
                            "original_sentence": item['context'],
                            "start_index": item['start_index'],
                            "end_index": item['end_index']
                        }
                        historical_context.append(final_obj)

                        if final_is_positive:
                            print(f"      ✅ [통과] {item['keyword']}")
                        else:
                            print(f"      ❌ [오류] {item['keyword']}")
                    else:
                        print(f"      🗑️ [무관] {item['keyword']}")

        return {
            "found_entities_count": len(all_query_items),
            "setting_terms_found": list(set(known_settings)),
            "historical_context": historical_context
        }

    def _extract_search_queries(self, text: str) -> List[Dict[str, str]]:
        """
        [수정됨] 단순 명사가 아닌 '역사적 사실 관계(명제)'와 '시대적 정합성'을 검증하는 쿼리 생성기
        """
        prompt = """
        당신은 한국의 대체 역사 웹소설 전개의 역사적 합리성과 고증을 검수해주는 고문이자, 역사 소설의 고증 오류를 찾아내는 '팩트체크 쿼리 설계자'입니다.
        단순한 고유명사 추출이 아니라, **"이 내용이 역사적으로 가능한가?"**를 검증하기 위한 **명제(Proposition)와 맥락**을 추출하세요.

        [추출 기준: 무엇을 검증해야 하는가?]
        1. **행위와 사건의 사실성 (Historical Plausibility):**
           - 실존 인물이 해당 시점에 그 장소에 있었거나, 그 행동을 했는지.
        2. **시대적 불일치 (Anachronism):**
           - 등장한 물건, 용어, 개념이 해당 시대에 존재했는지.
        3. **문화/제도적 배경 (Cultural Context):**
           - 의복, 식사, 의료 행위, 법률 등이 당시 고증에 맞는지.

        [제외 대상 (Negative Rules)]
        - 역사적 맥락이 없는 단순한 일상 묘사 (예: "밥을 먹었다", "잠을 잤다").
        - 수식어가 없는 일반 명사 단독 추출 금지 (예: '병원', '사람', '하늘' -> 절대 금지).
        - **반드시 '검증이 필요한 구체적 서술'이 포함된 경우만 추출.**

        [출력 형식]
        반드시 아래와 같은 **JSON 리스트**만 출력하세요.
        [
            {
                "keyword": "검증 대상 (짧은 구 혹은 주어+서술어 요약)",
                "original_sentence": "본문에서 토씨 하나 안 바꾸고 그대로 복사한 문장 전체",
                "search_query": "구글/위키피디아 검색을 위한 쿼리 (시대 키워드 포함)",
                "reason": "이 항목을 역사적으로 검증해야 하는 구체적인 이유"
            }
        ]
        """

        try:
            # LLM에게 텍스트 전달
            response = self.llm.invoke([
                SystemMessage(content=prompt),
                HumanMessage(content=f"Text: {text[:3500]}") # 문맥 파악을 위해 길이 약간 늘림
            ])
            content = response.content.strip()

            # JSON 파싱
            return self._parse_json_garbage(content)

        except Exception as e:
            print(f"⚠️ 쿼리 생성 에러: {e}")
            return []

    def _check_local_db(self, keyword: str) -> Dict[str, Any]:
        """로컬 벡터 DB 조회"""
        try:
            # 검색
            search_result = self.repo.search(query_text=keyword, n_results=1)

            if not search_result['documents'][0]:
                return None

            dist = search_result['distances'][0][0]
            content = search_result['documents'][0][0]

            # 거리 임계값 (1.0보다 가까워야 관련성 있음)
            if dist < 1.0:
                return {
                    "keyword": keyword,
                    "content": content,
                    "source": "Local History DB",
                    "confidence": round(1 - (dist/2), 2)
                }
            return None
        except Exception:
            return None

    def _search_web(self, query: str) -> Dict[str, Any]:
        """Serper 웹 검색 (모듈 레벨 캐시 적용)"""
        cache_key = query.strip().lower()
        if cache_key in _search_cache:
            return _search_cache[cache_key]

        try:
            # 검색어에 '역사' 키워드가 없다면 추가 (영어/한글 혼용)
            if "역사" not in query and "history" not in query.lower():
                final_query = f"{query} 역사 history"
            else:
                final_query = query

            result_text = self.search_tool.run(final_query)

            if not result_text or len(result_text) < 10:
                _search_cache[cache_key] = None
                return None

            result = {
                "keyword": query,
                "content": result_text,
                "source": "Web Search (Serper)"
            }
            _search_cache[cache_key] = result
            return result
        except Exception:
            _search_cache[cache_key] = None
            return None

    def _verify_batch_relevance(self, batch_items: List[Dict]) -> Dict[str, Dict]:
        """[1차] 기본 검증"""
        items_text = ""
        for item in batch_items:
            items_text += f"""
            ---
            [ID: {item['id']}]
            - 검증 명제: {item['keyword']}
            - 소설 맥락: {item['context']}
            - 검색 결과: {item['content'][:800]} (너무 길면 자름)
            """

        prompt = f"""
        당신은 한국의 대체 역사 웹소설 전개의 역사적 합리성과 고증을 검수해주는 고문이자 역사 소설 팩트체커입니다. 아래 주어진 항목들(ID별)을 검증하세요.

        [입력 데이터]
        {items_text}

        [판단 기준]
        1. **is_relevant**: 검색 결과가 해당 명제를 검증하기에 적절한 역사/지식 자료인가? (광고나 무관한 내용이면 false)
        2. **is_positive**: 검색 결과에 비추어 볼 때, 소설의 내용이 역사적 사실과 부합하는가? 
           - 사실과 일치하거나 개연성이 있으면 true.
           - 명백한 시대착오(예: 조선시대 핸드폰)나 오류면 false.

        [출력 형식]
        반드시 **항목의 ID를 키(Key)**로 하는 JSON 객체를 반환하세요.
        예시:
        {{
            "0": {{ "is_relevant": true, "is_positive": false, "reason": "1916년에는 해당 무기가 없었음" }},
            "1": {{ "is_relevant": true, "is_positive": true, "reason": "당시 기록과 일치함" }}
        }}
        """

        try:
            response = self.llm.invoke([SystemMessage(content=prompt)])
            return self._clean_json_string(response.content)
        except Exception as e:
            print(f"⚠️ 배치 검증 실패: {e}")
            return {}

    def _double_check_batch_results(self, batch_items: List[Dict], first_results: Dict) -> Dict[str, Dict]:
        """
        [NEW] 2차 검증 (교차 검증)
        1차 검증 결과를 바탕으로 '최종 감수관' 페르소나가 한 번 더 확인합니다.
        """
        audit_payload = ""
        for item in batch_items:
            item_id = item['id']
            # 1차 결과 가져오기
            f_res = first_results.get(item_id, {})
            f_is_positive = f_res.get('is_positive', True)
            f_reason = f_res.get('reason', '판단 보류')

            audit_payload += f"""
            ---
            [ID: {item_id}]
            - 검증 명제: {item['keyword']}
            - 검색 증거: {item['content'][:500]}
            - 1차 판정: {'[승인]' if f_is_positive else '[오류/거부]'} (이유: {f_reason})
            """

        prompt = f"""
        당신은 한국의 대체 역사 웹소설 전개의 역사적 합리성과 고증을 검수해주는 고문이자, 역사 팩트체크 팀의 **'수석 감수관'**입니다.
        앞선 1차 검증 결과가 타당한지 비판적으로 재검토하여 최종 결론을 내리세요.

        [입력 데이터]
        {audit_payload}

        [임무]
        1. 1차 판정이 검색 증거와 맥락에 비추어 올바른지 판단하세요.
        2. 특히 **'오류(False)'로 판정된 건이 진짜 오류인지**, 아니면 허용 가능한 범위인지 신중히 확인하세요.
        3. 만약 1차 판정이 틀렸다고 생각되면 바로잡으세요.

        [출력 형식]
        반드시 **항목의 ID를 키(Key)**로 하는 JSON 객체를 반환하세요.
        예시:
        {{
            "0": {{ "is_relevant": true, "is_positive": false, "reason": "최종 검토 결과, 1차 판정이 맞습니다. 1916년에는 존재하지 않았습니다." }},
            "1": {{ "is_relevant": true, "is_positive": true, "reason": "1차 판정 수정: 해당 용어는 당시에도 드물게 사용되었습니다." }}
        }}
        """

        try:
            response = self.llm.invoke([SystemMessage(content=prompt)])
            return self._clean_json_string(response.content)
        except Exception as e:
            print(f"⚠️ 2차 교차 검증 실패: {e}")
            return first_results # 실패 시 1차 결과 그대로 반환

    def _parse_json_garbage(self, text: str) -> List[Dict]:
        """LLM이 주는 지저분한 JSON 문자열에서 리스트만 추출"""
        try:
            # 마크다운 제거
            text = text.replace("```json", "").replace("```", "").strip()

            # 가장 바깥쪽 대괄호 찾기
            start = text.find('[')
            end = text.rfind(']')
            if start != -1 and end != -1:
                json_str = text[start:end+1]
                return json.loads(json_str)
            return []
        except Exception:
            return []

    def _clean_json_string(self, text: str) -> str:
        """
                [수정됨] 입력이 이미 Dict라면 그대로 반환하고,
                String이라면 JSON 구간만 추출하여 파싱합니다.
                (TypeError 방지용 방어 코드 포함)
                """
        # 1. 입력이 이미 딕셔너리(Dict)라면 파싱할 필요 없이 바로 반환
        if isinstance(text, dict):
            return text

        # 2. 문자열이 아니라면(None 등) 빈 Dict 반환
        if not isinstance(text, str):
            return {}

        try:
            # 3. 마크다운 및 공백 제거
            text = text.replace("```json", "").replace("```", "").strip()

            # 4. 가장 바깥쪽 {} 찾기 (사족 제거)
            start_idx = text.find('{')
            end_idx = text.rfind('}')

            if start_idx != -1 and end_idx != -1 and start_idx < end_idx:
                json_str = text[start_idx : end_idx + 1]
                return json.loads(json_str)

            # 5. 괄호가 없으면 전체 파싱 시도
            return json.loads(text)

        except Exception:
            # 파싱 실패 시 빈 딕셔너리 반환
            return {}

    def _find_exact_position(self, full_text, target_snippet, start_from=0):
        """
        [Global Search 통합 버전]
        1단계: 단순 일치 (Exact Match)
        2단계: 정규화 일치 (Regex Normalization) - 공백/특수문자 무시
        3단계: 유사도 일치 (Fuzzy Match / Difflib) - 오타/변형 대응
        """
        if not target_snippet:
            return -1, -1

        # 검색 범위를 start_from 이후로 제한
        search_scope_text = full_text[start_from:]

        # ---------------------------------------------------------
        # 1단계: 단순 검색 (Exact Match)
        # ---------------------------------------------------------
        clean_target = target_snippet.strip(" '\"\n")
        if not clean_target:
            return -1, -1

        local_idx = search_scope_text.find(clean_target)
        if local_idx != -1:
            real_start = start_from + local_idx
            real_end = real_start + len(clean_target)
            return real_start, real_end

        # ---------------------------------------------------------
        # 2단계: 정규식 기반 유연한 검색 (Normalization)
        # ---------------------------------------------------------
        # 공백, 특수문자를 모두 제거하고 글자(Alphanumeric)만 비교
        def normalize(s):
            return re.sub(r'[\s\W_]+', '', s)

        norm_scope = normalize(search_scope_text)
        norm_target = normalize(clean_target)

        if not norm_target:
            return -1, -1

        norm_idx = norm_scope.find(norm_target)

        if norm_idx != -1:
            # 정제된 인덱스(norm_idx)를 원본 인덱스로 역매핑
            current_norm_pos = 0
            real_local_start = -1
            real_local_end = -1

            for i, char in enumerate(search_scope_text):
                # 원본 문자 중 특수문자/공백은 카운트하지 않고 건너뜀
                if re.match(r'[\s\W_]', char):
                    continue

                # 시작 위치 포착
                if current_norm_pos == norm_idx:
                    real_local_start = i

                # 끝 위치 포착 (길이만큼 진행했을 때)
                if current_norm_pos == norm_idx + len(norm_target) - 1:
                    real_local_end = i + 1
                    break

                current_norm_pos += 1

            if real_local_start != -1 and real_local_end != -1:
                return (start_from + real_local_start), (start_from + real_local_end)

        # ---------------------------------------------------------
        # 3단계: 유사도 기반 검색 (Fuzzy Match - Difflib)
        # ---------------------------------------------------------
        # 여기까지 왔다면 정밀 검색에 실패한 것임.
        # 최후의 수단으로 '가장 비슷한 문장'을 찾아 매칭 시도.

        # 문장 단위로 쪼개서 비교 (속도 최적화)
        # 마침표(.), 물음표(?), 느낌표(!), 줄바꿈(\n) 등을 기준으로 나눔
        candidates = re.split(r'[.?!:\n]+', search_scope_text)

        best_ratio = 0
        best_candidate = ""

        for cand in candidates:
            # 너무 짧은 문장(5글자 미만)은 노이즈일 가능성이 높음
            if len(cand) < 5:
                continue

            # 유사도 계산
            ratio = difflib.SequenceMatcher(None, cand, clean_target).ratio()

            if ratio > best_ratio:
                best_ratio = ratio
                best_candidate = cand

        # 유사도가 60% (0.6) 이상일 때만 찾은 것으로 간주
        if best_ratio >= 0.6:
            # 찾은 문장(best_candidate)이 원문의 어디에 있는지 찾기
            # (split되면서 특수문자가 사라졌을 수 있으므로 find로 다시 위치 추적)
            fuzzy_idx = search_scope_text.find(best_candidate)
            if fuzzy_idx != -1:
                return (start_from + fuzzy_idx), (start_from + fuzzy_idx + len(best_candidate))

        # 모든 방법 실패
        return -1, -1