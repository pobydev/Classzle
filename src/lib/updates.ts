// 새 버전 확인의 상태와 문구. 문구는 어울림, ScoreShow와 같습니다.
// 실제 확인과 내려받기는 main/updater.ts가 합니다.

export type FoundUpdate = {
    state: 'available' | 'downloading' | 'ready' | 'failed';
    version: string;
};

export type UpdateStatus = { state: 'idle' | 'checking' | 'latest' | 'error' } | FoundUpdate;

/** on: 설치판, portable: USB판(확인하지 않음), off: 웹과 개발 모드. main/portable.ts와 같습니다. */
export type UpdateSupport = 'on' | 'off' | 'portable';

const SETTING_KEY = 'classzle-update-check';

/**
 * 사용 가이드의 학생 정보 문장입니다. 새 버전 확인이 없는 판에는 인터넷 문장을 쓰지 않습니다.
 * USB판은 어울림 USB판처럼 자료가 USB에 남는다는 것을 알립니다.
 */
export const privacyNote = (support: UpdateSupport) =>
    ({
        on: '학생 정보는 이 컴퓨터 밖으로 나가지 않습니다. 인터넷은 새 버전 확인에만 씁니다.',
        off: '학생 정보는 이 컴퓨터 밖으로 나가지 않습니다.',
        portable: '학생 정보는 인터넷으로 보내지 않습니다. 작업은 USB의 클래스즐-자료 폴더에 저장됩니다.',
    })[support];

/** USB판 사용 가이드의 '새 버전' 구역 문장입니다. */
export const PORTABLE_UPDATE_NOTE =
    'USB판은 새 버전을 확인하지 않습니다. 새 버전은 직접 받아 실행 파일만 바꿔 주세요. 클래스즐-자료 폴더는 그대로 둡니다.';

export const isFound = (status: UpdateStatus): status is FoundUpdate => 'version' in status;

export const updateMessage = (status: FoundUpdate) =>
    ({
        // 어떤 버전 번호 뒤에도 조사가 맞도록 괄호로 씁니다.
        available: `새 버전(${status.version})이 있습니다.`,
        downloading: '새 버전을 내려받고 있습니다. 계속 쓰셔도 됩니다.',
        ready: '설치 준비가 끝났습니다. 앱을 닫으면 설치됩니다.',
        failed: '새 버전을 내려받지 못했습니다.',
    })[status.state];

/** 교사가 직접 확인을 눌렀을 때만 보여 주는 결과입니다. */
export const checkMessage = (state: Exclude<UpdateStatus, FoundUpdate>['state']) =>
    ({
        idle: '',
        checking: '확인 중…',
        latest: '최신 버전입니다.',
        error: '확인하지 못했습니다.',
    })[state];

/** 처음에는 켜져 있습니다. 끈 것만 기록합니다. */
export function readCheckOnStart(): boolean {
    try {
        return window.localStorage.getItem(SETTING_KEY) !== 'off';
    } catch {
        return true;
    }
}

export function writeCheckOnStart(isOn: boolean) {
    try {
        if (isOn) window.localStorage.removeItem(SETTING_KEY);
        else window.localStorage.setItem(SETTING_KEY, 'off');
    } catch {
        // 저장할 수 없으면 이번 실행에서만 적용됩니다.
    }
}
