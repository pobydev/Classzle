import { Student, NumberingMethod } from '@/types';

/**
 * 학생 리스트와 번호 부여 방식에 따라 각 학생의 출석 번호를 계산합니다.
 */
export function calculateAttendanceNumbers(
    students: Student[],
    method: NumberingMethod
): Record<string, number> {
    const numberingMap: Record<string, number> = {};

    if (method === 'mixed') {
        const sorted = [...students].sort((a, b) => {
            // 전출 예정 학생은 가장 마지막 번호 부여
            const preA = a.is_pre_transfer ? 1 : 0;
            const preB = b.is_pre_transfer ? 1 : 0;
            if (preA !== preB) return preA - preB;

            return a.name.localeCompare(b.name, 'ko');
        });

        sorted.forEach((s, index) => {
            numberingMap[s.id] = index + 1;
        });
    } else {
        const males = students.filter(s => s.gender === 'M');
        const females = students.filter(s => s.gender === 'F');

        const firstGroup = method === 'maleFirst' ? males : females;
        const secondGroup = method === 'maleFirst' ? females : males;

        // 첫 번째 그룹 정렬 및 번호 부여
        const sortedFirst = [...firstGroup].sort((a, b) => {
            const preA = a.is_pre_transfer ? 1 : 0;
            const preB = b.is_pre_transfer ? 1 : 0;
            if (preA !== preB) return preA - preB;
            return a.name.localeCompare(b.name, 'ko');
        });

        sortedFirst.forEach((s, index) => {
            numberingMap[s.id] = index + 1;
        });

        // 두 번째 그룹 시작 번호 결정
        // 첫 번째 그룹 인원이 18명을 초과하면 31번부터, 아니면 21번부터 시작
        const startNumber = firstGroup.length > 18 ? 31 : 21;

        // 두 번째 그룹 정렬 및 번호 부여
        const sortedSecond = [...secondGroup].sort((a, b) => {
            const preA = a.is_pre_transfer ? 1 : 0;
            const preB = b.is_pre_transfer ? 1 : 0;
            if (preA !== preB) return preA - preB;
            return a.name.localeCompare(b.name, 'ko');
        });

        sortedSecond.forEach((s, index) => {
            numberingMap[s.id] = startNumber + index;
        });
    }

    return numberingMap;
}
