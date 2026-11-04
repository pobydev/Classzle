// 배정을 마친 뒤 보여 줄 안내입니다. 옮긴 학생과 어긴 조건의 수에 따라 뜻이 달라집니다.
export function assignmentNotices(moved: number, violationCount: number): { kind: 'success' | 'info' | 'warning'; text: string }[] {
    const unmet = `지키지 못한 조건이 ${violationCount}건 있습니다. 배정 실행 단추 아래의 '지키지 못한 조건' 줄을 누르면 목록이 나옵니다.`;
    if (moved > 0) {
        const done = { kind: 'success' as const, text: `${moved}명의 학생 배정이 변경되었습니다.` };
        return violationCount > 0 ? [done, { kind: 'warning', text: unmet }] : [done];
    }
    if (violationCount > 0) return [{ kind: 'warning', text: `옮긴 학생이 없습니다. ${unmet}` }];
    return [{ kind: 'info', text: '어긴 조건이 없어 옮긴 학생이 없습니다.' }];
}
