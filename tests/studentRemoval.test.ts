import { describe, expect, it } from 'vitest';
import { removalConsequences } from '@/lib/studentRemoval';
import { makeStudent } from './helpers/students';

describe('학생을 지울 때 함께 사라지는 것', () => {
    const groups = [{ id: 'g', name: '가상 그룹', color: '', member_ids: ['a'] }];

    it('없으면 빈 목록입니다', () => {
        const a = makeStudent({ id: 'b' });
        expect(removalConsequences(a, [a], groups)).toEqual([]);
    });

    it('조건과 반을 모두 알립니다', () => {
        const a = makeStudent({
            id: 'a',
            avoid_ids: ['b'],
            keep_ids: ['c'],
            group_ids: ['g'],
            fixed_class: '3반',
            is_pre_transfer: true,
            assigned_class: '3반',
        });
        const list = [a, makeStudent({ id: 'b', avoid_ids: ['a'] }), makeStudent({ id: 'c' })];
        expect(removalConsequences(a, list, groups)).toEqual([
            '분리 배정 1건',
            '함께 배정 1건',
            '그룹 소속(가상 그룹)',
            '고정 배정(3반)',
            '전출 예정 표시',
            '배정된 반(3반)',
        ]);
    });

    it('상대에게만 적힌 관계도 셉니다', () => {
        const a = makeStudent({ id: 'x' });
        const list = [a, makeStudent({ id: 'b', avoid_ids: ['x'] }), makeStudent({ id: 'c', keep_ids: ['x'] })];
        expect(removalConsequences(a, list, [])).toEqual(['분리 배정 1건', '함께 배정 1건']);
    });
});
