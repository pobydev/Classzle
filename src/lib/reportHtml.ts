import type { BalanceColumn } from './balanceTable';
import { formatReportDate, formatReportTime, PRIVACY_NOTICE, REPORT_TITLE, type ConditionSummary, type ReportModel } from './report';

// 인쇄용 '배정 결과 보고서' HTML입니다. 이름과 그룹 이름은 교사가 넣은 값이고 엑셀에서도 들어오므로 모두 이스케이프합니다.
// 흑백으로 뽑아도 읽히게 색 대신 ✓/✗와 '!', 굵은 글자, 옅은 회색 바탕을 씁니다.
// 쪽 번호, 출력 시각, 개인정보 안내는 쪽마다 아래에 찍습니다. 메인 프로세스가 <meta name="classzle-footer">를 읽어 넣습니다.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: string | number | null | undefined): string {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export type ReportPrintMode = 'summary' | 'names';

const STATUS_TEXT: Record<ConditionSummary['status'], string> = {
    kept: '✓ 지킴',
    broken: '✗ 못 지킴',
    none: '– 없음',
};

const kept = (ok: boolean) => (ok ? '<span class="ok">✓ 지킴</span>' : '<span class="bad">✗ 못 지킴</span>');

function balanceHtml(model: ReportModel): string {
    const { balance } = model;
    // 앱의 표와 같은 순서입니다. 인원, 남, 여, 평균 → 행동 → 정서 → 리더 → 합계 → 그룹.
    const order = ['기본', '행동', '정서', '리더', '합계', '그룹 분산'] as const;
    const sectionOf = (c: BalanceColumn) =>
        c.section ?? (['minusTotal', 'plusTotal', 'guidanceTotal'].includes(c.key) ? '합계' : '기본');
    const columns = order.flatMap((section) => balance.columns.filter((c) => sectionOf(c) === section));
    const label = (c: BalanceColumn) => (c.key === 'count' ? '인원' : c.label);
    const groupHead = order
        .map((section) => {
            const count = columns.filter((c) => sectionOf(c) === section).length;
            if (count === 0) return '';
            if (section === '기본' || section === '합계') return '';
            return `<th colspan="${count}">${esc(section)}</th>`;
        });
    const basic = columns.filter((c) => sectionOf(c) === '기본');
    const totals = columns.filter((c) => sectionOf(c) === '합계');
    const cell = (value: string | number, flagged: boolean) =>
        `<td class="${flagged ? 'flag' : ''}">${flagged ? '<b>!</b>' : ''}${esc(value)}</td>`;
    const rows = balance.rows.map((row) => `
        <tr>
            <th scope="row">${esc(row.className)}</th>
            ${columns.map((c) => cell(row.cells[c.key].value, row.cells[c.key].flagged)).join('')}
            <td>${row.transferMale + row.transferFemale > 0 ? `${row.transferMale}/${row.transferFemale}` : '-'}</td>
        </tr>`).join('');
    const difference = `
        <tr class="diff">
            <th scope="row">차이</th>
            ${columns.map((c) => cell(c.key === 'average' ? balance.difference.average.value.toFixed(1) : balance.difference[c.key].value, balance.difference[c.key].flagged)).join('')}
            <td>-</td>
        </tr>`;
    return `
        <table class="balance">
            <thead>
                <tr>
                    <th rowspan="2">반</th>
                    ${basic.map((c) => `<th rowspan="2">${esc(label(c))}</th>`).join('')}
                    ${groupHead[1]}${groupHead[2]}${groupHead[3]}
                    ${totals.map((c) => `<th rowspan="2">${esc(c.label)}</th>`).join('')}
                    ${groupHead[5]}
                    <th rowspan="2">전출<br>남/여</th>
                </tr>
                <tr>
                    ${columns.filter((c) => !['기본', '합계'].includes(sectionOf(c))).map((c) => `<th>${esc(c.label)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>${difference}${rows}</tbody>
        </table>
        <p class="note">인원, 남, 여, 평균과 생활지도는 전출 뒤 기준입니다. <b>!</b>는 다른 반보다 몰린 칸입니다. 차이는 가장 많은 반과 가장 적은 반의 차이입니다.</p>`;
}

function summaryHtml(model: ReportModel): string {
    const { meta } = model;
    const work = meta.workName ? esc(meta.workName) : '저장하지 않은 작업';
    const date = meta.assignedAt ? esc(formatReportDate(meta.assignedAt)) : '기록 없음';
    const people = meta.transferCount > 0
        ? `전출 전 ${meta.totalBefore}명 · 전출 뒤 ${meta.totalAfter}명 (전출 예정 ${meta.transferCount}명)`
        : `${meta.totalAfter}명`;
    return `
        <h2>개요</h2>
        <table class="meta">
            <tbody>
                <tr><th>작업 이름</th><td>${work}</td><th>편성 날짜</th><td>${date}</td></tr>
                <tr><th>반 수</th><td>${meta.classCount}개 반</td><th>인원</th><td>${esc(people)}</td></tr>
                <tr><th>남녀 (전출 뒤)</th><td colspan="3">남 ${meta.maleAfter}명 · 여 ${meta.femaleAfter}명</td></tr>
            </tbody>
        </table>

        <h2>반별 균형</h2>
        ${balanceHtml(model)}

        <h2>조건 지킴</h2>
        <table class="conditions">
            <thead><tr><th>조건</th><th>결과</th><th>내용</th></tr></thead>
            <tbody>
                ${model.conditions.map((c) => `
                <tr>
                    <th scope="row">${esc(c.label)}</th>
                    <td class="${c.status === 'broken' ? 'bad' : c.status === 'kept' ? 'ok' : 'none'}">${STATUS_TEXT[c.status]}</td>
                    <td>${esc(c.detail)}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        <p class="note">손으로 바꾼 횟수: <b>${model.manualChangeCount}회</b></p>`;
}

function namesHtml(model: ReportModel): string {
    const unmet = model.unmet.length === 0
        ? '<p>없음</p>'
        : `<ul class="unmet">${model.unmet.map((v) => `<li>✗ ${esc(v.message)}</li>`).join('')}</ul>`;
    const who = (s: { name: string; className: string; previous: string }) =>
        `<b>${esc(s.name)}</b> ${esc(s.className)}${s.previous ? ` <span class="soft">(${esc(s.previous)})</span>` : ''}`;
    const pairs = model.pairs.length === 0
        ? '<p>없음</p>'
        : `<table>
            <thead><tr><th class="w-kind">구분</th><th>학생</th><th>학생</th><th class="w-result">결과</th></tr></thead>
            <tbody>${model.pairs.map((p) => `
                <tr><td class="nowrap">${p.kind === 'avoid' ? '분리 배정' : '함께 배정'}</td><td>${who(p.a)}</td><td>${who(p.b)}</td><td class="nowrap">${kept(p.kept)}</td></tr>`).join('')}
            </tbody>
        </table>`;
    const fixed = model.fixed.length === 0
        ? '<p>없음</p>'
        : `<table>
            <thead><tr><th>학생</th><th class="w-class">고정 반</th><th class="w-result">결과</th></tr></thead>
            <tbody>${model.fixed.map((f) => `
                <tr><td>${who(f.student)}</td><td class="nowrap">${esc(f.target)}</td><td class="nowrap">${kept(f.kept)}</td></tr>`).join('')}
            </tbody>
        </table>`;
    const groups = model.groups.length === 0
        ? '<p>없음</p>'
        : model.groups.map((g) => `
            <div class="group">
                <p><b>${esc(g.name)}</b> ${kept(g.kept)}</p>
                <p class="group-classes">${g.classes.filter((c) => c.names.length > 0).map((c) => `${esc(c.className)} ${c.names.length}명: ${c.names.map(esc).join(', ')}`).join('<br>')}</p>
            </div>`).join('');
    const transfers = model.transfers.length === 0
        ? '<p>없음</p>'
        : `<p>${model.transfers.map((t) => `${esc(t.name)} (${esc(t.className)})`).join(', ')}</p>`;
    const history = model.history.length === 0
        ? '<p>없음</p>'
        : `<table>
            <thead><tr><th class="w-time">때</th><th class="w-kind">구분</th><th>처음 반 → 바꾼 반</th></tr></thead>
            <tbody>${model.history.map((h) => `
                <tr><td class="nowrap">${esc(formatReportTime(h.timestamp))}</td><td class="nowrap">${h.source === 'auto' ? '자동' : '직접'}</td><td>${h.lines.map(esc).join('<br>')}</td></tr>`).join('')}
            </tbody>
        </table>`;
    return `
        <section class="names">
            <h1 class="names-title">이름 확인표</h1>
            <p class="notice">${esc(PRIVACY_NOTICE)}</p>
            <h2>지키지 못한 조건</h2>
            ${unmet}
            <h2>분리 배정 · 함께 배정</h2>
            ${pairs}
            <h2>고정 배정</h2>
            ${fixed}
            <h2>그룹별 반 나뉨</h2>
            ${groups}
            <h2>전출 예정</h2>
            ${transfers}
            <h2>바꾼 기록</h2>
            ${history}
        </section>`;
}

export function buildReportHtml(model: ReportModel, { mode, printedAt }: { mode: ReportPrintMode; printedAt: string }): string {
    const footer = `${mode === 'names' ? `${PRIVACY_NOTICE}  ` : ''}출력 ${printedAt}`;
    return `<!DOCTYPE html>
<html lang="ko">
    <head>
        <meta charset="utf-8">
        <meta name="classzle-footer" content="${esc(footer)}">
        <title>${REPORT_TITLE}</title>
        <style>
            @page { size: A4; }
            * { box-sizing: border-box; }
            body { font-family: Pretendard, "Malgun Gothic", sans-serif; margin: 0; color: #111; font-size: 9.5pt; line-height: 1.45; word-break: keep-all; }
            .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 4px; }
            h1 { font-size: 17pt; margin: 0; }
            .head p { margin: 0; font-size: 9pt; color: #333; }
            .sub { margin: 4px 0 0; font-size: 9pt; color: #333; }
            h2 { font-size: 11.5pt; margin: 16px 0 6px; break-after: avoid; }
            table { width: 100%; border-collapse: collapse; break-inside: auto; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; }
            th, td { border: 1px solid #555; padding: 3px 5px; vertical-align: middle; }
            th { background: #eee; font-weight: 700; }
            .meta th { width: 16%; text-align: left; }
            .balance { table-layout: fixed; font-size: 8pt; }
            .balance th, .balance td { padding: 2px 1px; text-align: center; white-space: nowrap; }
            .balance tbody th { text-align: center; }
            .balance .diff td, .balance .diff th { border-bottom: 2px solid #111; font-weight: 700; }
            .flag { background: #ddd; font-weight: 700; }
            .flag b { margin-right: 1px; }
            .conditions th[scope=row] { width: 18%; text-align: left; }
            .conditions td:nth-child(2) { width: 16%; white-space: nowrap; }
            .ok { font-weight: 700; }
            .bad { font-weight: 700; text-decoration: underline; }
            .none { color: #444; }
            .note { margin: 4px 0 0; font-size: 8.5pt; color: #333; }
            .soft { color: #444; font-size: 8.5pt; }
            .nowrap, .w-kind, .w-result, .w-class, .w-time { white-space: nowrap; }
            .w-kind { width: 13%; } .w-result { width: 13%; } .w-class { width: 13%; } .w-time { width: 22%; }
            .names { break-before: page; }
            .names-title { font-size: 15pt; border-bottom: 2px solid #111; padding-bottom: 4px; }
            .notice { margin: 6px 0 0; padding: 4px 8px; border: 1.5px solid #111; font-weight: 700; }
            .unmet { margin: 0; padding-left: 0; list-style: none; }
            .unmet li { margin: 2px 0; }
            .group { margin: 0 0 8px; break-inside: avoid; }
            .group p { margin: 0; }
            .group-classes { padding-left: 10px; font-size: 9pt; }
        </style>
    </head>
    <body>
        <div class="head">
            <h1>${REPORT_TITLE}</h1>
            <p>출력 ${esc(printedAt)}</p>
        </div>
        <p class="sub">참고자료입니다. ${mode === 'summary' ? '학생 이름은 넣지 않았습니다.' : '뒤쪽 이름 확인표에 학생 이름이 들어 있습니다.'}</p>
        ${summaryHtml(model)}
        ${mode === 'names' ? namesHtml(model) : ''}
    </body>
</html>
`;
}
