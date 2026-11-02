import { describe, expect, it } from 'vitest';
import { calculateAttendanceNumbers } from '@/lib/numbering';
import { makeStudent } from './helpers/students';

const named = (id: string, name: string, gender: 'M' | 'F', extra = {}) =>
    makeStudent({ id, name, gender, ...extra });

describe('출석 번호', () => {
    it('성별 혼합은 이름순으로 1번부터 매깁니다', () => {
        const result = calculateAttendanceNumbers(
            [named('a', '다', 'M'), named('b', '가', 'F'), named('c', '나', 'M')],
            'mixed',
        );
        expect(result).toEqual({ b: 1, c: 2, a: 3 });
    });

    it('전출 예정 학생은 맨 뒤 번호를 받습니다', () => {
        const result = calculateAttendanceNumbers(
            [named('a', '가', 'M', { is_pre_transfer: true }), named('b', '나', 'F')],
            'mixed',
        );
        expect(result).toEqual({ b: 1, a: 2 });
    });

    it('첫 성별이 18명 이하이면 둘째 성별은 21번부터 시작합니다', () => {
        const males = Array.from({ length: 18 }, (_, i) => named(`m${i}`, `남${i}`, 'M'));
        const result = calculateAttendanceNumbers([...males, named('f', '여', 'F')], 'maleFirst');
        expect(result.f).toBe(21);
    });

    it('첫 성별이 19명 이상이면 둘째 성별은 31번부터 시작합니다', () => {
        const males = Array.from({ length: 19 }, (_, i) => named(`m${i}`, `남${i}`, 'M'));
        const result = calculateAttendanceNumbers([...males, named('f', '여', 'F')], 'maleFirst');
        expect(result.f).toBe(31);
    });

    it('첫 성별이 30명을 넘어도 번호가 겹치지 않습니다', () => {
        const males = Array.from({ length: 33 }, (_, i) => named(`m${i}`, `남${i}`, 'M'));
        const result = calculateAttendanceNumbers([...males, named('f', '여', 'F')], 'maleFirst');
        expect(result.f).toBe(41);
        expect(new Set(Object.values(result)).size).toBe(34);
    });

    it('여학생 먼저를 고르면 여학생이 1번부터 시작합니다', () => {
        const result = calculateAttendanceNumbers(
            [named('m', '가', 'M'), named('f', '나', 'F')],
            'femaleFirst',
        );
        expect(result).toEqual({ f: 1, m: 21 });
    });
});
