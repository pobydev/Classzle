// 학생 생활지도 유형
export type BehaviorType = 'NONE' | 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL';

// 학생 성별
export type Gender = 'M' | 'F';

// 학생 인터페이스
export interface Student {
    id: string;                    // 학번 (Unique Key)
    name: string;                  // 이름
    prev_info: string;             // "3-2-15" (이전학년-반-번호)
    gender: Gender;                // 성별
    academic_score: number;        // 성적 (1~1000)
    birth?: string;                // 생년월일 (YYYY.MM.DD.)

    // 생활지도
    behavior_score: number;        // -2 ~ +3
    behavior_type: BehaviorType;   // 유형
    behavior_note?: string;        // 비고 (툴팁)
    is_pre_transfer?: boolean;     // 전출 예정 여부

    // 그룹 및 관계
    group_ids: string[];           // 소속된 CustomGroup ID 목록
    avoid_ids: string[];           // 피해야 할 학생 ID (저격)
    avoid_memos?: Record<string, string>; // 분리 배정 사유 (Key: 상대ID, Value: 사유)
    keep_ids: string[];            // 함께해야 할 학생 ID (단짝)
    keep_memos?: Record<string, string>;  // 동반 배정 사유
    fixed_class?: string;          // 고정 반 (예: "1반")
    fixed_class_memo?: string;     // 고정 배정 사유

    // 배정 결과
    assigned_class?: string | null; // 배정된 반 (예: "1반")
}

// 커스텀 그룹 인터페이스
export interface CustomGroup {
    id: string;                    // 그룹 ID
    name: string;                  // 그룹명 (예: "축구부", "특수학급")
    color: string;                 // UI 뱃지 색상 (Tailwind class 또는 Hex)
    member_ids: string[];          // 이 그룹에 속한 학생 ID 목록
}

// 부여 번호 방식
export type NumberingMethod = 'mixed' | 'maleFirst' | 'femaleFirst';

// 앱 설정 인터페이스
export interface AppSettings {
    classCount: number;            // 학급 수
    scoreTolerance: number;        // 성적 유사도 허용 범위 (±)
    numberingMethod: NumberingMethod; // 번호 부여 방식
    useAdvancedConstraints: boolean;
}

// 배정 결과 통계 (확장)
export interface ClassStats {
    className: string;             // 반 이름
    studentCount: number;          // 학생 수
    averageScore: number;          // 평균 성적
    behaviorTotal: number;         // 생활지도 총점
    maleCount: number;             // 남학생 수
    femaleCount: number;           // 여학생 수
    leaderCount: number;           // 리더십 학생 수
    behaviorTypeCount: number;     // 행동형 학생 수
    emotionalCount: number;        // 정서형 학생 수
    // 점수별 학생 수 (상세 분리)
    scoreMinus3: number;
    scoreMinus2: number;
    scoreMinus1: number;

    // 행동형
    behaviorPlus1: number;         // 행동형 +1
    behaviorPlus2: number;         // 행동형 +2
    behaviorPlus3: number;         // 행동형 +3

    // 정서형
    emotionalPlus1: number;        // 정서형 +1
    emotionalPlus2: number;        // 정서형 +2
    emotionalPlus3: number;        // 정서형 +3

    // 일반
    normalCount: number;           // 0점 (해당없음)

    // 리더십(보합)
    scorePlus1: number;
    scorePlus2: number;
    scorePlus3: number;

    // 커스텀 그룹별 학생 수
    groupCounts: Record<string, number>;

    // 전출 예정 학생 수
    preTransferMaleCount: number;    // 전출 예정 남학생 수
    preTransferFemaleCount: number;  // 전출 예정 여학생 수
}

// 제약 조건 위반 정보
export interface Violation {
    type: 'AVOID' | 'KEEP' | 'BEHAVIOR_IMBALANCE' | 'GENDER_IMBALANCE' | 'FIXED_CLASS';
    message: string;
    studentIds: string[];
    className?: string;
}

export interface ElectronAPI {
    platform: string;
    versions: {
        node: string;
        chrome: string;
        electron: string;
    };
    saveProject: (data: string) => Promise<boolean>;
    loadProject: () => Promise<string | null>;
    saveNamedProject: (name: string, data: string) => Promise<boolean>;
    loadNamedProject: (name: string) => Promise<string | null>;
    getProjectList: () => Promise<string[]>;
    deleteProject: (name: string) => Promise<boolean>;
    printPreview: (html: string) => Promise<boolean>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

// 배정 변경 이력 인터페이스
export interface AssignmentChange {
    studentId: string;
    studentName: string;
    oldClass: string | null;
    newClass: string | null;
    timestamp: number;
    type?: 'move' | 'swap';
    source?: 'auto' | 'manual'; // 변경 출처 추가
    partnerName?: string;
    partnerId?: string;
}
