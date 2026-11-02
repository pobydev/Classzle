import { describe, expect, it } from 'vitest';
import { buildReportHtml, esc, type ReportData } from '@/lib/reportHtml';

const BAD = '<img src=x onerror="alert(1)">';
const change = {
    studentId: 'a',
    studentName: BAD,
    oldClass: '1반',
    newClass: '2반',
    timestamp: 1,
    type: 'swap' as const,
    source: 'manual' as const,
    partnerName: BAD,
    partnerId: 'b',
};

const data: ReportData = {
    history: [change, { ...change, type: 'move', timestamp: 2 }],
    groupStats: [{ name: BAD, students: [{ name: BAD, class: '1반' }] }],
    relationStats: {
        keepMet: 0,
        keepTotal: 1,
        avoidMet: 1,
        avoidTotal: 1,
        classDetails: { [BAD]: [{ type: 'avoid', names: [BAD, BAD], status: '만족', classes: [BAD, '2반'] }] },
    },
    movementStats: [{ name: BAD, initialClass: BAD, finalClass: BAD }],
    specialStats: {
        fixed: [{ name: BAD, class: BAD, target: BAD, isMet: true }, { name: BAD, class: BAD, target: BAD, isMet: false }],
        preTransfer: [{ name: BAD, class: BAD }],
    },
    printedAt: BAD,
};

describe('리포트 HTML', () => {
    it('다섯 글자를 모두 바꿉니다', () => {
        expect(esc(`<a href="x" id='y'>&`)).toBe('&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;');
        expect(esc(null)).toBe('');
    });

    it('어느 칸에 있어도 태그로 들어가지 않습니다', () => {
        const html = buildReportHtml(data);
        expect(html).not.toContain('<img');
        expect(html).not.toContain('onerror="');
        expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });

    it('예전 문서의 모양은 그대로입니다', () => {
        const html = buildReportHtml({
            ...data,
            history: [],
            groupStats: [{ name: '축구부', students: [{ name: '가상가', class: '1반' }] }],
            printedAt: '오늘',
        });
        expect(html).toContain('그룹명: 축구부');
        expect(html).toContain('가상가 (1반)');
        expect(html).toContain('출력 일시: 오늘');
        expect(html).toContain('배정 변경 이력이 없습니다.');
    });
});
