import { Student, CustomGroup, ClassStats, Violation } from '@/types';

const MAX_ITERATIONS = 200;
const BALANCE_TOLERANCE = 1; // 허용 편차 (1명 이내)

/**
 * 반편성 메인 함수
 * 모든 균형 조건을 만족할 때까지 반복 최적화
 */
export function assignStudents(
    students: Student[],
    classCount: number,
    groups: CustomGroup[],
    scoreTolerance: number = 25,
    mode: 'new' | 'optimize' = 'new'
): { students: Student[]; violations: Violation[] } {
    // 원본 보존을 위해 깊은 복사
    let assignedStudents: Student[] = students.map(s => ({ ...s }));

    // 반 이름 목록
    const classNames: string[] = [];
    for (let i = 1; i <= classCount; i++) {
        classNames.push(`${i}반`);
    }

    // 0. 모드 및 기배정 데이터 처리
    const isNewMode = mode === 'new';

    // 신규 배정 모드일 경우 기존 배정(assigned_class)을 초기화 (고정반 제외)
    if (isNewMode) {
        assignedStudents.forEach(s => {
            s.assigned_class = s.fixed_class || null;
        });
    }

    // 통계 및 자동 감지를 위한 기배정 카운트
    const assignedCount = assignedStudents.filter(s => s.assigned_class).length;
    const hasEnoughPreAssigned = assignedCount > (students.length * 0.1);

    // 실제 기배정 모드 여부 결정
    const isPreAssignedMode = !isNewMode && hasEnoughPreAssigned;

    // [Randomization] 재배정 시 결과가 달라지도록 학생 처리 순서를 셔플
    shuffleArray(assignedStudents);

    // 1단계: 초기 배정
    if (!isPreAssignedMode) {
        // 신규 배정 (S자)
        assignedStudents = balancedInitialAssignment(assignedStudents, classNames, groups);
    } else {
        // 기존 배정 유지 + 미배정 학생 채우기
        // 유효하지 않은 반 이름 체크
        assignedStudents.forEach(s => {
            if (s.assigned_class && !classNames.includes(s.assigned_class)) {
                s.assigned_class = null;
            }
        });

        const unassigned = assignedStudents.filter(s => !s.assigned_class);
        if (unassigned.length > 0) {
            fillUnassignedStudents(assignedStudents, classNames);
        }
    }

    // 2단계: 균형 최적화 루프
    assignedStudents = optimizeBalance(assignedStudents, classNames, groups, scoreTolerance, isPreAssignedMode);

    // 3단계: 위반 사항 수집
    const violations: Violation[] = [];
    collectViolations(assignedStudents, groups, violations);

    return { students: assignedStudents, violations };
}

/**
 * 1단계: 균형 잡힌 초기 배정
 * 학생 유형별로 분류 후 라운드로빈 방식으로 균등 배정
 */
function balancedInitialAssignment(students: Student[], classNames: string[], groups: CustomGroup[]): Student[] {
    // 고정반 학생 먼저 배정
    const fixedStudents = students.filter(s => s.fixed_class);
    fixedStudents.forEach(s => { s.assigned_class = s.fixed_class; });

    // 2. 분산 배정 그룹(Custom Group) 처리
    // 각 그룹별로 멤버들을 확인하여, 고르게 분산 배정
    groups.forEach(group => {
        // 그룹 멤버 중 아직 반이 배정되지 않은 학생들
        const members = students.filter(s =>
            group.member_ids.includes(s.id) && !s.fixed_class && !s.assigned_class
        );

        if (members.length === 0) return;

        // 성적순 정렬 (비슷한 성적끼리 뭉치지 않게)
        members.sort((a, b) => b.academic_score - a.academic_score);
        shuffleSimilarScores(members);

        // 각 반별 현재 해당 그룹 멤버 수 집계
        // (이미 고정 배정 등으로 들어가 있는 멤버 포함)
        const currentGroupCounts: Record<string, number> = {};
        classNames.forEach(cn => {
            currentGroupCounts[cn] = students.filter(s =>
                s.assigned_class === cn && group.member_ids.includes(s.id)
            ).length;
        });

        // 덜 배정된 반부터 채워넣기
        members.forEach(member => {
            // 현재 그룹 멤버가 가장 적은 반 찾기
            const sortedClasses = [...classNames].sort((a, b) => {
                const diff = currentGroupCounts[a] - currentGroupCounts[b];
                if (diff !== 0) return diff;
                return Math.random() - 0.5; // 인원 같으면 랜덤
            });

            // 가장 적은 반에 배정
            const targetClass = sortedClasses[0];
            member.assigned_class = targetClass;
            currentGroupCounts[targetClass]++;
        });
    });

    // 3. 전출 예정 학생 균형 배정 (그룹처럼 1명씩 분산)
    // 전출 예정 학생도 특정 반에 몰리지 않게 미리 배정
    const preTransferStudents = students.filter(s =>
        s.is_pre_transfer && !s.fixed_class && !s.assigned_class
    );

    if (preTransferStudents.length > 0) {
        // 성적순 정렬
        preTransferStudents.sort((a, b) => b.academic_score - a.academic_score);
        shuffleSimilarScores(preTransferStudents);

        // 현재 반별 전출 예정 학생 수 (이미 고정 배정된 전출 학생 포함)
        const currentPreTransferCounts: Record<string, number> = {};
        classNames.forEach(cn => {
            currentPreTransferCounts[cn] = students.filter(s =>
                s.assigned_class === cn && s.is_pre_transfer
            ).length;
        });

        // 덜 배정된 반부터 채워넣기
        preTransferStudents.forEach(student => {
            const sortedClasses = [...classNames].sort((a, b) => {
                const diff = currentPreTransferCounts[a] - currentPreTransferCounts[b];
                if (diff !== 0) return diff;
                return Math.random() - 0.5; // 인원 같으면 랜덤
            });

            const targetClass = sortedClasses[0];
            student.assigned_class = targetClass;
            currentPreTransferCounts[targetClass]++;
        });
    }

    // 나머지 학생들 분류 (아직 배정되지 않은 학생들만)
    const normalStudents = students.filter(s => !s.assigned_class);

    // 유형+점수별 세분화 그룹 (더 균등한 분산을 위해)
    const typeScoreGroups = {
        // 행동형 점수별
        behavior3: normalStudents.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -3),
        behavior2: normalStudents.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -2),
        behavior1: normalStudents.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -1),
        // 정서형 점수별
        emotional3: normalStudents.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -3),
        emotional2: normalStudents.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -2),
        emotional1: normalStudents.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -1),
        // 리더형 점수별
        leader2: normalStudents.filter(s => s.behavior_type === 'LEADER' && s.behavior_score >= 2),
        leader1: normalStudents.filter(s => s.behavior_type === 'LEADER' && s.behavior_score === 1),
        // 일반
        normalMale: normalStudents.filter(s => s.behavior_type === 'NONE' && s.gender === 'M'),
        normalFemale: normalStudents.filter(s => s.behavior_type === 'NONE' && s.gender === 'F'),
    };

    // 각 그룹 내 성적순 정렬 (약간의 랜덤 포함)
    Object.values(typeScoreGroups).forEach(group => {
        group.sort((a, b) => b.academic_score - a.academic_score);
        shuffleSimilarScores(group);
    });

    // 특정 유형+점수 그룹을 균등 분산하는 함수
    const distributeEvenly = (studentList: Student[]) => {
        // 현재 해당 그룹의 반별 배정 수 추적
        const currentCounts: Record<string, number> = {};
        classNames.forEach(cn => currentCounts[cn] = 0);

        studentList.forEach(student => {
            // 가장 적게 배정된 반 선택 (랜덤 tie-break)
            const sortedClasses = [...classNames].sort((a, b) => {
                const diff = currentCounts[a] - currentCounts[b];
                if (diff !== 0) return diff;
                return Math.random() - 0.5;
            });
            student.assigned_class = sortedClasses[0];
            currentCounts[sortedClasses[0]]++;
        });
    };

    // 라운드로빈 배정 함수 (전체 인원 기준)
    const fillAssign = (studentList: Student[]) => {
        studentList.forEach(student => {
            const counts: Record<string, number> = {};
            classNames.forEach(cn => {
                counts[cn] = students.filter(s => s.assigned_class === cn).length;
            });

            const sortedClasses = [...classNames].sort((a, b) => {
                if (counts[a] !== counts[b]) return counts[a] - counts[b];
                return Math.random() - 0.5;
            });

            student.assigned_class = sortedClasses[0];
        });
    };

    // 1단계: 영향력 큰 학생들 먼저 균등 분산 (유형+점수별)
    distributeEvenly(typeScoreGroups.behavior3);
    distributeEvenly(typeScoreGroups.behavior2);
    distributeEvenly(typeScoreGroups.behavior1);
    distributeEvenly(typeScoreGroups.emotional3);
    distributeEvenly(typeScoreGroups.emotional2);
    distributeEvenly(typeScoreGroups.emotional1);
    distributeEvenly(typeScoreGroups.leader2);
    distributeEvenly(typeScoreGroups.leader1);

    // 2단계: 일반 학생들 전체 인원 기준 배정
    fillAssign(typeScoreGroups.normalMale);
    fillAssign(typeScoreGroups.normalFemale);

    return students;
}

/**
 * 성적 유사 학생들 간에 순서를 약간 셔플
 */
function shuffleSimilarScores(students: Student[]): void {
    if (students.length <= 1) return;

    const tolerance = 30;

    for (let i = 0; i < students.length - 1; i++) {
        if (Math.abs(students[i].academic_score - students[i + 1].academic_score) <= tolerance &&
            Math.random() > 0.5) {
            [students[i], students[i + 1]] = [students[i + 1], students[i]];
        }
    }
}

/**
 * 일반적인 균형 맞추기(성별, 성적 등)를 위해 두 학생을 교환해도 되는지 확인
 * 특별한 제약조건(고정, 분산 그룹, 전출, 상극/친한 관계)이 있는 경우,
 * 그 제약조건을 깨뜨리지 않는 선에서만 교환을 허용함
 */
function canSwapForGeneralBalance(
    studentA: Student,
    studentB: Student | undefined,
    targetClass: string // studentA가 이동하려는 반 (studentB가 있는 반)
): boolean {
    // 1. 고정 배정 학생은 절대 이동 불가
    if (studentA.fixed_class) return false;
    if (studentB && studentB.fixed_class) return false;

    // 2. 전출 예정 학생 로직
    // 전출 예정 학생은 '전출 예정 학생 균형' 함수에서만 이동시켜야 함
    // (또는 전출 예정 학생끼리 교환은 허용 가능하지만, 복잡도 줄이기 위해 일반 로직에선 제외 권장)
    // 여기서는 "전출 예정 학생끼리만 교환 허용"으로 완화
    if (studentA.is_pre_transfer) {
        if (!studentB || !studentB.is_pre_transfer) return false;
    }
    if (studentB && studentB.is_pre_transfer) {
        if (!studentA.is_pre_transfer) return false;
    }

    // 3. 분산 배정 그룹(Custom Group)
    // 그룹 멤버는 "같은 그룹 멤버끼리"만 교환 가능 (그래야 반별 그룹 인원이 유지됨)
    // A가 그룹 멤버인데 B가 아니거나 다른 그룹이면 불가
    const aGroups = studentA.group_ids || [];
    const bGroups = studentB ? (studentB.group_ids || []) : [];

    if (aGroups.length > 0) {
        if (!studentB) return false; // 빈 자리로 가면 해당 반 그룹 인원 증가 -> 불가
        // A의 모든 그룹에 대해 B도 속해있어야 함 (엄격한 기준)
        // 또는 "Distribution Count"를 유지할 수 있는지 확인해야 함
        // 가장 안전한 방법: 그룹 구성이 완전히 동일해야 함
        if (aGroups.length !== bGroups.length) return false;
        const bGroupSet = new Set(bGroups);
        if (!aGroups.every(g => bGroupSet.has(g))) return false;
    }
    // B가 그룹 멤버인데 A는 아닌 경우도 불가
    if (bGroups.length > 0) {
        if (aGroups.length === 0) return false;
        // 위에서 A기준 체크했으므로 여기선 패스 (구성이 다르면 위에서 걸러짐)
    }

    // 4. 피해야 할 관계 (Avoid)
    // A가 targetClass로 갔을 때 상극 학생이 있으면 불가
    if (studentA.avoid_ids && studentA.avoid_ids.length > 0) {
        // targetClass가 이미 배정된 학생들 확인이 불가능한 스코프...
        // 이 함수 호출 시점에서 검증 필요.
        // 하지만 여기서는 간략히 체크하기 어려움.
        // 따라서 "관계 설정이 있는 학생은 일반 로직에서 이동 제외"하는 것이 안전
        return false;
    }
    // B가 A의 반으로 올 때 상극 학생이 있으면 불가
    if (studentB && studentB.avoid_ids && studentB.avoid_ids.length > 0) {
        return false;
    }

    // 5. 같은 반 희망 (Keep)
    // Keep 관계가 있으면 함께 이동해야 하므로, 단일 교환 로직에선 제외
    if (studentA.keep_ids && studentA.keep_ids.length > 0) return false;
    if (studentB && studentB.keep_ids && studentB.keep_ids.length > 0) return false;

    return true;
}

/**
 * 2단계: 균형 최적화 루프
 * 모든 균형 조건을 만족할 때까지 반복
 */
function optimizeBalance(
    students: Student[],
    classNames: string[],
    groups: CustomGroup[],
    scoreTolerance: number,
    isPreAssignedMode: boolean = false
): Student[] {
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
        iteration++;
        let improved = false;

        // 균형 상태 계산
        const stats = getBalanceStats(students, classNames);

        // 1. 전체 학생 수 균형 (최우선)
        if (stats.studentCountImbalance > BALANCE_TOLERANCE) {
            if (balanceStudentCount(students, classNames, scoreTolerance)) improved = true;
        }

        // 2. 성별 균형 (기배정 모드에서도 체크 - S자 배정이라도 불균형할 수 있음)
        if (stats.genderImbalance > BALANCE_TOLERANCE) {
            if (balanceGender(students, classNames, scoreTolerance)) improved = true;
        }

        // 3. 리더형 학생 수 균형 (필수 체크)
        if (stats.leaderImbalance > BALANCE_TOLERANCE) {
            if (balanceType(students, classNames, 'LEADER', scoreTolerance)) improved = true;
        }

        // 4. 행동형 학생 수 균형 (필수 체크)
        if (stats.behaviorImbalance > BALANCE_TOLERANCE) {
            if (balanceType(students, classNames, 'BEHAVIOR', scoreTolerance)) improved = true;
        }

        // 5. 정서형 학생 수 균형 (필수 체크)
        if (stats.emotionalImbalance > BALANCE_TOLERANCE) {
            if (balanceType(students, classNames, 'EMOTIONAL', scoreTolerance)) improved = true;
        }

        // 6. 행동형+정서형 합계 균형 (필수 체크)
        if (stats.totalBehaviorEmotionalImbalance > BALANCE_TOLERANCE) {
            if (balanceBehaviorEmotionalTotal(students, classNames, scoreTolerance)) improved = true;
        }

        // 기배정 모드일 경우, 과도한 재배치를 막기 위해 "세부 점수" 관련 로직만 건너뜀
        if (!isPreAssignedMode) {
            // 7. 점수별 학생 수 균형 (-3, -2, -1, +1, +2)
            if (stats.scoreMinus3Imbalance > BALANCE_TOLERANCE) {
                if (balanceByScore(students, classNames, -3, scoreTolerance)) improved = true;
            }
            if (stats.scoreMinus2Imbalance > BALANCE_TOLERANCE) {
                if (balanceByScore(students, classNames, -2, scoreTolerance)) improved = true;
            }
            if (stats.scoreMinus1Imbalance > BALANCE_TOLERANCE) {
                if (balanceByScore(students, classNames, -1, scoreTolerance)) improved = true;
            }
            if (stats.scorePlus1Imbalance > BALANCE_TOLERANCE) {
                if (balanceByScore(students, classNames, 1, scoreTolerance)) improved = true;
            }
            if (stats.scorePlus2Imbalance > BALANCE_TOLERANCE) {
                if (balanceByScore(students, classNames, 2, scoreTolerance)) improved = true;
            }

            // 8. 생활지도 총점 균형 (더 엄격하게)
            if (stats.behaviorTotalImbalance > 2) {
                if (balanceBehaviorTotal(students, classNames, scoreTolerance)) improved = true;
            }

            // 8-1. 리더형 점수 합계 균형
            if (stats.leaderScoreTotalImbalance > 2) {
                if (balanceTypeScoreTotal(students, classNames, 'LEADER', scoreTolerance)) improved = true;
            }
            // 8-2. 행동형 점수 합계 균형
            if (stats.behaviorOnlyScoreTotalImbalance > 2) {
                if (balanceTypeScoreTotal(students, classNames, 'BEHAVIOR', scoreTolerance)) improved = true;
            }
            // 8-3. 정서형 점수 합계 균형
            if (stats.emotionalOnlyScoreTotalImbalance > 2) {
                if (balanceTypeScoreTotal(students, classNames, 'EMOTIONAL', scoreTolerance)) improved = true;
            }

            // 8-4. 유형+점수별 세분화 균형
            if (balanceByTypeAndScore(students, classNames, 'BEHAVIOR', -3, scoreTolerance)) improved = true;
            if (balanceByTypeAndScore(students, classNames, 'BEHAVIOR', -2, scoreTolerance)) improved = true;
            if (balanceByTypeAndScore(students, classNames, 'BEHAVIOR', -1, scoreTolerance)) improved = true;
            if (balanceByTypeAndScore(students, classNames, 'EMOTIONAL', -3, scoreTolerance)) improved = true;
            if (balanceByTypeAndScore(students, classNames, 'EMOTIONAL', -2, scoreTolerance)) improved = true;
            if (balanceByTypeAndScore(students, classNames, 'EMOTIONAL', -1, scoreTolerance)) improved = true;
            if (balanceByTypeAndScore(students, classNames, 'LEADER', 2, scoreTolerance)) improved = true;
            if (balanceByTypeAndScore(students, classNames, 'LEADER', 1, scoreTolerance)) improved = true;

            // 9. 성적 평균 균형
            if (stats.scoreImbalance > 30) {
                if (balanceScore(students, classNames)) improved = true;
            }
        }

        // 10. 상극 관계 해결 (중요)
        if (fixAvoidViolations(students, classNames, scoreTolerance)) improved = true;

        // 10-2. 같은 반 희망 해결 (중요)
        if (fixKeepViolations(students, classNames, scoreTolerance)) improved = true;

        // 11. 커스텀 그룹 초과 해결 (중요)
        if (balanceCustomGroups(students, groups, classNames, scoreTolerance)) improved = true;

        // 모든 조건 만족하면 종료
        if (!improved || isBalanced(stats)) break;
    }

    return students;
}

/**
 * 전출 예정 학생 균형 배정
 * 전출 예정인 학생을 학생 수가 가장 많은 반(또는 많은 반 중 하나)으로 이동시켜
 * 전출 후의 학급 인원 균형을 맞춤
 */
/**
 * 전출 예정 학생 균형 배정
 * 전출 예정인 학생을 학생 수가 가장 많은 반(또는 많은 반 중 하나)으로 이동시켜
 * 전출 후의 학급 인원 균형을 맞춤
 */
function balancePreTransfer(
    students: Student[],
    classNames: string[],
    scoreTolerance: number
): boolean {
    const classCounts: Record<string, number> = {};
    classNames.forEach(cn => {
        classCounts[cn] = students.filter(s => s.assigned_class === cn).length;
    });

    const sortedCounts = Object.entries(classCounts).sort(([, a], [, b]) => b - a);
    const maxCount = sortedCounts[0][1];
    const minCount = sortedCounts[sortedCounts.length - 1][1];

    if (maxCount === minCount) return false;

    const maxClasses = sortedCounts.filter(([, count]) => count === maxCount).map(([cn]) => cn);
    const nonMaxClasses = sortedCounts.filter(([, count]) => count < maxCount).map(([cn]) => cn);

    if (nonMaxClasses.length === 0) return false;

    const studentToMove = students.find(s =>
        s.assigned_class &&
        nonMaxClasses.includes(s.assigned_class) &&
        s.is_pre_transfer &&
        !s.fixed_class
    );

    if (!studentToMove) return false;

    for (const targetClass of maxClasses) {
        // 교환 대상 찾기: 조건 강화
        // 1. 일반 학생(전출x, 고정x)
        // 2. 중요: 그룹 멤버가 아닌 학생 우선 (그룹 밸런스 파괴 방지)
        const candidates = students.filter(s =>
            s.assigned_class === targetClass &&
            !s.is_pre_transfer &&
            !s.fixed_class &&
            s.gender === studentToMove.gender &&
            (s.behavior_type === studentToMove.behavior_type || s.behavior_type === 'NONE') &&
            Math.abs(s.academic_score - studentToMove.academic_score) <= scoreTolerance * 2
        );

        // 우선순위 1: 교환해도 그룹 밸런스에 영향 없는 학생 (그룹 멤버가 아니거나, 같은 그룹이거나 - 근데 전출학생은 보통 일반)
        // 전출학생이 그룹 멤버일 확률은 낮지만, 만약 그룹 멤버라면 같은 그룹 멤버와 바꿔야 함.
        const isMoverGroup = (studentToMove.group_ids || []).length > 0;

        let swapCandidate = candidates.find(s => {
            const isCandidateGroup = (s.group_ids || []).length > 0;
            if (isMoverGroup) {
                // 이동자가 그룹 멤버면, 후보자도 같은 그룹이어야 안전
                return canSwapForGeneralBalance(studentToMove, s, targetClass);
            } else {
                // 이동자가 일반이면, 후보자도 그룹 멤버가 아니어야 안전
                return !isCandidateGroup;
            }
        });

        // 차선책: 적절한 후보가 없으면 그룹 밸런스 무시하고라도 찾음 (하지만 위험함)
        // 일단은 안전한 스왑만 허용

        if (swapCandidate) {
            const tempClass = studentToMove.assigned_class;
            studentToMove.assigned_class = swapCandidate.assigned_class;
            swapCandidate.assigned_class = tempClass;
            return true;
        }
    }

    return false;
}


/**
 * 상극 관계 해결
 */
function fixAvoidViolations(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    let fixed = false;

    for (const student of students) {
        if (!student.assigned_class) continue;

        for (const avoidId of student.avoid_ids) {
            const avoidStudent = students.find(s => s.id === avoidId);
            if (avoidStudent && avoidStudent.assigned_class === student.assigned_class) {
                // 다른 반에서 같은 성별, 성적 유사한 학생과 교환
                // 우선순위: canSwapForGeneralBalance를 만족하는(그룹 밸런스 안 깨는) 후보 우선
                const otherClass = classNames.find(cn => cn !== student.assigned_class);
                if (otherClass) {
                    const candidates = students.filter(s =>
                        s.assigned_class === otherClass &&
                        s.gender === student.gender &&
                        s.behavior_type === student.behavior_type &&
                        !s.fixed_class &&
                        Math.abs(s.academic_score - student.academic_score) <= scoreTolerance
                    );

                    // 1. 안전한 교환 시도
                    let swapCandidate = candidates.find(s => canSwapForGeneralBalance(student, s, otherClass));

                    // 2. 없으면 불완전 교환이라도 시도 (Avoid 해결이 더 급함)
                    // 단, Fix 단계 이후 balanceCustomGroups가 복구해주길 기대
                    if (!swapCandidate) {
                        swapCandidate = candidates[0];
                    }

                    if (swapCandidate && !student.fixed_class) {
                        const tempClass = student.assigned_class;
                        student.assigned_class = swapCandidate.assigned_class;
                        swapCandidate.assigned_class = tempClass;
                        fixed = true;
                        // 한 명 해결했으면 break (상태 변화 발생했으므로 루프 재진입 권장)
                        // 여기선 루프 계속 돌지만 플래그 true
                    }
                }
            }
        }
    }

    return fixed;
}

/**
 * 커스텀 그룹 균형 배정 (최대 인원 제한보다 균등 분배 우선)
 */
function balanceCustomGroups(
    students: Student[],
    groups: CustomGroup[],
    classNames: string[],
    scoreTolerance: number
): boolean {
    let fixed = false;

    for (const group of groups) {
        const classCount: Record<string, number> = {};
        classNames.forEach(cn => { classCount[cn] = 0; });

        students.forEach(s => {
            if (group.member_ids.includes(s.id) && s.assigned_class) {
                classCount[s.assigned_class]++;
            }
        });

        const sortedCounts = Object.entries(classCount).sort(([, a], [, b]) => b - a);
        const maxClassObj = sortedCounts[0];
        const minClassObj = sortedCounts[sortedCounts.length - 1];

        if (maxClassObj[1] - minClassObj[1] > 1) {
            const sourceClass = maxClassObj[0];
            const targetClass = minClassObj[0];

            // 이동할 학생 후보들 찾기 (모든 후보 탐색)
            const potentialMovers = students.filter(s =>
                s.assigned_class === sourceClass &&
                group.member_ids.includes(s.id) &&
                !s.fixed_class
            );

            for (const studentToMove of potentialMovers) {
                // 이동할 그룹(단위) 구성: 본인 + 같은 반에 있는 짝꿍들
                const flockIds = [studentToMove.id, ...studentToMove.keep_ids];
                const flockToMove = students.filter(s =>
                    flockIds.includes(s.id) &&
                    s.assigned_class === sourceClass
                );

                const moveCount = flockToMove.length;

                // 타겟 반에서 교환할 대상을 찾음 (MoveCount 만큼)
                // 조건: 해당 그룹 멤버가 X, 고정 X, Keep X (단순 교환용)
                const swapCandidates = students.filter(s =>
                    s.assigned_class === targetClass &&
                    !group.member_ids.includes(s.id) &&
                    !s.fixed_class &&
                    s.keep_ids.length === 0
                );

                if (swapCandidates.length >= moveCount) {
                    // 일괄 교환
                    const targets = swapCandidates.slice(0, moveCount);
                    flockToMove.forEach(s => s.assigned_class = targetClass);
                    targets.forEach(s => s.assigned_class = sourceClass);

                    // 상태 업데이트 (루프 내에서 재사용하진 않지만 flag 설정을 위해)
                    fixed = true;
                    break; // 해결했으면 다음 그룹으로
                }
            }
        }
    }

    return fixed;
}
interface BalanceStats {
    studentCountImbalance: number;
    genderImbalance: number;
    leaderImbalance: number;
    behaviorImbalance: number;
    emotionalImbalance: number;
    totalBehaviorEmotionalImbalance: number;
    scoreImbalance: number;
    // 점수별 불균형
    scoreMinus3Imbalance: number;
    scoreMinus2Imbalance: number;
    scoreMinus1Imbalance: number;
    scorePlus1Imbalance: number;
    scorePlus2Imbalance: number;

    behaviorTotalImbalance: number;
    behaviorPlus1Imbalance: number;
    behaviorPlus2Imbalance: number;
    behaviorPlus3Imbalance: number;
    emotionalPlus1Imbalance: number;
    emotionalPlus2Imbalance: number;
    emotionalPlus3Imbalance: number;
    normalCountImbalance: number;
    // 유형별 점수 합계 불균형 (새로 추가)
    leaderScoreTotalImbalance: number;
    behaviorOnlyScoreTotalImbalance: number;
    emotionalOnlyScoreTotalImbalance: number;
}

// 반별 통계 계산 (확장)
export function calculateClassStats(
    students: Student[],
    classCount: number,
    groups: CustomGroup[] = []
): ClassStats[] {
    const defaultStats: ClassStats = {
        className: '',
        studentCount: 0,
        averageScore: 0,
        behaviorTotal: 0,
        maleCount: 0,
        femaleCount: 0,
        leaderCount: 0,
        behaviorTypeCount: 0,
        emotionalCount: 0,
        scoreMinus3: 0,
        scoreMinus2: 0,
        scoreMinus1: 0,
        scorePlus1: 0,
        scorePlus2: 0,
        scorePlus3: 0,
        behaviorPlus1: 0,
        behaviorPlus2: 0,
        behaviorPlus3: 0,
        emotionalPlus1: 0,
        emotionalPlus2: 0,
        emotionalPlus3: 0,
        normalCount: 0,
        groupCounts: {},
        preTransferMaleCount: 0,
        preTransferFemaleCount: 0,
    };

    const statsMap: Record<string, ClassStats> = {};

    for (let i = 1; i <= classCount; i++) {
        const className = `${i}반`;
        statsMap[className] = {
            ...defaultStats,
            className,
            groupCounts: {}, // 깊은 복사 필요
        };
        // 그룹 카운트 초기화
        groups.forEach((g) => {
            statsMap[className].groupCounts[g.id] = 0;
        });
    }

    students.forEach((s) => {
        if (!s.assigned_class) return;
        const stats = statsMap[s.assigned_class];
        if (!stats) return;

        stats.studentCount++;
        stats.averageScore += s.academic_score;
        stats.behaviorTotal += s.behavior_score;

        if (s.gender === 'M') {
            stats.maleCount++;
            if (s.is_pre_transfer) stats.preTransferMaleCount++;
        } else {
            stats.femaleCount++;
            if (s.is_pre_transfer) stats.preTransferFemaleCount++;
        }

        if (s.behavior_type === 'LEADER') stats.leaderCount++;
        else if (s.behavior_type === 'BEHAVIOR') stats.behaviorTypeCount++;
        else if (s.behavior_type === 'EMOTIONAL') stats.emotionalCount++;

        // 점수별 상세 집계
        if (s.behavior_score === -3) stats.scoreMinus3++;
        if (s.behavior_score === -2) stats.scoreMinus2++;
        if (s.behavior_score === -1) stats.scoreMinus1++;
        if (s.behavior_score === 1) stats.scorePlus1++;
        if (s.behavior_score === 2) stats.scorePlus2++;
        if (s.behavior_score === 3) stats.scorePlus3++;

        if (s.behavior_score === 0) stats.normalCount++;
        else if (s.behavior_score === -1) {
            if (s.behavior_type === 'BEHAVIOR') stats.behaviorPlus1++;
            if (s.behavior_type === 'EMOTIONAL') stats.emotionalPlus1++;
        } else if (s.behavior_score === -2) {
            if (s.behavior_type === 'BEHAVIOR') stats.behaviorPlus2++;
            if (s.behavior_type === 'EMOTIONAL') stats.emotionalPlus2++;
        } else if (s.behavior_score === -3) {
            if (s.behavior_type === 'BEHAVIOR') stats.behaviorPlus3++;
            if (s.behavior_type === 'EMOTIONAL') stats.emotionalPlus3++;
        }

        s.group_ids.forEach((gid) => {
            if (stats.groupCounts[gid] !== undefined) {
                stats.groupCounts[gid]++;
            }
        });
    });

    // 평균 계산
    Object.values(statsMap).forEach((stats) => {
        if (stats.studentCount > 0) {
            stats.averageScore = Math.round(stats.averageScore / stats.studentCount);
        }
    });

    return Object.values(statsMap).sort((a, b) => {
        const numA = parseInt(a.className.replace('반', ''));
        const numB = parseInt(b.className.replace('반', ''));
        return numA - numB;
    });
}

function getBalanceStats(students: Student[], classNames: string[]): BalanceStats {
    const classCounts: Record<string, {
        total: number;
        male: number;
        female: number;
        leader: number;
        behavior: number;
        emotional: number;
        behaviorEmotional: number;
        scoreSum: number;
        scoreMinus3: number;
        scoreMinus2: number;
        scoreMinus1: number;
        scorePlus1: number;
        scorePlus2: number;
        scorePlus3: number;
        behaviorTotal: number;
        behaviorPlus1: number;
        behaviorPlus2: number;
        behaviorPlus3: number;
        emotionalPlus1: number;
        emotionalPlus2: number;
        emotionalPlus3: number;
        normalCount: number;
        // 유형별 점수 합계 (새로 추가)
        leaderScoreTotal: number;
        behaviorOnlyScoreTotal: number;
        emotionalOnlyScoreTotal: number;
    }> = {};

    classNames.forEach(cn => {
        const classStudents = students.filter(s => s.assigned_class === cn);
        classCounts[cn] = {
            total: classStudents.length,
            male: classStudents.filter(s => s.gender === 'M').length,
            female: classStudents.filter(s => s.gender === 'F').length,
            leader: classStudents.filter(s => s.behavior_type === 'LEADER').length,
            behavior: classStudents.filter(s => s.behavior_type === 'BEHAVIOR').length,
            emotional: classStudents.filter(s => s.behavior_type === 'EMOTIONAL').length,
            behaviorEmotional: classStudents.filter(s => s.behavior_type === 'BEHAVIOR' || s.behavior_type === 'EMOTIONAL').length,
            scoreSum: classStudents.reduce((sum, s) => sum + s.academic_score, 0),
            scoreMinus3: classStudents.filter(s => s.behavior_score === -3).length,
            scoreMinus2: classStudents.filter(s => s.behavior_score === -2).length,
            scoreMinus1: classStudents.filter(s => s.behavior_score === -1).length,
            scorePlus1: classStudents.filter(s => s.behavior_score === 1).length,
            scorePlus2: classStudents.filter(s => s.behavior_score === 2).length,
            scorePlus3: classStudents.filter(s => s.behavior_score === 3).length,
            behaviorTotal: classStudents.reduce((sum, s) => sum + s.behavior_score, 0),
            behaviorPlus1: classStudents.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -1).length,
            behaviorPlus2: classStudents.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -2).length,
            behaviorPlus3: classStudents.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -3).length,
            emotionalPlus1: classStudents.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -1).length,
            emotionalPlus2: classStudents.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -2).length,
            emotionalPlus3: classStudents.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -3).length,
            normalCount: classStudents.filter(s => s.behavior_score === 0).length,
            // 유형별 점수 합계
            leaderScoreTotal: classStudents.filter(s => s.behavior_type === 'LEADER').reduce((sum, s) => sum + s.behavior_score, 0),
            behaviorOnlyScoreTotal: classStudents.filter(s => s.behavior_type === 'BEHAVIOR').reduce((sum, s) => sum + s.behavior_score, 0),
            emotionalOnlyScoreTotal: classStudents.filter(s => s.behavior_type === 'EMOTIONAL').reduce((sum, s) => sum + s.behavior_score, 0),
        };
    });

    const values = Object.values(classCounts);

    const getImbalance = (getter: (v: typeof values[0]) => number): number => {
        const vals = values.map(getter);
        return Math.max(...vals) - Math.min(...vals);
    };

    const avgScores = values.map(v => v.total > 0 ? v.scoreSum / v.total : 0);

    return {
        studentCountImbalance: getImbalance(v => v.total),
        genderImbalance: Math.max(getImbalance(v => v.male), getImbalance(v => v.female)),
        leaderImbalance: getImbalance(v => v.leader),
        behaviorImbalance: getImbalance(v => v.behavior),
        emotionalImbalance: getImbalance(v => v.emotional),
        totalBehaviorEmotionalImbalance: getImbalance(v => v.behaviorEmotional),
        scoreImbalance: Math.max(...avgScores) - Math.min(...avgScores),
        scoreMinus3Imbalance: getImbalance(v => v.scoreMinus3),
        scoreMinus2Imbalance: getImbalance(v => v.scoreMinus2),
        scoreMinus1Imbalance: getImbalance(v => v.scoreMinus1),
        scorePlus1Imbalance: getImbalance(v => v.scorePlus1),
        scorePlus2Imbalance: getImbalance(v => v.scorePlus2),
        behaviorTotalImbalance: getImbalance(v => v.behaviorTotal),
        behaviorPlus1Imbalance: getImbalance(v => v.behaviorPlus1),
        behaviorPlus2Imbalance: getImbalance(v => v.behaviorPlus2),
        behaviorPlus3Imbalance: getImbalance(v => v.behaviorPlus3),
        emotionalPlus1Imbalance: getImbalance(v => v.emotionalPlus1),
        emotionalPlus2Imbalance: getImbalance(v => v.emotionalPlus2),
        emotionalPlus3Imbalance: getImbalance(v => v.emotionalPlus3),
        normalCountImbalance: getImbalance(v => v.normalCount),
        // 유형별 점수 합계 불균형
        leaderScoreTotalImbalance: getImbalance(v => v.leaderScoreTotal),
        behaviorOnlyScoreTotalImbalance: getImbalance(v => v.behaviorOnlyScoreTotal),
        emotionalOnlyScoreTotalImbalance: getImbalance(v => v.emotionalOnlyScoreTotal),
    };
}

function isBalanced(stats: BalanceStats): boolean {
    return stats.studentCountImbalance <= BALANCE_TOLERANCE &&
        stats.genderImbalance <= BALANCE_TOLERANCE &&
        stats.leaderImbalance <= BALANCE_TOLERANCE &&
        stats.behaviorImbalance <= BALANCE_TOLERANCE &&
        stats.emotionalImbalance <= BALANCE_TOLERANCE &&
        stats.totalBehaviorEmotionalImbalance <= BALANCE_TOLERANCE + 1 &&
        stats.scoreImbalance <= 30 &&
        stats.scoreMinus3Imbalance <= BALANCE_TOLERANCE &&
        stats.scoreMinus2Imbalance <= BALANCE_TOLERANCE &&
        stats.scoreMinus1Imbalance <= BALANCE_TOLERANCE &&
        stats.scorePlus1Imbalance <= BALANCE_TOLERANCE &&
        stats.scorePlus2Imbalance <= BALANCE_TOLERANCE &&
        stats.behaviorTotalImbalance <= 2;
}

/**
 * 전체 학생 수 균형
 */
/**
 * 전체 학생 수 균형
 */
function balanceStudentCount(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => {
        counts[cn] = students.filter(s => s.assigned_class === cn).length;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => {
        const diff = b - a;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;

    // 많은 반에서 적은 반으로 학생 이동
    // 단순 이동이 아니라, 적은 반의 빈 자리로 이동하거나(빈자리가 있다면), 적절한 교환이 필요함.
    // 하지만 여기서는 "이동"을 시도함. canSwapForGeneralBalance(A, undefined, target)
    // -> studentB가 undefined이면 "빈 자리로 이동"을 의미함.
    const studentToMove = students.find(s =>
        s.assigned_class === maxClass &&
        canSwapForGeneralBalance(s, undefined, minClass)
    );

    if (studentToMove) {
        studentToMove.assigned_class = minClass;
        return true;
    }

    // 만약 단순 이동이 불가능하다면(예: 모든 학생이 그룹/관계 등에 묶여있어서),
    // 교환(Swap)을 시도해야 할 수도 있음. 하지만 "수"를 맞추는 것이므로 교환은 의미가 없음 (1명 빠지고 1명 들어오면 수 변화 없음)
    // 따라서 수 불균형 해소는 "이동 가능한 학생"이 있어야만 함.

    return false;
}

/**
 * 성별 균형
 */
function balanceGender(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    for (const gender of ['M', 'F'] as const) {
        const counts: Record<string, number> = {};
        classNames.forEach(cn => {
            counts[cn] = students.filter(s => s.assigned_class === cn && s.gender === gender).length;
        });

        const sorted = Object.entries(counts).sort(([, a], [, b]) => {
            const diff = b - a;
            if (diff !== 0) return diff;
            return Math.random() - 0.5;
        });
        if (sorted[0][1] - sorted[sorted.length - 1][1] > BALANCE_TOLERANCE) {
            const maxClass = sorted[0][0];
            const minClass = sorted[sorted.length - 1][0];

            // 같은 성별, 성적 비슷한 학생과 교환
            // studentA: maxClass의 gender 학생
            // studentB: minClass의 !gender 학생 (교환하여 gender 수 맞춤)
            const studentA = students.find(s =>
                s.assigned_class === maxClass && s.gender === gender &&
                // A가 minClass로 갈 수 있는지 체크 (B가 미정인 상태지만, 일단 A 자체 제약 확인)
                // 하지만 canSwap은 쌍방 체크이므로 루프 안에서 확인해야 함
                !s.fixed_class
            );

            if (!studentA) continue; // A 후보 없음

            // A와 교환 가능한 B 찾기
            const studentB = students.find(s =>
                s.assigned_class === minClass && s.gender !== gender &&
                canSwapForGeneralBalance(studentA, s, minClass) && // 스마트 스왑 체크
                Math.abs(s.academic_score - studentA.academic_score) <= scoreTolerance
            );

            if (studentA && studentB) {
                studentA.assigned_class = minClass;
                studentB.assigned_class = maxClass;
                return true;
            }
        }
    }
    return false;
}

/**
 * 특정 유형 학생 수 균형
 */
function balanceType(
    students: Student[],
    classNames: string[],
    type: 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL',
    scoreTolerance: number
): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => {
        counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === type).length;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => {
        const diff = b - a;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    // 같은 유형 학생을 많은 반에서 적은 반으로, 같은 성별의 일반학생과 교환
    // A: maxClass의 type 학생
    const studentA = students.find(s =>
        s.assigned_class === maxClass && s.behavior_type === type && !s.fixed_class
    );

    if (!studentA) return false;

    // B: minClass의 NONE 학생 (교환 대상)
    const studentB = students.find(s =>
        s.assigned_class === minClass &&
        s.behavior_type === 'NONE' &&
        canSwapForGeneralBalance(studentA, s, minClass) && // 스마트 스왑!
        // s.gender === studentA.gender && // 성별 유지 조건 (필수일까? 일단 유지)
        // -> 일반적인 균형 알고리즘에선 성별을 유지하려고 노력함.
        // 하지만 canSwapForGeneralBalance가 더 중요함. 일단 기존 로직 유지
        s.gender === studentA.gender &&
        Math.abs(s.academic_score - studentA.academic_score) <= scoreTolerance * 2
    );

    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }

    return false;
}

/**
 * 행동형+정서형 합계 균형
 */
function balanceBehaviorEmotionalTotal(
    students: Student[],
    classNames: string[],
    scoreTolerance: number
): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => {
        counts[cn] = students.filter(s =>
            s.assigned_class === cn &&
            (s.behavior_type === 'BEHAVIOR' || s.behavior_type === 'EMOTIONAL')
        ).length;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => {
        const diff = b - a;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE + 1) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    const studentA = students.find(s =>
        s.assigned_class === maxClass &&
        (s.behavior_type === 'BEHAVIOR' || s.behavior_type === 'EMOTIONAL') &&
        !s.fixed_class
    );

    if (!studentA) return false;

    const studentB = students.find(s =>
        s.assigned_class === minClass &&
        s.behavior_type === 'NONE' &&
        canSwapForGeneralBalance(studentA, s, minClass) &&
        s.gender === studentA.gender &&
        Math.abs(s.academic_score - studentA.academic_score) <= scoreTolerance * 2
    );

    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }

    return false;
}

/**
 * 특정 점수 학생 수 균형
 */
function balanceByScore(
    students: Student[],
    classNames: string[],
    targetScore: number,
    scoreTolerance: number
): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => {
        counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_score === targetScore).length;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => {
        const diff = b - a;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    const studentA = students.find(s =>
        s.assigned_class === maxClass &&
        s.behavior_score === targetScore &&
        !s.fixed_class
    );

    if (!studentA) return false;

    const studentB = students.find(s =>
        s.assigned_class === minClass &&
        s.behavior_score === 0 &&
        canSwapForGeneralBalance(studentA, s, minClass) &&
        s.gender === studentA.gender &&
        Math.abs(s.academic_score - studentA.academic_score) <= scoreTolerance * 2
    );

    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }

    return false;
}

/**
 * 유형+점수 조합별 학생 수 균형 (예: 행동형-2점 학생 수 균형)
 * 개선: 교환 조건을 완화하여 더 효과적인 균형 배정
 */
function balanceByTypeAndScore(
    students: Student[],
    classNames: string[],
    targetType: 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL',
    targetScore: number,
    scoreTolerance: number
): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => {
        counts[cn] = students.filter(s =>
            s.assigned_class === cn &&
            s.behavior_type === targetType &&
            s.behavior_score === targetScore
        ).length;
    });

    const sorted = Object.entries(counts).sort(([, a], [, b]) => {
        const diff = b - a;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= 1) return false; // 차이 1 이하면 OK

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    // 이동할 학생 찾기 (유형+점수가 일치하는 학생)
    const studentA = students.find(s =>
        s.assigned_class === maxClass &&
        s.behavior_type === targetType &&
        s.behavior_score === targetScore &&
        !s.fixed_class &&
        // 중요 제약조건만 확인 (그룹/관계 설정이 없는 학생 우선)
        s.group_ids.length === 0 &&
        s.avoid_ids.length === 0 &&
        s.keep_ids.length === 0
    );

    // 우선 후보가 없으면 제약이 있는 학생도 시도 (단, fixed만 제외)
    const studentAFallback = !studentA ? students.find(s =>
        s.assigned_class === maxClass &&
        s.behavior_type === targetType &&
        s.behavior_score === targetScore &&
        !s.fixed_class
    ) : null;

    const actualStudentA = studentA || studentAFallback;
    if (!actualStudentA) return false;

    // 교환 대상: 일반 학생(NONE) 또는 같은 유형의 다른 점수 학생
    // 조건 완화: 성별만 맞추고, 성적 차이 조건 완화
    const studentB = students.find(s =>
        s.assigned_class === minClass &&
        !s.fixed_class &&
        s.gender === actualStudentA.gender &&
        // 교환 대상은 일반 학생이거나 다른 유형/점수
        (s.behavior_type === 'NONE' ||
            s.behavior_type !== targetType ||
            s.behavior_score !== targetScore) &&
        // 제약조건 완화: 그룹/관계가 없는 학생 우선
        s.group_ids.length === 0 &&
        s.avoid_ids.length === 0 &&
        s.keep_ids.length === 0
    );

    // 우선 후보가 없으면 제약이 있는 학생도 시도
    const studentBFallback = !studentB ? students.find(s =>
        s.assigned_class === minClass &&
        !s.fixed_class &&
        s.gender === actualStudentA.gender &&
        (s.behavior_type === 'NONE' ||
            s.behavior_type !== targetType ||
            s.behavior_score !== targetScore) &&
        // 최소한 상극/같은반 관계가 없어야 함
        s.avoid_ids.length === 0 &&
        s.keep_ids.length === 0
    ) : null;

    const actualStudentB = studentB || studentBFallback;

    if (actualStudentA && actualStudentB) {
        actualStudentA.assigned_class = minClass;
        actualStudentB.assigned_class = maxClass;
        return true;
    }

    return false;
}

/**
 * 생활지도 총점 균형
 */
function balanceBehaviorTotal(
    students: Student[],
    classNames: string[],
    scoreTolerance: number
): boolean {
    const totals: Record<string, number> = {};
    classNames.forEach(cn => {
        totals[cn] = students
            .filter(s => s.assigned_class === cn)
            .reduce((sum, s) => sum + s.behavior_score, 0);
    });

    const sorted = Object.entries(totals).sort(([, a], [, b]) => {
        const diff = b - a;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= 3) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    const studentA = students.find(s =>
        s.assigned_class === maxClass &&
        s.behavior_score < 0 &&
        !s.fixed_class
    );

    if (!studentA) return false;

    const studentB = students.find(s =>
        s.assigned_class === minClass &&
        s.behavior_score >= 0 &&
        canSwapForGeneralBalance(studentA, s, minClass) &&
        s.gender === studentA.gender &&
        Math.abs(s.academic_score - studentA.academic_score) <= scoreTolerance * 2
    );

    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }

    return false;
}

/**
 * 유형별 점수 합계 균형 (리더형/행동형/정서형 각각의 점수 합계 균형)
 */
function balanceTypeScoreTotal(
    students: Student[],
    classNames: string[],
    targetType: 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL',
    scoreTolerance: number
): boolean {
    const totals: Record<string, number> = {};
    classNames.forEach(cn => {
        totals[cn] = students
            .filter(s => s.assigned_class === cn && s.behavior_type === targetType)
            .reduce((sum, s) => sum + s.behavior_score, 0);
    });

    const sorted = Object.entries(totals).sort(([, a], [, b]) => {
        const diff = b - a;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    const diff = Math.abs(sorted[0][1] - sorted[sorted.length - 1][1]);
    if (diff <= 2) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    const studentA = students.find(s =>
        s.assigned_class === maxClass &&
        s.behavior_type === targetType &&
        !s.fixed_class
    );

    if (!studentA) return false;

    const studentB = students.find(s =>
        s.assigned_class === minClass &&
        (s.behavior_type === targetType || s.behavior_type === 'NONE') &&
        canSwapForGeneralBalance(studentA, s, minClass) &&
        s.gender === studentA.gender &&
        Math.abs(s.academic_score - studentA.academic_score) <= scoreTolerance * 2
    );

    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }

    return false;
}

/**
 * 성적 평균 균형
 */
function balanceScore(students: Student[], classNames: string[]): boolean {
    const classAvgs: { className: string; avg: number; students: Student[] }[] = classNames.map(cn => {
        const classStudents = students.filter(s => s.assigned_class === cn);
        const avg = classStudents.length > 0
            ? classStudents.reduce((sum, s) => sum + s.academic_score, 0) / classStudents.length
            : 0;
        return { className: cn, avg, students: classStudents };
    });

    classAvgs.sort((a, b) => {
        const diff = b.avg - a.avg;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
    });
    const maxAvgClass = classAvgs[0];
    const minAvgClass = classAvgs[classAvgs.length - 1];

    if (maxAvgClass.avg - minAvgClass.avg <= 30) return false;

    // 높은 점수 학생과 낮은 점수 학생 교환 (같은 성별, 같은 유형)
    const highScoreStudent = maxAvgClass.students
        .filter(s => !s.fixed_class)
        .sort((a, b) => b.academic_score - a.academic_score)[0];

    if (!highScoreStudent) return false;

    const lowScoreStudent = minAvgClass.students
        .filter(s => !s.fixed_class &&
            s.gender === highScoreStudent.gender &&
            s.behavior_type === highScoreStudent.behavior_type &&
            canSwapForGeneralBalance(highScoreStudent, s, minAvgClass.className) // 스마트 스왑
        )
        .sort((a, b) => a.academic_score - b.academic_score)[0];

    if (lowScoreStudent) {
        highScoreStudent.assigned_class = minAvgClass.className;
        lowScoreStudent.assigned_class = maxAvgClass.className;
        return true;
    }

    return false;
}

/**
 * 상극 관계 해결
 */


/**
 * 위반 사항 수집
 */
function collectViolations(
    students: Student[],
    groups: CustomGroup[],
    violations: Violation[]
): void {
    // 1. 상극 위반 체크
    const avoidPairs = new Set<string>();
    students.forEach(student => {
        student.avoid_ids.forEach(avoidId => {
            const avoidStudent = students.find(s => s.id === avoidId);
            if (avoidStudent && avoidStudent.assigned_class === student.assigned_class) {
                const pairKey = [student.id, avoidId].sort().join('-');
                if (!avoidPairs.has(pairKey)) {
                    avoidPairs.add(pairKey);
                    violations.push({
                        type: 'AVOID',
                        message: `${student.name} 와(과) ${avoidStudent.name} 이(가) 같은 반(${student.assigned_class})에 배정됨`,
                        studentIds: [student.id, avoidId],
                        className: student.assigned_class || undefined,
                    });
                }
            }
        });
    });

    // 2. 같은 반 희망 위반 (Keep) 체크
    const keepPairs = new Set<string>();
    students.forEach(student => {
        student.keep_ids.forEach(keepId => {
            const keepStudent = students.find(s => s.id === keepId);
            // 둘 다 배정되었는데, 반이 다른 경우
            if (keepStudent && student.assigned_class && keepStudent.assigned_class && student.assigned_class !== keepStudent.assigned_class) {
                const pairKey = [student.id, keepId].sort().join('-');
                if (!keepPairs.has(pairKey)) {
                    keepPairs.add(pairKey);
                    violations.push({
                        type: 'KEEP',
                        message: `${student.name} 와(과) ${keepStudent.name} 이(가) 다른 반에 배정됨 (${student.assigned_class} / ${keepStudent.assigned_class})`,
                        studentIds: [student.id, keepId],
                        className: student.assigned_class || undefined,
                    });
                }
            }
        });
    });
}

/**
 * 같은 반 희망 관계 해결
 * 떨어져 있는 단짝을 찾아서 한쪽을 이동시킴
 */
function fixKeepViolations(
    students: Student[],
    classNames: string[],
    scoreTolerance: number
): boolean {
    // 떨어져 있는 Keep 쌍 찾기
    for (const studentA of students) {
        if (!studentA.assigned_class || !studentA.keep_ids || studentA.keep_ids.length === 0) continue;

        for (const keepId of studentA.keep_ids) {
            const studentB = students.find(s => s.id === keepId);
            if (!studentB || !studentB.assigned_class) continue;

            // 이미 같은 반이면 패스
            if (studentA.assigned_class === studentB.assigned_class) continue;

            const classA = studentA.assigned_class;
            const classB = studentB.assigned_class;

            // 교환 가능성 체크 (Keep 제약 무시 - 우리가 지금 Keep을 고치려는 것이므로)
            const canSwapForKeepFix = (mover: Student, target: Student, moverDestClass: string, targetDestClass: string): boolean => {
                // 1. 고정 배정 체크
                if (mover.fixed_class || target.fixed_class) return false;

                // 2. 전출생 체크 - 둘 다 전출생이거나 둘 다 아니어야 함
                if (!!mover.is_pre_transfer !== !!target.is_pre_transfer) return false;

                // 3. 그룹 제약 체크 - 그룹 구성이 같아야 함 (교환 시 반별 그룹 인원 유지)
                const moverGroups = JSON.stringify((mover.group_ids || []).sort());
                const targetGroups = JSON.stringify((target.group_ids || []).sort());
                if (moverGroups !== targetGroups) return false;

                // 4. 상극(Avoid) 체크 - mover가 moverDestClass에 상극이 있는지
                if (mover.avoid_ids && mover.avoid_ids.length > 0) {
                    const hasAvoidInDest = students.some(s =>
                        s.assigned_class === moverDestClass &&
                        mover.avoid_ids.includes(s.id)
                    );
                    if (hasAvoidInDest) return false;
                }

                // 5. 상극(Avoid) 체크 - target이 targetDestClass에 상극이 있는지
                if (target.avoid_ids && target.avoid_ids.length > 0) {
                    const hasAvoidInDest = students.some(s =>
                        s.assigned_class === targetDestClass &&
                        target.avoid_ids.includes(s.id)
                    );
                    if (hasAvoidInDest) return false;
                }

                // 6. target의 Keep 관계 체크 - target이 targetDestClass로 가면 자신의 Keep 파트너와 떨어지는지
                // (mover의 Keep 관계는 체크 안 함 - 지금 고치려는 것이므로)
                if (target.keep_ids && target.keep_ids.length > 0) {
                    for (const targetKeepId of target.keep_ids) {
                        const targetKeepPartner = students.find(s => s.id === targetKeepId);
                        if (targetKeepPartner && targetKeepPartner.assigned_class) {
                            // 현재 target과 파트너가 같은 반인데, 이동하면 떨어지게 됨
                            if (target.assigned_class === targetKeepPartner.assigned_class &&
                                targetDestClass !== targetKeepPartner.assigned_class) {
                                return false;
                            }
                        }
                    }
                }

                return true;
            };

            // 시도 1: A를 B의 반으로 이동 (classB에 있는 누군가와 교환)
            if (!studentA.fixed_class) {
                const targetStudent = students.find(s =>
                    s.assigned_class === classB &&
                    s.id !== studentB.id && // studentB 자신과는 교환 안 함
                    canSwapForKeepFix(studentA, s, classB, classA)
                );

                if (targetStudent) {
                    studentA.assigned_class = classB;
                    targetStudent.assigned_class = classA;
                    return true;
                }
            }

            // 시도 2: B를 A의 반으로 이동 (classA에 있는 누군가와 교환)
            if (!studentB.fixed_class) {
                const targetStudent = students.find(s =>
                    s.assigned_class === classA &&
                    s.id !== studentA.id && // studentA 자신과는 교환 안 함
                    canSwapForKeepFix(studentB, s, classA, classB)
                );

                if (targetStudent) {
                    studentB.assigned_class = classA;
                    targetStudent.assigned_class = classB;
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * 미배정 학생들을 현재 인원이 적은 반부터 차례로 배정
 */
function fillUnassignedStudents(students: Student[], classNames: string[]) {
    const unassigned = students.filter(s => !s.assigned_class);
    if (unassigned.length === 0) return;

    // 성적순 정렬 (S자 배정 효과를 위해)
    unassigned.sort((a, b) => b.academic_score - a.academic_score);

    // 현재 반별 인원 파악
    const counts: Record<string, number> = {};
    classNames.forEach(cn => {
        counts[cn] = students.filter(s => s.assigned_class === cn).length;
    });

    unassigned.forEach(s => {
        // 가장 적은 반 찾기
        const sortedClasses = [...classNames].sort((a, b) => {
            const diff = counts[a] - counts[b];
            if (diff !== 0) return diff;
            return Math.random() - 0.5;
        });

        const target = sortedClasses[0];
        s.assigned_class = target;
        counts[target]++;
    });
}

/**
 * 배열을 랜덤하게 섞는 유틸리티 함수 (Fisher-Yates Shuffle)
 */
function shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}



