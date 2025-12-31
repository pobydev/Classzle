
# PRD: Classzle (Smart Classroom Assigner)

**프로젝트 코드명:** Project Anti-Gravity  
**제품명:** Classzle (클래스즐)  
**문서 버전:** 3.0 (Updated to match v1.2.3 Implementation)  
**작성일:** 2025. 12. 28.  
**플랫폼:** Windows Desktop Application (Electron)  
**개발 스택:** Electron, Next.js (React 19), TypeScript, Tailwind CSS v4, shadcn/ui, Phosphor Icons  
**데이터 저장:** Local JSON (via Zustand Persist)

---

## 1. 프로젝트 개요 (Overview)

### 1.1. 배경 및 목적

* **배경:** 단순 평균 성적 맞추기 식의 반편성은 학급 내 성취도 격차 문제를 해결하지 못하며, 운동부/특수반 등 특정 그룹의 쏠림 현상을 수작업으로 조정하기 어려움.
* **목적:**
  1. **S자 배정:** 성적(1~1000)을 지그재그로 배정하여 모든 반에 상/중/하위권이 고르게 분포되도록 함.
  2. **커스텀 그룹 분산:** 교사가 '축구부', '방송반' 등 임의의 그룹을 만들고 학생을 태깅하여 시각화 및 균등 분산.
  3. **생활지도 총량제:** 학생의 성향(리더/행동형/정서형)과 점수를 고려해 담임 교사의 업무 부하를 균등화.

### 1.2. 핵심 가치 (Core Values)

* **Iterative Workflow:** 데이터가 초기화되지 않고 유지되어, 조건을 바꿔가며 최적의 결과를 찾을 때까지 무한 시뮬레이션 가능.
* **Privacy & Security:** 100% 로컬 우선 구동, 외부 서버 통신 없음.
* **작업 저장/불러오기:** 프로젝트 상태를 파일로 저장하고 언제든 불러올 수 있음.

---

## 2. 사용자 시나리오 (User Workflow)

### Step 1: 기초 정보 입력 (Setup)

* **입력:** 편성할 학급 수 설정, 학생 명단 엑셀 업로드.
* **필수 데이터:** 학년, 반, 번호, 이름, 성별, 성적(1~1000).
* **선택 데이터:** 생활지도(드롭다운), 기배정반(양식 B의 경우).
* **학생 관리:** 업로드 후 테이블에서 개별 학생 정보 수정 가능.
* **엑셀 가이드:** 인앱 가이드 제공 (양식 A: 기본, 양식 B: 기배정).

### Step 2: 상세 조건 설정 (Constraints & Groups)

5개의 탭으로 구성된 상세 조건 설정:

1. **분산 배정 그룹 설정:** 그룹 명칭, 색상 설정 및 학생 태깅. 하이라이트로 분포 시각화.
2. **피해야 할 관계 (Avoid):** 분리 배정해야 하는 학생 쌍 지정 + 사유 메모.
3. **같은 반 희망 (Keep):** 함께 배정해야 하는 학생 쌍 지정 + 사유 메모.
4. **고정 배정 (Fixed):** 특정 반에 반드시 배정해야 하는 학생 지정 + 사유 메모.
5. **전출 예정:** 전출 예정 학생 설정 (반당 남녀 균등 분산, 번호 맨 뒤 배정).

### Step 3: 배정 실행 및 결과 (Action & Dashboard)

* **실행 모드:**
  - **신규 배정:** 모든 배정 초기화 후 처음부터 재배정.
  - **현재 배정 수정 (Optimize):** 기배정된 결과 유지하며 제약조건 준수 최적화.
* **대시보드:**
  - 칸반 보드 형태로 반별 학생 카드 표시.
  - 미배정 학생 상단 별도 영역.
  - 드래그 앤 드롭으로 수동 미세 조정 및 학생 교환.
* **필터:** 커스텀 그룹별 하이라이트 필터.
* **통계:** 반별 평균점수, 생활지도 총점, 성비, 유형별 인원 표시.
* **리포트:** 배정 결과 리포트 다이얼로그 제공 (이행 현황, 이동 명단, 변경 누적 이력).
* **엑셀 출력:** 반별 정렬 / 이전반별 정렬 2개 시트로 결과 내보내기.

---

## 3. 데이터 모델 명세 (Data Schema)

```typescript
// 학생 생활지도 유형
type BehaviorType = 'NONE' | 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL';

// 학생 성별
type Gender = 'M' | 'F';

// 학생 인터페이스
interface Student {
    id: string;                    // 학번 (UUID, Unique Key)
    name: string;                  // 이름
    prev_info: string;             // "학년-반-번호" (예: "3-2-15")
    gender: Gender;                // 성별
    academic_score: number;        // 성적 (1~1000)
    birth?: string;                // 생년월일 (선택)

    // 생활지도
    behavior_score: number;        // -3 ~ +2
    behavior_type: BehaviorType;   // 유형
    behavior_note?: string;        // 비고 (툴팁)
    is_pre_transfer?: boolean;     // 전출 예정 여부

    // 그룹 및 관계
    group_ids: string[];           // 소속된 CustomGroup ID 목록
    avoid_ids: string[];           // 피해야 할 학생 ID (분리 배정)
    avoid_memos?: Record<string, string>; // 분리 배정 사유 (Key: 상대ID, Value: 사유)
    keep_ids: string[];            // 함께해야 할 학생 ID (동반 배정)
    keep_memos?: Record<string, string>;  // 동반 배정 사유
    fixed_class?: string;          // 고정 반 (예: "1반")
    fixed_class_memo?: string;     // 고정 배정 사유

    // 배정 결과
    assigned_class?: string | null; // 배정된 반 (예: "1반")
}

// 커스텀 그룹 인터페이스
interface CustomGroup {
    id: string;                    // 그룹 ID
    name: string;                  // 그룹명 (예: "축구부", "특수학급")
    color: string;                 // UI 뱃지 색상 (Tailwind class)
    member_ids: string[];          // 이 그룹에 속한 학생 ID 목록
}

// 부여 번호 방식
type NumberingMethod = 'mixed' | 'maleFirst' | 'femaleFirst';

// 앱 설정 인터페이스
interface AppSettings {
    classCount: number;            // 편성할 학급 수
    scoreTolerance: number;        // 성적 유사도 허용 범위 (±)
    numberingMethod: NumberingMethod; // 번호 부여 방식
    useAdvancedConstraints: boolean; // 고급 제약 조건 사용 여부
}

// 배정 결과 통계
interface ClassStats {
    className: string;             // 반 이름
    studentCount: number;          // 학생 수
    averageScore: number;          // 평균 성적
    behaviorTotal: number;         // 생활지도 총점
    maleCount: number;             // 남학생 수
    femaleCount: number;           // 여학생 수
    leaderCount: number;           // 리더십 학생 수
    behaviorTypeCount: number;     // 행동형 학생 수
    emotionalCount: number;        // 정서형 학생 수
    // 점수별/유형별 세부 인원
    scoreMinus3: number;
    scoreMinus2: number;
    scoreMinus1: number;
    behaviorPlus1: number;
    behaviorPlus2: number;
    behaviorPlus3: number;
    emotionalPlus1: number;
    emotionalPlus2: number;
    emotionalPlus3: number;
    normalCount: number;
    scorePlus1: number;
    scorePlus2: number;
    scorePlus3: number;
    groupCounts: Record<string, number>; // 커스텀 그룹별 학생 수
    preTransferMaleCount: number;        // 전출 예정 남학생 수
    preTransferFemaleCount: number;      // 전출 예정 여학생 수
}

// 배정 변경 이력 인터페이스
interface AssignmentChange {
    studentId: string;
    studentName: string;
    oldClass: string | null;
    newClass: string | null;
    timestamp: number;
    type?: 'move' | 'swap';
    source?: 'auto' | 'manual'; // 변경 출처
    partnerName?: string;       // 교환 상대 이름
    partnerId?: string;         // 교환 상대 ID
}
```

---

## 4. 핵심 알고리즘 (Algorithm Logic)

### 4.1. 1단계: 균형 잡힌 초기 배정 (Balanced Initial Assignment)

**Suitability Score 방식:**

1. **유형별 분류:** 전출생, 리더, 행동형, 정서형, 일반 학생으로 분류.
2. **우선 배치:**
   - 고정반 학생 먼저 배정.
   - 전출생 남녀 균등 분산.
   - 리더/행동형/정서형 학생을 점수 레벨별로 균등 분산 (쿼터제).
3. **S자 배정:** 일반 학생을 성적 내림차순으로 정렬 후 지그재그 배정.
4. **적합도 점수:** 각 반에 학생을 배정할 때 위반 가능성을 계산하여 최적 반 선택.

### 4.2. 2단계: 균형 최적화 루프 (Optimize Balance)

*성적 균형을 유지하며 모든 제약 조건을 해결.*

1. **우선순위(Priority):**
   - 1순위: 고정반 & 상극(Avoid) 해결
   - 2순위: 단짝(Keep) 관계 해결
   - 3순위: 생활지도 유형별 인원 균형
   - 4순위: 성별 균형
   - 5순위: 성적 평균 균형
2. **교환(Swap) 로직:**
   - 성적 유사 학생끼리 교환하여 제약 조건 해결.
   - 교환 시 새로운 위반이 발생하지 않도록 검증.
3. **후처리 보정:**
   - 1차 배정 후 성비와 성적 평균 미세 조정.

### 4.3. 3단계: 제약 조건 해결 (Hard Constraints Solving)

- **Avoid 해결:** 상극 관계 학생 분리 배정.
- **Keep 해결:** 단짝 관계 학생 동반 배정.
- **그룹 분산:** 커스텀 그룹 학생 균등 분산.

---

## 5. 상세 UI/UX 명세 (UI Specification)

### 5.1. 디자인 시스템

* **Framework:** shadcn/ui + Radix UI
* **Icons:** Phosphor Icons (@phosphor-icons/react)
* **Theme:** 다크 네이비 계열 + 화이트, 모던한 카드 기반 레이아웃
* **Components:** Tabs (단계 전환), Dialog (팝업/리포트), Badge (태그), Switch (토글), Select (드롭다운)

### 5.2. Step 1 화면

* 학급 수 설정 슬라이더
* 엑셀 업로드 영역 (드래그 앤 드롭 / 파일 선택)
* 학생 명단 테이블 (인라인 수정 가능)
* 샘플 다운로드 버튼
* 엑셀 가이드 모달 (양식 A/B 탭 구분)

### 5.3. Step 2 화면

* 5개 탭 (분산배정그룹, 피해야할관계, 같은반희망, 고정배정, 전출예정)
* 학생 선택 UI: 반 필터 + 3열 그리드 레이아웃
* 관계 설정 시 사유 메모 입력
* 설정 내역 요약 표시

### 5.4. Step 3 대시보드

* **상단:** 필터 버튼, 미배정 학생 영역
* **메인:** 반별 컬럼 (학생 카드 표시)
* **통계 헤더:** 반별 인원, 평균점수, 성비, 생활지도 총점
* **기능:**
  - 드래그 앤 드롭 이동
  - 클릭으로 학생 상세 정보 확인
  - 리포트 다이얼로그 (인쇄 가능)

---

## 6. 기능 요구사항 (Functional Requirements)

### 6.1. 데이터 영속성 (Persistence)

* Zustand Persist를 사용하여 앱 종료/재시작 후에도 설정 데이터 유지.
* 프로젝트 상태 전체 저장/불러오기 기능 (Electron에서는 네이티브 파일 다이얼로그 사용).
* "전체 초기화" 시 확인 다이얼로그 표시 (저장 여부 경고).

### 6.2. 엑셀 입력

* **양식 A (기본):** 학년, 반, 번호, 이름, 성별, 성적, 생활지도
* **양식 B (기배정):** 양식 A + 배정반 컬럼 (기배정 모드용)
* **생활지도 드롭다운 옵션:** 해당없음, 리더(+1), 리더(+2), 행동(-1), 행동(-2), 행동(-3), 정서(-1), 정서(-2), 정서(-3)

### 6.3. 엑셀 출력

* **ExcelJS 기반** 고품질 출력
* **시트 1 (배정결과-반별):** 배정반 기준 정렬, 반별 요약 포함
* **시트 2 (배정결과-이전반별):** 이전반 기준 정렬, 담임 확인용
* **스타일:** 헤더, 요약행 스타일링, 적절한 열 너비, 페이지 나누기

### 6.4. 배정 리포트

* **이행 현황 탭:** 같은반희망/피해야할관계 이행률 및 상세
* **이동 명단 탭:** 최초배정 → 최종배정 이동 학생 목록
* **변경 누적 이력 탭:** 시간순 변경 이력 (auto/manual 구분)
* **인쇄 지원:** Electron printPreview API 활용

### 6.5. 번호 부여 방식

* **혼합 (가나다순):** 전체 학생 이름순
* **남자 우선:** 남학생 먼저 번호 부여 후 여학생
* **여자 우선:** 여학생 먼저 번호 부여 후 남학생
* 전출 예정 학생은 맨 마지막 번호로 배정

---

## 7. 주요 컴포넌트 구조

```
src/
├── app/
│   └── page.tsx              # 메인 페이지 (Tabs로 Step 1~3 전환)
├── components/
│   ├── step1/
│   │   └── Step1Setup.tsx    # 기초 정보 입력
│   ├── step2/
│   │   └── Step2Constraints.tsx # 상세 조건 설정 (5개 탭)
│   ├── step3/
│   │   ├── Step3Dashboard.tsx   # 배정 대시보드
│   │   ├── ClassColumn.tsx      # 반 컬럼 컴포넌트
│   │   ├── StudentCard.tsx      # 학생 카드 컴포넌트
│   │   ├── UnassignedList.tsx   # 미배정 학생 영역
│   │   └── AssignmentReportDialog.tsx # 리포트 다이얼로그
│   ├── ui/                    # shadcn/ui 컴포넌트
│   └── PreTransferSettings.tsx # 전출생 설정 공용 컴포넌트
├── lib/
│   ├── algorithm.ts           # 배정 알고리즘
│   ├── excel.ts              # 엑셀 파싱/출력
│   ├── store.ts              # Zustand 스토어
│   ├── numbering.ts          # 출석 번호 계산
│   └── validation.ts         # 유효성 검사
├── types/
│   └── index.ts              # TypeScript 타입 정의
└── constants/
    └── index.ts              # 상수 정의
```

---

## 8. 기술 스택 상세

| 영역 | 기술 | 버전 |
|------|------|------|
| Framework | Electron + Next.js | 33.0.0 / 16.x |
| UI Library | React | 19.x |
| Styling | Tailwind CSS | 4.x |
| Component Library | shadcn/ui + Radix UI | Latest |
| Icons | Phosphor Icons | 2.x |
| State Management | Zustand (with persist) | 5.x |
| Excel Processing | xlsx + ExcelJS | 0.18.x / 4.x |
| Drag and Drop | @dnd-kit | 6.x |
| Notifications | Sonner | 2.x |
| Build Tool | electron-builder | 25.x |

---

## 9. 개발 완료 기능 (v1.2.3 기준)

1. ✅ Electron + Next.js 프로젝트 세팅
2. ✅ 엑셀 파싱 및 유효성 검사
3. ✅ Zustand 스토어 설계 및 영속성
4. ✅ S자 배정 + Suitability Score 알고리즘
5. ✅ 제약 조건 (Avoid/Keep/Fixed) 처리
6. ✅ 커스텀 그룹 관리 및 시각화
7. ✅ 전출 예정 학생 균등 분산
8. ✅ 드래그 앤 드롭 수동 조정
9. ✅ 배정 리포트 다이얼로그 (인쇄 지원)
10. ✅ 엑셀 출력 (반별/이전반별 2시트)
11. ✅ 프로젝트 저장/불러오기
12. ✅ 생활지도 유형별 균등 분산 (쿼터제)
13. ✅ 성비/성적 후처리 보정
14. ✅ Windows 설치 파일 빌드

---

## 10. 향후 개선 계획

- 알고리즘 속도 최적화 (대규모 데이터)
- 추가 플랫폼 지원 (macOS, Linux)
- 히스토리 되돌리기 (Undo/Redo)
- 다양한 출력 형식 지원 (PDF 등)
