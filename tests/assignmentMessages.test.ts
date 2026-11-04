import { describe, expect, it } from 'vitest';
import { assignmentNotices } from '@/lib/assignment/messages';

describe('배정 뒤 안내', () => {
    it('옮긴 학생이 없고 어긴 조건이 있으면 어긴 조건이 없다고 하지 않습니다', () => {
        const notices = assignmentNotices(0, 2);
        expect(notices).toHaveLength(1);
        expect(notices[0].kind).toBe('warning');
        expect(notices[0].text).toContain('옮긴 학생이 없습니다');
        expect(notices[0].text).toContain('2건');
        expect(notices[0].text).not.toContain('어긴 조건이 없어');
    });

    it('옮긴 학생도 어긴 조건도 없으면 그렇게 말합니다', () => {
        expect(assignmentNotices(0, 0)).toEqual([{ kind: 'info', text: '어긴 조건이 없어 옮긴 학생이 없습니다.' }]);
    });

    it('지키지 못한 조건은 화면에 있는 줄 이름으로 안내합니다', () => {
        const text = assignmentNotices(3, 2)[1].text;
        expect(text).toContain('지키지 못한 조건');
        expect(text).not.toContain('조건 준수 현황');
    });

    it('옮긴 인원 알림에는 되돌리기를 붙이고, 신규 배정은 배정했다고 말합니다', () => {
        expect(assignmentNotices(147, 0, 'balance')[0]).toEqual({ kind: 'success', text: '147명을 옮겼습니다.', undoable: true });
        expect(assignmentNotices(330, 0, 'new')[0].text).toBe('330명을 배정했습니다.');
        expect(assignmentNotices(0, 0)[0].undoable).toBeUndefined();
        expect(assignmentNotices(3, 2)[1].text).not.toContain('단추');
    });

    it('옮겼으면 인원을 말하고 어긴 조건이 있으면 함께 말합니다', () => {
        expect(assignmentNotices(3, 0).map((n) => n.kind)).toEqual(['success']);
        expect(assignmentNotices(3, 1).map((n) => n.kind)).toEqual(['success', 'warning']);
    });
});
