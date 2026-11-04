import { sameClass } from './assignment/problem';

// 학급 수를 줄일 때 없어지는 반과 그 반에 배정된 학생 수입니다. 예: { label: '11·12반', count: 55 }.
export function classesLostByShrinking(students: { assigned_class?: string | null }[], from: number, to: number) {
    if (to >= from) return { label: '', count: 0 };
    const lostNames = Array.from({ length: from - to }, (_, i) => `${to + i + 1}반`);
    const count = students.filter((s) => lostNames.some((name) => sameClass(s.assigned_class, name))).length;
    const label = lostNames.length <= 3
        ? `${lostNames.map((name) => name.replace('반', '')).join('·')}반`
        : `${to + 1}~${from}반`;
    return { label, count };
}
