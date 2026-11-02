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

    it('옮겼으면 인원을 말하고 어긴 조건이 있으면 함께 말합니다', () => {
        expect(assignmentNotices(3, 0).map((n) => n.kind)).toEqual(['success']);
        expect(assignmentNotices(3, 1).map((n) => n.kind)).toEqual(['success', 'warning']);
    });
});
