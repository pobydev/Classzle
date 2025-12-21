// ?™ìƒ ?í™œì§€??? í˜•
export type BehaviorType = 'NONE' | 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL';

// ?™ìƒ ?±ë³„
export type Gender = 'M' | 'F';

// ?™ìƒ ?¸í„°?˜ì´??
export interface Student {
    id: string;                    // ?™ë²ˆ (Unique Key)
    name: string;                  // ?´ë¦„
    prev_info: string;             // "3-2-15" (?´ì „?™ë…„-ë°?ë²ˆí˜¸)
    gender: Gender;                // ?±ë³„
    academic_score: number;        // ?±ì  (1~1000)
    birth?: string;                // ?ë…„?”ì¼ (YYYY.MM.DD.)

    // ?í™œì§€??
    behavior_score: number;        // -2 ~ +3
    behavior_type: BehaviorType;   // ? í˜•
    behavior_note?: string;        // ë¹„ê³  (?´íŒ??
    is_pre_transfer?: boolean;     // ?„ì¶œ ?ˆì • ?¬ë?

    // ê·¸ë£¹ ë°?ê´€ê³?
    group_ids: string[];           // ?Œì†??CustomGroup ID ëª©ë¡
    avoid_ids: string[];           // ?¼í•´?????™ìƒ ID (?ê·¹)
    avoid_memos?: Record<string, string>; // ë¶„ë¦¬ ë°°ì • ?¬ìœ  (Key: ?ë?ë°?ID, Value: ?¬ìœ )
    keep_ids: string[];            // ?¨ê»˜?´ì•¼ ???™ìƒ ID (?¨ì§)
    keep_memos?: Record<string, string>;  // ?™ë°˜ ë°°ì • ?¬ìœ 
    fixed_class?: string;          // ê³ ì • ë°?(?? "1ë°?)
    fixed_class_memo?: string;     // ê³ ì • ë°°ì • ?¬ìœ 

    // ë°°ì • ê²°ê³¼
    assigned_class?: string | null; // ë°°ì •??ë°?(?? "1ë°?)
}

// ì»¤ìŠ¤?€ ê·¸ë£¹ ?¸í„°?˜ì´??
export interface CustomGroup {
    id: string;                    // ê·¸ë£¹ ID
    name: string;                  // ê·¸ë£¹ëª?(?? "ì¶•êµ¬ë¶€", "?¹ìˆ˜?™ê¸‰")
    color: string;                 // UI ë±ƒì? ?‰ìƒ (Tailwind class ?ëŠ” Hex)
    member_ids: string[];          // ??ê·¸ë£¹???í•œ ?™ìƒ ID ëª©ë¡
}

// ???¤ì • ?¸í„°?˜ì´??
export interface AppSettings {
    classCount: number;            // ?™ê¸‰ ??
    scoreTolerance: number;        // ?±ì  ? ì‚¬êµ??ˆìš© ë²”ìœ„ (Â±)
}

// ë°°ì • ê²°ê³¼ ?µê³„ (?•ì¥)
export interface ClassStats {
    className: string;             // ë°??´ë¦„
    studentCount: number;          // ?™ìƒ ??
    averageScore: number;          // ?‰ê·  ?±ì 
    behaviorTotal: number;         // ?í™œì§€??ì´ì 
    maleCount: number;             // ?¨í•™????
    femaleCount: number;           // ?¬í•™????
    leaderCount: number;           // ë¦¬ë”???™ìƒ ??
    behaviorTypeCount: number;     // ?‰ë™???™ìƒ ??
    emotionalCount: number;        // ?•ì„œ???™ìƒ ??
    // ?ìˆ˜ë³??™ìƒ ??(?ì„¸ ë¶„ë¦¬)
    scoreMinus3: number;
    scoreMinus2: number;
    scoreMinus1: number;

    // ?‰ë™??
    behaviorPlus1: number;         // ?‰ë™??+1
    behaviorPlus2: number;         // ?‰ë™??+2
    behaviorPlus3: number;         // ?‰ë™??+3

    // ?•ì„œ??
    emotionalPlus1: number;        // ?•ì„œ??+1
    emotionalPlus2: number;        // ?•ì„œ??+2
    emotionalPlus3: number;        // ?•ì„œ??+3

    // ?¼ë°˜
    normalCount: number;           // 0??(?´ë‹¹?†ìŒ)

    // ?ˆê±°???¸í™˜ (?„ìš” ??? ì?, ?ëŠ” ë¡œì§?ì„œ ?©ì‚°?˜ì—¬ ?¬ìš©)
    scorePlus1: number;
    scorePlus2: number;
    scorePlus3: number;

    // ì»¤ìŠ¤?€ ê·¸ë£¹ë³??™ìƒ ??
    groupCounts: Record<string, number>;

    // ?„ì¶œ ?ˆì • ?™ìƒ ??
    preTransferMaleCount: number;    // ?„ì¶œ ?ˆì • ?¨í•™????
    preTransferFemaleCount: number;  // ?„ì¶œ ?ˆì • ?¬í•™????
}

// ?œì•½ ì¡°ê±´ ?„ë°˜ ?•ë³´
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
// ë°°ì • ë³€ê²??´ì—­ ?°ì´??
export interface AssignmentChange {
    studentId: string;
    studentName: string;
    oldClass: string | null;
    newClass: string | null;
    timestamp: number;
    type?: 'move' | 'swap';
    source?: 'auto' | 'manual'; // ë³€ê²?ì¶œì²˜ ì¶”ê?
    partnerName?: string;
    partnerId?: string;
}
