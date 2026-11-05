import { beforeEach, describe, expect, it } from 'vitest';
import { collectViolations } from '@/lib/assignment';
import { previousLabel } from '@/lib/report';
import { useClasszleStore } from '@/lib/store';
import { makeStudent } from './helpers/students';

// 1.3.0 출시 전 남은 것 #5, #7, #8입니다.

const store = () => useClasszleStore.getState();

describe('편성 날짜 (양식 B로 불러와 수정만 할 때)', () => {
    beforeEach(() => {
        store().resetAll();
        store().setStudents([
            makeStudent({ id: 'a', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
        ]);
    });

    it('불러온 배정에는 편성 날짜가 없습니다', () => {
        expect(store().settings.assignedAt).toBeUndefined();
    });

    it('수정, 균형 조정을 적용하면 그때를 남깁니다', () => {
        const change = { studentId: 'a', studentName: '가', oldClass: '1반', newClass: '2반', timestamp: 1 };
        store().applyAssignment(store().students, [change], false);
        expect(store().settings.assignedAt).toEqual(expect.any(Number));
    });

    it('옮긴 학생이 없어도 남깁니다', () => {
        store().noteAssignedAt();
        expect(store().settings.assignedAt).toEqual(expect.any(Number));
    });

    it('직접 옮기거나 바꿔도 남깁니다', () => {
        store().assignStudentToClass('a', '2반');
        expect(store().settings.assignedAt).toEqual(expect.any(Number));
        store().resetAll();
        store().setStudents([makeStudent({ id: 'a', assigned_class: '1반' }), makeStudent({ id: 'b', assigned_class: '2반' })]);
        store().swapStudents('a', 'b');
        expect(store().settings.assignedAt).toEqual(expect.any(Number));
    });

    it('이미 있는 편성 날짜는 수정으로 바꾸지 않고, 신규 배정만 새로 씁니다', () => {
        store().applyAssignment(store().students, [], true);
        const first = 1_000;
        useClasszleStore.setState((s) => ({ settings: { ...s.settings, assignedAt: first } }));
        store().applyAssignment(store().students, [], false);
        store().assignStudentToClass('a', '2반');
        store().noteAssignedAt();
        expect(store().settings.assignedAt).toBe(first);
        store().applyAssignment(store().students, [], true);
        expect(store().settings.assignedAt).toBeGreaterThan(first);
    });
});

describe('고칠 수 없는 어김', () => {
    it('같은 반에 고정된 분리 배정 쌍은 고칠 수 없다고 표시합니다', () => {
        const a = makeStudent({ id: 'a', assigned_class: '1반', fixed_class: '1반', avoid_ids: ['b'] });
        const b = makeStudent({ id: 'b', assigned_class: '1반', fixed_class: '1반' });
        const [v] = collectViolations([a, b], 2);
        expect(v.type).toBe('AVOID');
        expect(v.unfixable).toBe(true);
    });

    it('다른 반에 고정된 함께 배정 쌍과 학급 수를 벗어난 고정도 고칠 수 없습니다', () => {
        const a = makeStudent({ id: 'a', assigned_class: '1반', fixed_class: '1반', keep_ids: ['b'] });
        const b = makeStudent({ id: 'b', assigned_class: '2반', fixed_class: '2반' });
        const c = makeStudent({ id: 'c', assigned_class: '1반', fixed_class: '5반' });
        const found = collectViolations([a, b, c], 2);
        expect(found.find((v) => v.type === 'KEEP')?.unfixable).toBe(true);
        expect(found.find((v) => v.type === 'FIXED_CLASS')?.unfixable).toBe(true);
    });

    it('고정이 없는 어김은 고칠 수 있습니다', () => {
        const a = makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['b'] });
        const b = makeStudent({ id: 'b', assigned_class: '1반' });
        const [v] = collectViolations([a, b], 2);
        expect(v.unfixable).toBeUndefined();
    });
});

describe('전학년도 표기', () => {
    it('보고서는 전학년도 2-12처럼 씁니다', () => {
        expect(previousLabel({ prev_info: '2-12-5' })).toBe('전학년도 2-12');
    });
});
