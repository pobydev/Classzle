// 배정 실행 뒤 알림입니다. 옮긴 학생이 있으면 첫 알림에 되돌리기 버튼을 붙입니다(undoable).
export function assignmentNotices(
    moved: number,
    violationCount: number,
    mode: 'new' | 'optimize' | 'balance' = 'optimize',
): { kind: 'success' | 'info' | 'warning'; text: string; undoable?: boolean }[] {
    const unmet = `지키지 못한 조건이 ${violationCount}건 있습니다. 위쪽 '지키지 못한 조건'을 누르면 목록이 나옵니다.`;
    if (moved > 0) {
        const done = {
            kind: 'success' as const,
            text: mode === 'new' ? `${moved}명을 배정했습니다.` : `${moved}명을 옮겼습니다.`,
            undoable: true,
        };
        return violationCount > 0 ? [done, { kind: 'warning', text: unmet }] : [done];
    }
    if (violationCount > 0) return [{ kind: 'warning', text: `옮긴 학생이 없습니다. ${unmet}` }];
    return [{ kind: 'info', text: '어긴 조건이 없어 옮긴 학생이 없습니다.' }];
}
