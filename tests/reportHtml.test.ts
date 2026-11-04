import { describe, expect, it } from 'vitest';
import { buildReport, previousLabel, PRIVACY_NOTICE } from '@/lib/report';
import { buildReportHtml, esc } from '@/lib/reportHtml';
import type { AssignmentChange } from '@/types';
import { makeStudent } from './helpers/students';

const BAD = '<img src=x onerror="alert(1)">';

// 2반, 4명. a-b는 분리 배정이면서 함께 배정입니다(예전 파일). 같은 반이라 분리 배정은 못 지켰습니다.
const students = [
    makeStudent({ id: 'a', name: BAD, prev_info: '2-12-1', gender: 'M', assigned_class: '1반', avoid_ids: ['b', 'c'], keep_ids: ['b'], fixed_class: '1반' }),
    makeStudent({ id: 'b', name: '가상나', prev_info: '2-3-4', gender: 'F', assigned_class: '1반', avoid_ids: ['a'], keep_ids: ['a'] }),
    makeStudent({ id: 'c', name: '가상다', gender: 'M', assigned_class: '2반', avoid_ids: ['a'], fixed_class: '1반' }),
    makeStudent({ id: 'd', name: '가상라', gender: 'F', assigned_class: '2반', is_pre_transfer: true }),
];
const groups = [{ id: 'g', name: BAD, color: '', member_ids: ['a', 'c'] }];
const history: AssignmentChange[] = [
    { studentId: 'a', studentName: BAD, oldClass: '2반', newClass: '1반', timestamp: new Date(2026, 11, 10, 10, 0).getTime(), type: 'swap', source: 'manual', partnerId: 'c', partnerName: '가상다' },
    { studentId: 'b', studentName: '가상나', oldClass: '2반', newClass: '1반', timestamp: new Date(2026, 11, 10, 11, 0).getTime(), source: 'auto', batchId: 'x' },
    { studentId: 'd', studentName: '가상라', oldClass: '1반', newClass: '2반', timestamp: new Date(2026, 11, 10, 11, 0).getTime(), source: 'auto', batchId: 'x' },
];
const model = buildReport({ students, groups, classCount: 2, history, workName: '가상 작업', assignedAt: new Date(2026, 11, 10).getTime() });

describe('배정 결과 보고서 내용', () => {
    it('분리 배정과 함께 배정을 조건마다 따로 셉니다', () => {
        const avoid = model.conditions.find((c) => c.key === 'avoid')!;
        const keep = model.conditions.find((c) => c.key === 'keep')!;
        // 분리 배정 a-b(같은 반, 못 지킴), a-c(다른 반, 지킴). 함께 배정 a-b(같은 반, 지킴).
        expect(avoid.detail).toBe('1 / 2쌍 지킴');
        expect(avoid.status).toBe('broken');
        expect(keep.detail).toBe('1 / 1쌍 지킴');
        expect(model.pairs.filter((p) => p.kind === 'avoid')).toHaveLength(2);
        // 못 지킨 쌍이 맨 위입니다. 한 쌍은 한 줄입니다.
        expect(model.pairs[0]).toMatchObject({ kind: 'avoid', kept: false });
    });

    it('일곱 가지 조건을 모두 적고, 없는 조건은 없음입니다', () => {
        expect(model.conditions.map((c) => c.label)).toEqual(['고정 배정', '분리 배정', '함께 배정', '그룹 분산', '인원', '남녀', '전출 예정']);
        expect(model.conditions.find((c) => c.key === 'fixed')!.detail).toBe('1 / 2명 지킴');
        const empty = buildReport({ students: [makeStudent({ id: 'x', assigned_class: '1반' })], groups: [], classCount: 2, history: [] });
        expect(empty.conditions.filter((c) => c.status === 'none').map((c) => c.key)).toEqual(['fixed', 'avoid', 'keep', 'group', 'transfer']);
    });

    it('인원은 전출 전과 뒤, 손으로 바꾼 횟수를 셉니다', () => {
        expect(model.meta).toMatchObject({ totalBefore: 4, totalAfter: 3, transferCount: 1, classCount: 2, workName: '가상 작업' });
        expect(model.manualChangeCount).toBe(1);
    });

    it('자동 수정 한 번은 한 줄이고, 직접 바꾼 교환은 두 학생을 적습니다', () => {
        expect(model.history).toHaveLength(2);
        expect(model.history[1]).toMatchObject({ source: 'auto', lines: ['자동 배정 1회 · 2명 옮김'] });
        expect(model.history[0].lines).toEqual([`${BAD} 2반 → 1반`, '가상다 1반 → 2반']);
    });

    it('전 학년 반은 전 학년 2-12처럼 씁니다', () => {
        expect(previousLabel({ prev_info: '2-12-5' })).toBe('전 학년 2-12');
        expect(previousLabel({ prev_info: '2-1-undefined' })).toBe('전 학년 2-1');
        expect(previousLabel({ prev_info: '' })).toBe('');
    });
});

describe('보고서 HTML', () => {
    it('다섯 글자를 모두 바꿉니다', () => {
        expect(esc(`<a href="x" id='y'>&`)).toBe('&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;');
        expect(esc(null)).toBe('');
    });

    it('어느 칸에 있어도 태그로 들어가지 않습니다', () => {
        const html = buildReportHtml(model, { mode: 'names', printedAt: BAD });
        expect(html).not.toContain('<img');
        expect(html).not.toContain('onerror="');
        expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });

    it('요약만은 학생 이름이 없고, 이름 확인표에는 쪽마다 개인정보 안내를 찍습니다', () => {
        const summary = buildReportHtml(model, { mode: 'summary', printedAt: '12월 10일 오전 10:00' });
        expect(summary).toContain('배정 결과 보고서');
        expect(summary).not.toContain('가상나');
        expect(summary).not.toContain('이름 확인표</h1>');
        expect(summary).toContain('<meta name="classzle-footer" content="출력 12월 10일 오전 10:00">');
        const names = buildReportHtml(model, { mode: 'names', printedAt: '12월 10일 오전 10:00' });
        expect(names).toContain('가상나');
        expect(names).toContain(`content="${PRIVACY_NOTICE}`);
        expect(names).toContain('✗ 못 지킴');
        expect(names).toContain('전 학년 2-3');
        // 예전 문서의 맨 아래 문구와 결재란은 없습니다.
        expect(names).not.toContain('학급 편성 도우미');
        expect(names).not.toContain('결재');
    });
});
