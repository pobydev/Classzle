
# PRD: ClassFit (Smart Classroom Assigner)

**프로젝트 코드명:** Project Anti-Gravity
**제품명:** ClassFit (클래스 핏)
**문서 버전:** 2.5 (Final Integrated Text Version)
**작성일:** 2025. 12. 15.
**플랫폼:** Windows Desktop Application (Local)
**개발 스택:** Electron, Next.js (React), TypeScript, Tailwind CSS, shadcn/ui
**데이터 저장:** Local JSON / SQLite (via Zustand Persist)

---

## 1. 프로젝트 개요 (Overview)

### 1.1. 배경 및 목적

* **배경:** 단순 평균 성적 맞추기 식의 반편성은 학급 내 성취도 격차 문제를 해결하지 못하며, 운동부/특수반 등 특정 그룹의 쏠림 현상을 수작업으로 조정하기 어려움.
* **목적:**
  1. **S자 배정:** 성적(1~1000)을 지그재그로 배정하여 모든 반에 상/중/하위권이 고르게 분포되도록 함.
  2. **커스텀 그룹 분산:** 교사가 '축구부', '방송반' 등 임의의 그룹을 만들고 반별 최대 인원을 제한하여 자동 분산.
  3. **생활지도 총량제:** 학생의 성향(행동형/정서형)과 점수를 고려해 담임 교사의 업무 부하를 균등화.

### 1.2. 핵심 가치 (Core Values)

* **Iterative Workflow:** 데이터가 초기화되지 않고 유지되어, 조건을 바꿔가며 최적의 결과를 찾을 때까지 무한 시뮬레이션 가능.
* **Privacy & Security:** 로컬 우선 구동, AI 기능은 선택적(Opt-in) 사용.

---

## 2. 사용자 시나리오 (User Workflow)

### Step 1: 기초 정보 입력 (Setup)

* **입력:** 전체 학급 수, 학생 명단 엑셀 업로드.
* **필수 데이터:** 학번, 이름, 성별, 성적(1~1000), 이전학년정보.

### Step 2: 상세 조건 설정 (Constraints & Groups)

* **생활지도 설정:** 점수(-2~+3) 및 유형(행동/정서) 확인/수정.
* **커스텀 그룹 관리 (Custom Groups):** 그룹 명칭, 색상, 반당 최대 인원 설정 및 학생 태깅.
* **관계 설정:** 상극(Avoid), 단짝(Keep), 고정반(Fixed) 지정.

### Step 3: 배정 실행 및 결과 (Action & Dashboard)

* **실행:** "반편성 시작" 버튼 클릭 -> 알고리즘 수행.
* **확인:** 칸반 보드에서 결과 확인 및 필터 기능을 통해 그룹별 분포 하이라이트 확인.
* **수정:** 드래그 앤 드롭으로 수동 미세 조정.

---

## 3. 데이터 모델 명세 (Data Schema)

// 1. 사용자 정의 그룹 (예: 운동부)
interface CustomGroup {
id: string;
name: string;        // "축구부", "특수학급"
color: string;       // UI 뱃지 색상 (Hex Code or Tailwind Class)
max_per_class: number; // 반당 최대 허용 인원
member_ids: string[]; // 이 그룹에 속한 학생 ID 목록
}

// 2. 학생 정보
interface Student {
id: string;          // 학번 (Unique Key)
name: string;
prev_info: string;   // "3-2-15" (출력용)
gender: 'M' | 'F';
academic_score: number; // 1 ~ 1000

// 생활지도
behavior_score: number; // -2 ~ +3
behavior_type: 'NONE' | 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL';
behavior_note?: string; // 툴팁용 비고

// 그룹 및 관계
group_ids: string[];    // 소속된 CustomGroup ID 목록
avoid_ids: string[];    // 피해야 할 학생 ID
keep_ids: string[];     // 함께해야 할 학생 ID
fixed_class?: string;   // 고정 반 이름

assigned_class?: string | null; // 배정 결과
}

---

## 4. 핵심 알고리즘 (Algorithm Logic)

### 4.1. 1단계: S자 배정 (Snake Distribution) - 성적 밸런싱

1. **정렬:** 전체 학생을 academic_score 내림차순(1등->꼴찌) 정렬.
2. **배정:** Round 1 (1반 → N반), Round 2 (N반 → 1반) 순서로 지그재그 배정.
3. **결과:** 모든 반의 성적 분포와 평균이 균등한 상태가 됨.

### 4.2. 2단계: 제약 조건 기반 교환 (Constraint Swapping)

*성적 균형을 유지하며 그룹 및 생활지도 문제를 해결.*

1. **우선순위(Priority):** 1순위: 고정반 & 상극(Avoid) → 2순위: 커스텀 그룹 인원 초과 → 3순위: 생활지도 유형 쏠림 → 4순위: 성별 불균형.
2. **교환(Swap) 로직 상세:**
   * **Trigger:** 특정 반이 제약 조건을 위반함 (예: 1반에 축구부 3명).
   * **Target:** 위반 학생 A를 Target Class로 이동.
   * **Condition (Target Class 선정 기준):** Target Class는 A와 **성적이 유사한(Score ±Tolerance)** 학생 B와 맞교환하며, 이 교환으로 새로운 문제가 발생하지 않아야 함.

---

## 5. 상세 UI/UX 명세 (UI Specification)

### 5.1. 디자인 시스템 (shadcn/ui)

* **Theme:** Navy (#1A237E) & White.
* **Components:** Tabs (단계 전환), Dialog (팝업), Badge (태그), Switch (AI 토글).

### 5.2. 결과 대시보드 (Dashboard)

* **Visual Filters:** 상단에 커스텀 그룹별 필터 버튼. 클릭 시 해당 그룹 학생들만 Highlight.
* **Stats Header:** 반별 평균점수, 생활지도 총점, 남녀성비 표시 (불균형 시 경고 색상 적용).

---

## 6. 기능 요구사항 (Functional Requirements)

### 6.1. 데이터 영속성 (Persistence)

* Zustand Persist를 사용하여 앱 종료/재시작 후에도 Step 1, 2의 설정 데이터 유지.
* "배정 실행" 시 원본 데이터는 보존된 채 결과만 갱신.

### 6.2. 엑셀 출력

* **형식:** 각 반별 시트 분리 또는 한 시트에 반별 구획 나누기.
* **포함 정보:** 번호, 성명, 성별,  **이전학년(반/번호)** , 성적, 비고(소속 그룹 및 생활지도 특이사항).

### 6.3. AI 컨설턴트 (Optional)

* **보안 동의:** Switch ON 시 보안 동의 팝업 후 익명화된 JSON 데이터 전송.
* **기능:** Gemini API를 통해 재배치 제안 수신.

---

## 7. 개발 마일스톤 (Roadmap)

1. **Phase 1 (Setup & Data):** Electron/Next.js 세팅, 엑셀 로드 및 유효성 검사, Zustand 스토어 설계.
2. **Phase 2 (Logic - Snake):** 성적순 정렬 및 S자 배정 알고리즘 구현.
3. **Phase 3 (Logic - Constraint):** 커스텀 그룹 관리 기능 및 성적 유사군 Swap 알고리즘 구현.
4. **Phase 4 (UI - Interaction):** shadcn/ui 기반 3단계 UI, 칸반 보드(DnD), 하이라이트 필터 구현.
5. **Phase 5 (Polish):** 엑셀 출력, AI API 연동, 인스톨러 빌드.

---

## 8. AI API 데이터 구조 (JSON Schema)

// AI 기능 활성화 시에만 전송되는 익명화된 데이터 포맷
{
"request_type": "balance_check",
"constraints": { "max_risk_score_sum": 5 },
"classes": {
"1반": [
{"id": "Hash_001", "score": 3, "type": "BEHAVIOR", "gender": "M"},
{"id": "Hash_005", "score": -2, "type": "LEADER", "gender": "F"}
],
"2반": [ ... ]
}
}
