import { describe, expect, it } from 'vitest';
import { calculateClassStats } from '@/lib/stats';
import { makeStudent } from './helpers/students';

describe('학급 통계', () => {
    const students = [
        makeStudent({ id: 'a', assigned_class: '1반', gender: 'M', academic_score: 100, behavior_type: 'BEHAVIOR', behavior_score: -3 }),
        makeStudent({ id: 'b', assigned_class: '1반', gender: 'F', academic_score: 201, behavior_type: 'EMOTIONAL', behavior_score: -2 }),
        makeStudent({ id: 'c', assigned_class: '1반', gender: 'F', academic_score: 300, behavior_type: 'LEADER', behavior_score: 2, is_pre_transfer: true }),
        makeStudent({ id: 'd', assigned_class: '2반', gender: 'M', academic_score: 400 }),
        makeStudent({ id: 'e', assigned_class: null, gender: 'M', academic_score: 999 }),
    ];
    const groups = [{ id: 'g', name: '그룹', color: '', member_ids: ['a', 'd'] }];

    it('반 이름을 숫자로 받아 1반부터 만듭니다', () => {
        expect(calculateClassStats(students, 3).map((s) => s.className)).toEqual(['1반', '2반', '3반']);
    });

    it('인원, 남녀, 평균, 합계, 등급별 인원을 셉니다', () => {
        const [first] = calculateClassStats(students, 2, groups);
        expect(first).toMatchObject({
            studentCount: 3,
            maleCount: 1,
            femaleCount: 2,
            averageScore: 200,
            behaviorTotal: -3,
            behaviorPlus3: 1,
            emotionalPlus2: 1,
            scorePlus2: 1,
            normalCount: 0,
            preTransferCount: 1,
            preTransferFemaleCount: 1,
        });
        expect(first.groupCounts).toEqual({ g: 1 });
    });

    it('전출 뒤 기준 값을 따로 줍니다', () => {
        const [first] = calculateClassStats(students, 2, groups);
        expect(first).toMatchObject({
            stayCount: 2,
            stayMaleCount: 1,
            stayFemaleCount: 1,
            stayAverageScore: 151,
            minus3Count: 1,
            minus2Count: 1,
            minus1Count: 0,
            leaderCount: 0,
        });
    });

    it('미배정 학생은 어느 반에도 세지 않습니다', () => {
        const total = calculateClassStats(students, 2).reduce((sum, s) => sum + s.studentCount, 0);
        expect(total).toBe(4);
    });

    it('학생이 없는 반의 평균은 0입니다', () => {
        expect(calculateClassStats(students, 3)[2].averageScore).toBe(0);
    });
});
