import { Student, CustomGroup, ClassStats, Violation } from '@/types';

const MAX_ITERATIONS = 200;
const BALANCE_TOLERANCE = 1; // 허용 편차 (1명 이내)

const PENALTY_WEIGHTS = {
    FIXED_VIOLATION: 100000,
    AVOID_VIOLATION: 50000,
    KEEP_VIOLATION: 10000,
    GROUP_OVERLOAD: 5000,
    GENDER_IMBALANCE: 2000,
    ACADEMIC_IMBALANCE: 500, // 점수 차이 1점당
    BEHAVIOR_IMBALANCE: 1000,
};

/**
 * 반편성 메인 함수
 * 모든 균형 조건을 만족할 때까지 반복 최적화
 */
export function assignStudents(
    students: Student[],
    classCount: number,
    groups: CustomGroup[],
    scoreTolerance: number = 25,
    mode: 'new' | 'optimize' = 'new',
    useAdvancedConstraints: boolean = true
): { students: Student[]; violations: Violation[] } {
    // 원본 보존을 위해 깊은 복사
    let assignedStudents: Student[] = students.map(s => ({ ...s }));

    // 반 이름 목록
    const classNames: string[] = [];
    for (let i = 1; i <= classCount; i++) {
        classNames.push(`${i}반`);
    }

    const isNewMode = mode === 'new';

    if (isNewMode) {
        // [v1.2.1 복원] 신규 배정 모드: 10회 시행 중 가장 균형 잡힌 결과 선택
        // 기존 배정 초기화 (고정반 제외)
        assignedStudents.forEach(s => {
            s.assigned_class = s.fixed_class || null;
        });

        // 학생 순서 셔플 (매번 다른 결과를 위해)
        shuffleArray(assignedStudents);

        const TRIAL_COUNT = 10;
        let bestResult: Student[] | null = null;
        let bestScore = Infinity;

        for (let trial = 0; trial < TRIAL_COUNT; trial++) {
            // 매 시도마다 배정 초기화
            const trialStudents = assignedStudents.map(s => ({ ...s, assigned_class: s.fixed_class || null }));
            shuffleArray(trialStudents);

            // 초기 배정 실행
            const assigned = balancedInitialAssignment(trialStudents, classNames, groups);

            // 최적화 루프 실행 (v1.2.1 전용 함수 사용)
            const optimized = optimizeBalanceForNewMode(assigned, classNames, groups, scoreTolerance);

            // 전출생 검증
            validatePreTransferDistribution(optimized, classNames);

            // [v1.2.1 평가 공식] 균형 점수 계산 (낮을수록 좋음)
            const classBehaviorScores = classNames.map(cn => {
                const classStudents = optimized.filter(s => s.assigned_class === cn);
                return {
                    behaviorTotal: classStudents.reduce((sum, s) => sum + s.behavior_score, 0),
                    count: classStudents.length,
                    maleCount: classStudents.filter(s => s.gender === 'M').length,
                    negativeCount: classStudents.filter(s => s.behavior_score < 0).length,
                };
            });

            const behaviorTotals = classBehaviorScores.map(c => c.behaviorTotal);
            const counts = classBehaviorScores.map(c => c.count);
            const maleCounts = classBehaviorScores.map(c => c.maleCount);
            const negativeCounts = classBehaviorScores.map(c => c.negativeCount);

            const behaviorImbalance = Math.max(...behaviorTotals) - Math.min(...behaviorTotals);
            const countImbalance = Math.max(...counts) - Math.min(...counts);
            const genderImbalance = Math.max(...maleCounts) - Math.min(...maleCounts);
            const negativeImbalance = Math.max(...negativeCounts) - Math.min(...negativeCounts);

            // v1.2.1 가중치: negativeImbalance(마이너스 학생 수 균형)에 높은 가중치
            const balanceScore =
                behaviorImbalance * 10 +  // 총점 불균형
                negativeImbalance * 8 +   // 마이너스 인원 불균형
                countImbalance * 5 +      // 인원수 불균형
                genderImbalance * 3;      // 성비 불균형

            if (balanceScore < bestScore) {
                bestScore = balanceScore;
                bestResult = JSON.parse(JSON.stringify(optimized));
            }
        }

        assignedStudents = bestResult || assignedStudents;

        // [후처리] 피함/함께 관계 강제 해결 (신규 배정 전용)
        assignedStudents = forceFixRelationConstraints(assignedStudents, classNames);

        // [후처리] 성별 균형 보정 (성적 보정보다 먼저)
        assignedStudents = balanceGenderWithFreeStudents(assignedStudents, classNames, groups);

        // [후처리] 자유 학생 교환으로 성적 균형 보정
        assignedStudents = balanceScoresWithFreeStudents(assignedStudents, classNames, groups);
    } else {
        // 기배정 모드 (Optimize Mode)
        const isPreAssignedMode = true;

        // 미배정 학생들 채우기 (인원이 적은 반부터)
        fillUnassignedStudents(assignedStudents, classNames);

        // 2단계: 균형 최적화 루프 (기배정 모드만 여기서 실행)
        assignedStudents = optimizeBalance(assignedStudents, classNames, groups, scoreTolerance, isPreAssignedMode, useAdvancedConstraints);

        // 2.5단계: 전출생 분산 최종 검증
        validatePreTransferDistribution(assignedStudents, classNames);

        // [후처리] 성별 균형 보정 (성적 보정보다 먼저)
        assignedStudents = balanceGenderWithFreeStudents(assignedStudents, classNames, groups);

        // [후처리] 자유 학생 교환으로 성적 균형 보정
        assignedStudents = balanceScoresWithFreeStudents(assignedStudents, classNames, groups);
    }

    // 3단계: 위반 사항 수집
    const violations: Violation[] = [];
    collectViolations(assignedStudents, groups, violations);

    return { students: assignedStudents, violations };
}

/**
 * 1단계: 균형 잡힌 초기 배정 (v1.2.1 - Suitability Score 방식)
 * 학생 유형별로 분류 후 적합도 점수제를 통해 최적의 반을 찾아 배정
 */
function balancedInitialAssignment(students: Student[], classNames: string[], groups: CustomGroup[]): Student[] {
    // 고정 배정 학생 먼저 배정
    const fixedStudents = students.filter(s => s.fixed_class);
    fixedStudents.forEach(s => { s.assigned_class = s.fixed_class; });

    // 1.5. 전출생 배정 (고정반 다음, 커스텀 그룹 전)
    assignPreTransferStudents(students, classNames);

    // 2. 분산 배정 그룹(Custom Group) 처리
    // 각 그룹별로 멤버들을 확인하여, 골고루 분산 배정
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

        // 각 배정될 반별로 채워주기
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

    // 3. 전출 예정 학생 균형 배정 (그룹처럼 1반당 1명씩 분산)
    // 전출 예정 학생은 특정 반에 몰리지 않게 미리 배정
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

        // 각 배정될 반별로 채워주기
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

    // 유형+점수별 세분화 그룹 (각 그룹별 균등 분산을 위해)
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

    // 각 그룹 내 성적순 정렬 (S자 배정을 위해)
    Object.values(typeScoreGroups).forEach(group => {
        group.sort((a, b) => b.academic_score - a.academic_score);
    });

    // S자 배정 함수 (성적순 정렬된 학생을 균등 분산 + 성적 균형)
    const distributeSnake = (studentList: Student[]) => {
        if (studentList.length === 0) return;

        const numClasses = classNames.length;
        let direction = 1; // 1: 정방향, -1: 역방향
        let classIndex = 0;

        studentList.forEach(student => {
            student.assigned_class = classNames[classIndex];

            // 다음 반으로 이동 (S자 패턴)
            classIndex += direction;
            if (classIndex >= numClasses) {
                classIndex = numClasses - 1;
                direction = -1;
            } else if (classIndex < 0) {
                classIndex = 0;
                direction = 1;
            }
        });
    };

    // S자 배정 (전체 인원 기준, 현재 배정된 인원 고려)
    const distributeSnakeWithCurrentCounts = (studentList: Student[]) => {
        if (studentList.length === 0) return;

        // 현재 각 반의 배정 인원 수
        const currentCounts: Record<string, number> = {};
        classNames.forEach(cn => {
            currentCounts[cn] = students.filter(s => s.assigned_class === cn).length;
        });

        const numClasses = classNames.length;
        let direction = 1;
        // 가장 인원이 적은 반부터 시작
        let classIndex = classNames
            .map((cn, i) => ({ cn, count: currentCounts[cn], index: i }))
            .sort((a, b) => a.count - b.count)[0].index;

        studentList.forEach(student => {
            student.assigned_class = classNames[classIndex];
            currentCounts[classNames[classIndex]]++;

            // 다음 반으로 이동 (S자 패턴)
            classIndex += direction;
            if (classIndex >= numClasses) {
                classIndex = numClasses - 1;
                direction = -1;
            } else if (classIndex < 0) {
                classIndex = 0;
                direction = 1;
            }
        });
    };

    // 1단계: 마이너스 학생 S자 배정 (유형+점수별 그룹 내에서)
    // -3점 먼저, -2점, -1점 순서로 배정 (더 중요한 학생 먼저)
    distributeSnake(typeScoreGroups.behavior3);
    distributeSnake(typeScoreGroups.emotional3);
    distributeSnake(typeScoreGroups.behavior2);
    distributeSnake(typeScoreGroups.emotional2);
    distributeSnake(typeScoreGroups.behavior1);
    distributeSnake(typeScoreGroups.emotional1);

    // 2단계: 리더 S자 배정
    distributeSnake(typeScoreGroups.leader2);
    distributeSnake(typeScoreGroups.leader1);

    // 3단계: 일반 학생 S자 배정 (전체 인원 기준)
    distributeSnakeWithCurrentCounts(typeScoreGroups.normalMale);
    distributeSnakeWithCurrentCounts(typeScoreGroups.normalFemale);

    return students;
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
    isPreAssignedMode: boolean = false,
    useAdvancedConstraints: boolean = true
): Student[] {
    // 1단계: 벌점 기반 공격적 최적화 (제약 조건 해결 우선)
    // 상극, 희망, 고정 배정 위반을 해결하기 위해 성적 균형을 잠시 희생할 수 있음
    // [조건 변경] 신규 배정 모드에서는 이 공격적 단계를 건너뜀 (기존 로직 유지)
    if (useAdvancedConstraints && isPreAssignedMode) {
        solveHardConstraints(students, classNames, groups);
    }

    // 2단계: 성분 균형 최적화 (기존 로직)
    // 여기서는 기존에 해결된 제약 조건을 깨뜨리지 않는 선에서 성적/성비를 맞춤
    let iteration = 0;
    while (iteration < MAX_ITERATIONS) {
        iteration++;
        let improved = false;

        const stats = getImbalanceStats(students, classNames, groups);

        // [주요 수준별 인원수 균형] - 우선순위 최고 (Bucket Quota)
        // [조건 변경] 이 단계도 '재배정(Optimize)' 모드에서만 강력하게 적용
        if (useAdvancedConstraints && isPreAssignedMode) {
            if (balanceByTypeAndScoreLevel(students, classNames, groups, 'BEHAVIOR', -3)) improved = true;
            if (balanceByTypeAndScoreLevel(students, classNames, groups, 'EMOTIONAL', -3)) improved = true;
            if (balanceByTypeAndScoreLevel(students, classNames, groups, 'BEHAVIOR', -2)) improved = true;
            if (balanceByTypeAndScoreLevel(students, classNames, groups, 'EMOTIONAL', -2)) improved = true;
            if (balanceByTypeAndScoreLevel(students, classNames, groups, 'LEADER', 2)) improved = true;
        }

        if (stats.studentCountImbalance > BALANCE_TOLERANCE) {
            if (balanceStudentCount(students, classNames, groups, scoreTolerance)) improved = true;
        }

        if (stats.genderImbalance > BALANCE_TOLERANCE) {
            if (balanceGender(students, classNames, groups, scoreTolerance)) improved = true;
        }

        if (useAdvancedConstraints) {
            if (stats.leaderImbalance > BALANCE_TOLERANCE) {
                if (balanceType(students, classNames, groups, 'LEADER', scoreTolerance)) improved = true;
            }
            if (stats.behaviorImbalance > BALANCE_TOLERANCE) {
                if (balanceType(students, classNames, groups, 'BEHAVIOR', scoreTolerance)) improved = true;
            }
            if (stats.emotionalImbalance > BALANCE_TOLERANCE) {
                if (balanceType(students, classNames, groups, 'EMOTIONAL', scoreTolerance)) improved = true;
            }

            // 나머지 수준별 균형 (재배정 모드 전용)
            if (useAdvancedConstraints && isPreAssignedMode) {
                if (balanceByTypeAndScoreLevel(students, classNames, groups, 'BEHAVIOR', -1)) improved = true;
                if (balanceByTypeAndScoreLevel(students, classNames, groups, 'EMOTIONAL', -1)) improved = true;
                if (balanceByTypeAndScoreLevel(students, classNames, groups, 'LEADER', 1)) improved = true;
                if (balanceByTypeAndScoreLevel(students, classNames, groups, 'BEHAVIOR', 1)) improved = true; // +1 행동
                if (balanceByTypeAndScoreLevel(students, classNames, groups, 'EMOTIONAL', 1)) improved = true; // +1 정서
            }

            if (stats.totalBehaviorEmotionalImbalance > BALANCE_TOLERANCE) {
                if (balanceBehaviorEmotionalTotal(students, classNames, groups, scoreTolerance)) improved = true;
            }

            if (!isPreAssignedMode) {
                if (stats.behaviorTotalImbalance > 2) {
                    if (balanceBehaviorTotal(students, classNames, groups, scoreTolerance)) improved = true;
                }
                if (stats.leaderScoreTotalImbalance > 2) {
                    if (balanceTypeScoreTotal(students, classNames, groups, 'LEADER', scoreTolerance)) improved = true;
                }
            } else {
                if (stats.behaviorTotalImbalance > 3) {
                    if (balanceBehaviorTotal(students, classNames, groups, scoreTolerance)) improved = true;
                }
            }
        }

        if (useAdvancedConstraints) {
            if (fixAvoidViolations(students, classNames, groups, scoreTolerance)) improved = true;
            if (fixKeepViolations(students, classNames, groups, scoreTolerance)) improved = true;
            if (balanceCustomGroups(students, groups, classNames, scoreTolerance)) improved = true;
        }

        if (stats.scoreImbalance > 30) {
            if (balanceScore(students, classNames, groups)) improved = true;
        }

        if (!improved || isBalanced(stats)) break;
    }

    return students;
}

/**
 * 벌점 계산 (최적화 판단 기준)
 */
function calculatePenalty(students: Student[], classNames: string[], groups: CustomGroup[]): number {
    let penalty = 0;
    const stats = calculateClassStats(students, classNames, groups);

    // 1. 통계적 불균형 벌점
    penalty += (stats.reduce((sum, s) => sum + s.studentCount, 0) / stats.length); // 인원 불균형은 나중에 별도로
    penalty += getImbalanceStats(students, classNames, groups).genderImbalance * PENALTY_WEIGHTS.GENDER_IMBALANCE;
    penalty += getImbalanceStats(students, classNames, groups).scoreImbalance * PENALTY_WEIGHTS.ACADEMIC_IMBALANCE;
    penalty += getImbalanceStats(students, classNames, groups).behaviorTotalImbalance * PENALTY_WEIGHTS.BEHAVIOR_IMBALANCE;

    // 2. 개별 학생 제약 조건 위반 벌점
    for (const s1 of students) {
        if (!s1.assigned_class) continue;

        // 고정 배정 위반
        if (s1.fixed_class && s1.assigned_class !== s1.fixed_class) {
            penalty += PENALTY_WEIGHTS.FIXED_VIOLATION;
        }

        // 상극 관계 위반
        for (const avoidId of s1.avoid_ids) {
            const s2 = students.find(s => s.id === avoidId);
            if (s2 && s2.assigned_class === s1.assigned_class) {
                penalty += PENALTY_WEIGHTS.AVOID_VIOLATION;
            }
        }

        // 희망 관계 위반
        for (const keepId of s1.keep_ids) {
            const s2 = students.find(s => s.id === keepId);
            if (s2 && s2.assigned_class && s2.assigned_class !== s1.assigned_class) {
                penalty += PENALTY_WEIGHTS.KEEP_VIOLATION;
            }
        }
    }

    // 3. 커스텀 그룹 몰림 벌점
    groups.forEach(g => {
        stats.forEach(s => {
            const count = s.groupCounts[g.id] || 0;
            if (count > 1) {
                penalty += (count - 1) * PENALTY_WEIGHTS.GROUP_OVERLOAD;
            }
        });
    });

    return penalty;
}

/**
 * 상극/전출/고정/그룹 조건을 해결하기 위한 공격적 교환
 */
function solveHardConstraints(students: Student[], classNames: string[], groups: CustomGroup[]) {
    let improved = true;
    let iteration = 0;

    while (improved && iteration < 50) {
        improved = false;
        iteration++;

        let currentPenalty = calculatePenalty(students, classNames, groups);

        // 위반 사항이 있는 학생들을 우선적으로 검토
        const candidates = students.filter(s =>
            !s.fixed_class &&
            !s.is_pre_transfer &&
            (s.avoid_ids.length > 0 || s.keep_ids.length > 0 || groups.some(g => g.member_ids.includes(s.id)))
        );

        // 학생들 섞기 (매번 같은 순서 방지)
        shuffleArray(candidates);

        for (const s1 of candidates) {
            const classA = s1.assigned_class!;

            // 모든 다른 반의 모든 학생과 교환 시도
            for (const targetClass of classNames) {
                if (targetClass === classA) continue;

                const otherStudents = students.filter(s => s.assigned_class === targetClass && !s.fixed_class && !s.is_pre_transfer && s.gender === s1.gender);
                shuffleArray(otherStudents);

                for (const s2 of otherStudents) {
                    // 교환 시뮬레이션
                    s1.assigned_class = targetClass;
                    s2.assigned_class = classA;

                    const newPenalty = calculatePenalty(students, classNames, groups);

                    if (newPenalty < currentPenalty) {
                        // 개선됨! 교환 확정
                        currentPenalty = newPenalty;
                        improved = true;
                        break;
                    } else {
                        // 원상 복구
                        s1.assigned_class = classA;
                        s2.assigned_class = targetClass;
                    }
                }
                if (improved) break;
            }
            if (improved) break;
        }
    }
}

/**
 * 전출생 초기 배정 (최종 로직)
 */
function assignPreTransferStudents(students: Student[], classNames: string[]): void {
    const preTransfers = students.filter(s => s.is_pre_transfer && !s.fixed_class && !s.assigned_class);
    if (preTransfers.length === 0) return;

    const preTransferCounts: Record<string, number> = {};
    classNames.forEach(cn => preTransferCounts[cn] = 0);

    students.forEach(s => {
        if (s.is_pre_transfer && s.assigned_class) {
            preTransferCounts[s.assigned_class] = (preTransferCounts[s.assigned_class] || 0) + 1;
        }
    });

    for (const student of preTransfers) {
        const gender = student.gender;
        const classStats = classNames.map(cn => {
            const normalStudents = students.filter(s => s.assigned_class === cn && !s.is_pre_transfer);
            const maleCount = normalStudents.filter(s => s.gender === 'M').length;
            const femaleCount = normalStudents.filter(s => s.gender === 'F').length;

            return {
                className: cn,
                totalCount: normalStudents.length,
                maleCount,
                femaleCount,
                genderCount: gender === 'M' ? maleCount : femaleCount,
                oppositeGenderCount: gender === 'M' ? femaleCount : maleCount,
                preTransferCount: preTransferCounts[cn],
                genderImbalance: gender === 'M' ? (femaleCount - maleCount) : (maleCount - femaleCount)
            };
        });

        let candidates = classStats.filter(c => c.preTransferCount === 0);
        if (candidates.length === 0) {
            const minCount = Math.min(...classStats.map(c => c.preTransferCount));
            candidates = classStats.filter(c => c.preTransferCount === minCount);
        }

        candidates.sort((a, b) => {
            if (a.totalCount !== b.totalCount) return a.totalCount - b.totalCount;
            if (b.genderImbalance !== a.genderImbalance) return b.genderImbalance - a.genderImbalance;
            return Math.random() - 0.5;
        });

        const target = candidates[0];
        if (target) {
            student.assigned_class = target.className;
            preTransferCounts[target.className]++;
        }
    }
}

/**
 * 전출생 분산 최종 검증
 */
function validatePreTransferDistribution(students: Student[], classNames: string[]): void {
    for (let iter = 0; iter < 10; iter++) {
        const classPreCounts: Record<string, Student[]> = {};
        classNames.forEach(cn => classPreCounts[cn] = []);

        students.forEach(s => {
            if (s.assigned_class && s.is_pre_transfer) {
                classPreCounts[s.assigned_class].push(s);
            }
        });

        const overloaded = Object.entries(classPreCounts).filter(([, list]) => list.length > 1);
        if (overloaded.length === 0) return;

        const emptyClasses = classNames.filter(cn => classPreCounts[cn].length === 0);
        if (emptyClasses.length === 0) return;

        let fixed = false;
        for (const [className, list] of overloaded) {
            for (const student of list) {
                if (student.fixed_class) continue;
                const targetClass = emptyClasses[0];
                const studentB = students.find(s =>
                    s.assigned_class === targetClass &&
                    !s.is_pre_transfer &&
                    !s.fixed_class &&
                    s.gender === student.gender &&
                    s.academic_score >= student.academic_score - 50 &&
                    s.academic_score <= student.academic_score + 50
                );

                if (studentB) {
                    student.assigned_class = targetClass;
                    studentB.assigned_class = className;
                    fixed = true;
                    break;
                }
            }
            if (fixed) break;
        }
        if (!fixed) break;
    }
}

/**
 * 학급별 통계 계산 (UI 표시용)
 */
export function calculateClassStats(students: Student[], classCountOrNames: number | string[], groups: CustomGroup[] = []) {
    const classNames = typeof classCountOrNames === 'number'
        ? Array.from({ length: classCountOrNames }, (_, i) => `${i + 1}반`)
        : classCountOrNames;

    return classNames.map(cn => {
        const cs = students.filter(s => s.assigned_class === cn);
        const preTransfer = cs.filter(s => s.is_pre_transfer);

        return {
            className: cn,
            studentCount: cs.length,
            // 생활지도 점수가 0인 학생 수 (일반 학생)
            normalCount: cs.filter(s => s.behavior_score === 0).length,
            maleCount: cs.filter(s => s.gender === 'M').length,
            femaleCount: cs.filter(s => s.gender === 'F').length,
            averageScore: cs.length > 0 ? Math.round(cs.reduce((sum, s) => sum + s.academic_score, 0) / cs.length) : 0,
            behaviorTotal: cs.reduce((sum, s) => sum + s.behavior_score, 0),

            // UI에서 기대하는 필드명 (상당히 특이하지만 맞춰줌)
            behaviorPlus3: cs.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -3).length,
            behaviorPlus2: cs.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -2).length,
            behaviorPlus1: cs.filter(s => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -1).length,

            emotionalPlus3: cs.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -3).length,
            emotionalPlus2: cs.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -2).length,
            emotionalPlus1: cs.filter(s => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -1).length,

            scorePlus1: cs.filter(s => s.behavior_type === 'LEADER' && s.behavior_score === 1).length,
            scorePlus2: cs.filter(s => s.behavior_type === 'LEADER' && s.behavior_score >= 2).length,

            preTransferCount: preTransfer.length,
            preTransferMaleCount: preTransfer.filter(s => s.gender === 'M').length,
            preTransferFemaleCount: preTransfer.filter(s => s.gender === 'F').length,

            groupCounts: groups.reduce((acc, g) => {
                acc[g.id] = cs.filter(s => g.member_ids.includes(s.id)).length;
                return acc;
            }, {} as Record<string, number>)
        };
    });
}

/**
 * 알고리즘 내부용 불균형 수치 계산
 */
function getImbalanceStats(students: Student[], classNames: string[], groups: CustomGroup[]) {
    const statsArray = calculateClassStats(students, classNames, groups);

    const counts = statsArray.map(s => s.studentCount);
    const males = statsArray.map(s => s.maleCount);
    const females = statsArray.map(s => s.femaleCount);
    const avgs = statsArray.map(s => s.averageScore);
    const behaviorTotals = statsArray.map(s => s.behaviorTotal);

    // 복잡한 필드들은 statsArray에서 직접 추출
    const leaders = statsArray.map(s => s.scorePlus1 + s.scorePlus2);
    const behaviors = statsArray.map(s => s.behaviorPlus3 + s.behaviorPlus2 + s.behaviorPlus1);
    const emotionals = statsArray.map(s => s.emotionalPlus3 + s.emotionalPlus2 + s.emotionalPlus1);
    const m3s = statsArray.map(s => s.behaviorPlus3 + s.emotionalPlus3);

    return {
        studentCountImbalance: Math.max(...counts) - Math.min(...counts),
        genderImbalance: Math.max(...males) - Math.min(...males) + Math.max(...females) - Math.min(...females),
        scoreImbalance: Math.max(...avgs) - Math.min(...avgs),
        behaviorTotalImbalance: Math.max(...behaviorTotals) - Math.min(...behaviorTotals),
        leaderImbalance: Math.max(...leaders) - Math.min(...leaders),
        behaviorImbalance: Math.max(...behaviors) - Math.min(...behaviors),
        emotionalImbalance: Math.max(...emotionals) - Math.min(...emotionals),
        totalBehaviorEmotionalImbalance: Math.max(...behaviors.map((b, i) => b + emotionals[i])) - Math.min(...behaviors.map((b, i) => b + emotionals[i])),
        scoreMinus3Imbalance: Math.max(...m3s) - Math.min(...m3s),
        scoreMinus2Imbalance: Math.max(...statsArray.map(s => s.behaviorPlus2 + s.emotionalPlus2)) - Math.min(...statsArray.map(s => s.behaviorPlus2 + s.emotionalPlus2)),
        scoreMinus1Imbalance: Math.max(...statsArray.map(s => s.behaviorPlus1 + s.emotionalPlus1)) - Math.min(...statsArray.map(s => s.behaviorPlus1 + s.emotionalPlus1)),
        scorePlus1Imbalance: Math.max(...statsArray.map(s => s.scorePlus1)) - Math.min(...statsArray.map(s => s.scorePlus1)),
        scorePlus2Imbalance: Math.max(...statsArray.map(s => s.scorePlus2)) - Math.min(...statsArray.map(s => s.scorePlus2)),
        leaderScoreTotalImbalance: 0, // Placeholder
        behaviorOnlyScoreTotalImbalance: 0, // Placeholder
        emotionalOnlyScoreTotalImbalance: 0, // Placeholder
    };
}

function isBalanced(stats: any): boolean {
    return stats.studentCountImbalance <= BALANCE_TOLERANCE &&
        stats.genderImbalance <= BALANCE_TOLERANCE &&
        stats.scoreImbalance <= 30 &&
        stats.behaviorTotalImbalance <= 2;
}

/**
 * 학생 수 균형 맞추기
 */
function balanceStudentCount(students: Student[], classNames: string[], groups: CustomGroup[], scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn).length);

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    const studentToMove = students.find(s => s.assigned_class === maxClass && canSwapForGeneralBalance(s, undefined, minClass, students, groups));
    if (studentToMove) {
        studentToMove.assigned_class = minClass;
        return true;
    }
    return false;
}

/**
 * 성별 균형 맞추기
 */
function balanceGender(students: Student[], classNames: string[], groups: CustomGroup[], scoreTolerance: number): boolean {
    const maleCounts: Record<string, number> = {};
    const femaleCounts: Record<string, number> = {};
    classNames.forEach(cn => {
        maleCounts[cn] = students.filter(s => s.assigned_class === cn && s.gender === 'M').length;
        femaleCounts[cn] = students.filter(s => s.assigned_class === cn && s.gender === 'F').length;
    });

    const sortedMales = Object.entries(maleCounts).sort(([, a], [, b]) => b - a);
    if (sortedMales[0][1] - sortedMales[sortedMales.length - 1][1] > BALANCE_TOLERANCE) {
        const maxClass = sortedMales[0][0];
        const minClass = sortedMales[sortedMales.length - 1][0];
        const studentA = students.find(s => s.assigned_class === maxClass && s.gender === 'M' && canSwapForGeneralBalance(s, undefined, minClass, students, groups));
        const studentB = students.find(s => s.assigned_class === minClass && s.gender === 'F' && canSwapForGeneralBalance(s, studentA, maxClass, students, groups) && Math.abs(s.academic_score - (studentA?.academic_score || 0)) <= scoreTolerance);
        if (studentA && studentB) {
            studentA.assigned_class = minClass;
            studentB.assigned_class = maxClass;
            return true;
        }
    }
    return false;
}

/**
 * 유형별 학생 수 균형
 */
function balanceType(students: Student[], classNames: string[], groups: CustomGroup[], type: string, scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === type).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_type === type && canSwapForGeneralBalance(s, undefined, minClass, students, groups));
    const studentB = students.find(s => s.assigned_class === minClass && s.behavior_type === 'NONE' && s.gender === studentA?.gender && canSwapForGeneralBalance(s, studentA, maxClass, students, groups) && Math.abs(s.academic_score - (studentA?.academic_score || 0)) <= scoreTolerance);
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
function balanceBehaviorEmotionalTotal(students: Student[], classNames: string[], groups: CustomGroup[], scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && (s.behavior_type === 'BEHAVIOR' || s.behavior_type === 'EMOTIONAL')).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && (s.behavior_type === 'BEHAVIOR' || s.behavior_type === 'EMOTIONAL') && canSwapForGeneralBalance(s, undefined, minClass, students, groups));
    const studentB = students.find(s => s.assigned_class === minClass && s.behavior_type === 'NONE' && s.gender === studentA?.gender && canSwapForGeneralBalance(s, studentA, maxClass, students, groups) && Math.abs(s.academic_score - (studentA?.academic_score || 0)) <= scoreTolerance);
    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }
    return false;
}

/**
 * 특정 점수별 학생 수 균형
 */
function balanceByScore(students: Student[], classNames: string[], groups: CustomGroup[], score: number, scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_score === score).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_score === score && canSwapForGeneralBalance(s, undefined, minClass, students, groups));
    const studentB = students.find(s => s.assigned_class === minClass && s.behavior_score === 0 && s.gender === studentA?.gender && canSwapForGeneralBalance(s, studentA, maxClass, students, groups) && Math.abs(s.academic_score - (studentA?.academic_score || 0)) <= scoreTolerance);
    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }
    return false;
}

/**
 * 생활지도 총점 균형
 */
function balanceBehaviorTotal(students: Student[], classNames: string[], groups: CustomGroup[], scoreTolerance: number): boolean {
    const totals: Record<string, number> = {};
    classNames.forEach(cn => totals[cn] = students.filter(s => s.assigned_class === cn).reduce((sum, s) => sum + s.behavior_score, 0));
    const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= 2) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_score < 0 && canSwapForGeneralBalance(s, undefined, minClass, students, groups));
    const studentB = students.find(s => s.assigned_class === minClass && s.behavior_score >= 0 && s.gender === studentA?.gender && canSwapForGeneralBalance(s, studentA, maxClass, students, groups) && Math.abs(s.academic_score - (studentA?.academic_score || 0)) <= scoreTolerance);
    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }
    return false;
}

/**
 * 유형별 점수 합계 균형
 */
function balanceTypeScoreTotal(students: Student[], classNames: string[], groups: CustomGroup[], type: string, scoreTolerance: number): boolean {
    const totals: Record<string, number> = {};
    classNames.forEach(cn => totals[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === type).reduce((sum, s) => sum + s.behavior_score, 0));
    const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
    if (Math.abs(sorted[0][1] - sorted[sorted.length - 1][1]) <= 2) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_type === type && canSwapForGeneralBalance(s, undefined, minClass, students, groups));
    const studentB = students.find(s => s.assigned_class === minClass && s.gender === studentA?.gender && canSwapForGeneralBalance(s, studentA, maxClass, students, groups) && Math.abs(s.academic_score - (studentA?.academic_score || 0)) <= scoreTolerance);
    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }
    return false;
}

/**
 * 특정 등급(수준) 학생 수 균등화 (쿼터제)
 * 점수 합계가 아니라 '인원수'를 맞추는 데 집중
 */
function balanceByTypeAndScoreLevel(students: Student[], classNames: string[], groups: CustomGroup[], type: string, score: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === type && s.behavior_score === (score >= 2 ? s.behavior_score : score)).length);

    // 리더 2점 이상의 경우 별도 처리
    if (type === 'LEADER' && score === 2) {
        classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === 'LEADER' && s.behavior_score >= 2).length);
    }

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= 1) return false;

    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];

    // 이동할 학생 (해당 수준)
    const studentA = students.filter(s =>
        s.assigned_class === maxClass &&
        s.behavior_type === type &&
        (type === 'LEADER' && score === 2 ? s.behavior_score >= 2 : s.behavior_score === score)
    ).sort((a, b) => a.academic_score - b.academic_score)[0]; // 성적 낮은 학생 우선 시도 (밸런스 변화 최소화)

    if (!studentA) return false;

    // 교환해올 학생 (해당 수준이 아닌 일반 학생, 성별 동일)
    const candidates = students.filter(s =>
        s.assigned_class === minClass &&
        s.gender === studentA.gender &&
        s.behavior_type === 'NONE' &&
        canSwapForGeneralBalance(studentA, s, minClass, students, groups)
    ).sort((a, b) => Math.abs(a.academic_score - studentA.academic_score)); // 성적 차이가 가장 적은 학생

    if (candidates.length > 0) {
        const studentB = candidates[0];
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }

    return false;
}

/**
 * 성적 평균 균형
 */
function balanceScore(students: Student[], classNames: string[], groups: CustomGroup[]): boolean {
    const classAvgs = classNames.map(cn => {
        const cs = students.filter(s => s.assigned_class === cn);
        const avg = cs.length > 0 ? cs.reduce((sum, s) => sum + s.academic_score, 0) / cs.length : 0;
        return { className: cn, avg, students: cs };
    });

    classAvgs.sort((a, b) => b.avg - a.avg);
    if (classAvgs[0].avg - classAvgs[classAvgs.length - 1].avg <= 30) return false;

    const maxClass = classAvgs[0];
    const minClass = classAvgs[classAvgs.length - 1];

    const s1 = maxClass.students.filter(s => canSwapForGeneralBalance(s, undefined, minClass.className, students, groups)).sort((a, b) => b.academic_score - a.academic_score)[0];
    const s2 = minClass.students.filter(s => canSwapForGeneralBalance(s, s1, maxClass.className, students, groups) && s.gender === s1?.gender && s1?.behavior_type === s.behavior_type).sort((a, b) => a.academic_score - b.academic_score)[0];

    if (s1 && s2) {
        s1.assigned_class = minClass.className;
        s2.assigned_class = maxClass.className;
        return true;
    }
    return false;
}

/**
 * 상극 관계 해결
 */
function fixAvoidViolations(students: Student[], classNames: string[], groups: CustomGroup[], scoreTolerance: number): boolean {
    let fixed = false;
    for (const s1 of students) {
        if (!s1.assigned_class || s1.avoid_ids.length === 0) continue;
        for (const avoidId of s1.avoid_ids) {
            const s2 = students.find(s => s.id === avoidId);
            if (s2 && s2.assigned_class === s1.assigned_class) {
                // 상극 발견
                const classA = s1.assigned_class;
                const otherClasses = classNames.filter(cn => cn !== classA);
                for (const targetClass of otherClasses) {
                    const targetStudent = students.find(s =>
                        s.assigned_class === targetClass &&
                        canSwapForGeneralBalance(s1, s, targetClass, students, groups)
                    );
                    if (targetStudent) {
                        s1.assigned_class = targetClass;
                        targetStudent.assigned_class = classA;
                        fixed = true;
                        break;
                    }
                }
            }
            if (fixed) break;
        }
        if (fixed) break;
    }
    return fixed;
}

function fixKeepViolations(students: Student[], classNames: string[], groups: CustomGroup[], scoreTolerance: number): boolean {
    let fixed = false;
    for (const s1 of students) {
        if (!s1.assigned_class || s1.keep_ids.length === 0) continue;
        for (const keepId of s1.keep_ids) {
            const s2 = students.find(s => s.id === keepId);
            if (s2 && s2.assigned_class && s2.assigned_class !== s1.assigned_class) {
                // 조심스럽게 한 명을 이동
                const classB = s2.assigned_class;
                const classA = s1.assigned_class;

                const targetStudent = students.find(s =>
                    s.assigned_class === classB &&
                    canSwapForGeneralBalance(s1, s, classB, students, groups)
                );
                if (targetStudent) {
                    s1.assigned_class = classB;
                    targetStudent.assigned_class = classA;
                    fixed = true;
                }
            }
            if (fixed) break;
        }
        if (fixed) break;
    }
    return fixed;
}

function balanceCustomGroups(students: Student[], groups: CustomGroup[], classNames: string[], scoreTolerance: number): boolean {
    let fixed = false;
    groups.forEach(group => {
        const counts: Record<string, number> = {};
        classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && group.member_ids.includes(s.id)).length);
        const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
        if (sorted[0][1] - sorted[sorted.length - 1][1] <= 1) return;

        const maxClass = sorted[0][0];
        const minClass = sorted[sorted.length - 1][0];
        const studentA = students.find(s => s.assigned_class === maxClass && group.member_ids.includes(s.id) && !s.fixed_class);
        const studentB = students.find(s => s.assigned_class === minClass && !group.member_ids.includes(s.id) && s.gender === studentA?.gender && !s.fixed_class);
        if (studentA && studentB) {
            studentA.assigned_class = minClass;
            studentB.assigned_class = maxClass;
            fixed = true;
        }
    });
    return fixed;
}

/**
 * 해당 학생을 특정 반에 배정할 경우 제약 조건 위반 여부 확인
 */
function hasViolation(student: Student, targetClass: string, allStudents: Student[], groups: CustomGroup[]): boolean {
    // 1. 상극 관계 확인
    for (const avoidId of student.avoid_ids) {
        const other = allStudents.find(s => s.id === avoidId);
        if (other && other.assigned_class === targetClass) return true;
    }
    // 다른 학생이 이 학생을 상극으로 등록했을 수도 있음
    const isAvoidedByOthers = allStudents.some(other =>
        other.assigned_class === targetClass && other.avoid_ids.includes(student.id)
    );
    if (isAvoidedByOthers) return true;

    // 2. 희망 관계 확인 (희망 관계는 반드시 같은 반이어야 한다는 '제약'이라기보다는 '지향'이므로 
    // 여기서는 이동 시 희망 관계가 '깨지는지' 보다는, '새로운 위반'이 생기는지 위주로 봄.
    // 하지만 일단은 엄격하게 처리하려면 추가 로직 필요)

    // 3. 커스텀 그룹 몰림 확인
    for (const group of groups) {
        if (group.member_ids.includes(student.id)) {
            const groupMemberCount = allStudents.filter(s =>
                s.assigned_class === targetClass &&
                s.id !== student.id && // 자기 자신 제외
                group.member_ids.includes(s.id)
            ).length;
            if (groupMemberCount >= 2) return true; // 한 반에 3명 이상 몰리는 것 방지
        }
    }

    return false;
}

function canSwapForGeneralBalance(s1: Student, s2: Student | undefined, targetClass: string, allStudents: Student[], groups: CustomGroup[]): boolean {
    if (s1.fixed_class) return false;
    if (s2 && s2.fixed_class) return false;
    if (s1.is_pre_transfer || (s2 && s2.is_pre_transfer)) return false;

    // s1이 targetClass로 갈 때 위반이 생기는지
    if (hasViolation(s1, targetClass, allStudents, groups)) return false;

    // s2가 s1의 반으로 올 때 위반이 생기는지
    if (s2 && hasViolation(s2, s1.assigned_class!, allStudents, groups)) return false;

    // 그룹 아이디가 있는 경우, 같은 그룹 아이디를 가진 학생끼리만 교환 가능
    if (s1.group_ids.length > 0 || (s2 && s2.group_ids.length > 0)) {
        if (!s2) return false; // 그룹 아이디가 있는 학생은 단독으로 이동 불가 (짝이 있어야 함)
        if (JSON.stringify(s1.group_ids.sort()) !== JSON.stringify(s2.group_ids.sort())) return false;
    }

    return true;
}

function collectViolations(students: Student[], groups: CustomGroup[], violations: Violation[]) {
    students.forEach(s1 => {
        s1.avoid_ids.forEach(id => {
            const s2 = students.find(s => s.id === id);
            if (s2 && s2.assigned_class === s1.assigned_class) {
                if (!violations.some(v => v.type === 'AVOID' && v.studentIds.includes(s1.id) && v.studentIds.includes(s2.id))) {
                    violations.push({ type: 'AVOID', message: `${s1.name}와 ${s2.name} 상극 위반`, studentIds: [s1.id, s2.id], className: s1.assigned_class || undefined });
                }
            }
        });
        s1.keep_ids.forEach(id => {
            const s2 = students.find(s => s.id === id);
            if (s2 && s2.assigned_class && s2.assigned_class !== s1.assigned_class) {
                if (!violations.some(v => v.type === 'KEEP' && v.studentIds.includes(s1.id) && v.studentIds.includes(s2.id))) {
                    violations.push({ type: 'KEEP', message: `${s1.name}와 ${s2.name} 단짝 위반`, studentIds: [s1.id, s2.id], className: s1.assigned_class || undefined });
                }
            }
        });
    });
}

function fillUnassignedStudents(students: Student[], classNames: string[]) {
    const unassigned = students.filter(s => !s.assigned_class);
    unassigned.sort((a, b) => b.academic_score - a.academic_score);
    unassigned.forEach(s => {
        const counts = classNames.map(cn => ({ name: cn, count: students.filter(st => st.assigned_class === cn).length }));
        counts.sort((a, b) => a.count - b.count);
        s.assigned_class = counts[0].name;
    });
}


function shuffleArray<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function shuffleSimilarScores(students: Student[], tolerance: number = 10) {
    for (let i = 0; i < students.length - 1; i++) {
        if (Math.abs(students[i].academic_score - students[i + 1].academic_score) <= tolerance && Math.random() > 0.5) {
            [students[i], students[i + 1]] = [students[i + 1], students[i]];
        }
    }
}

// ============================================================================
// v1.2.1 신규 배정 전용 최적화 함수들 (현재배정수정 모드에는 영향 없음)
// ============================================================================

interface BalanceStatsV121 {
    studentCountImbalance: number;
    genderImbalance: number;
    leaderImbalance: number;
    behaviorImbalance: number;
    emotionalImbalance: number;
    totalBehaviorEmotionalImbalance: number;
    scoreImbalance: number;
    scoreMinus3Imbalance: number;
    scoreMinus2Imbalance: number;
    scoreMinus1Imbalance: number;
    scorePlus1Imbalance: number;
    scorePlus2Imbalance: number;
    behaviorTotalImbalance: number;
    leaderScoreTotalImbalance: number;
    behaviorOnlyScoreTotalImbalance: number;
    emotionalOnlyScoreTotalImbalance: number;
}

function getBalanceStatsV121(students: Student[], classNames: string[]): BalanceStatsV121 {
    const classCounts: Record<string, {
        total: number; male: number; female: number;
        leader: number; behavior: number; emotional: number; behaviorEmotional: number;
        scoreSum: number;
        scoreMinus3: number; scoreMinus2: number; scoreMinus1: number;
        scorePlus1: number; scorePlus2: number;
        behaviorTotal: number;
        leaderScoreTotal: number; behaviorOnlyScoreTotal: number; emotionalOnlyScoreTotal: number;
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
            behaviorTotal: classStudents.reduce((sum, s) => sum + s.behavior_score, 0),
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
        leaderScoreTotalImbalance: getImbalance(v => v.leaderScoreTotal),
        behaviorOnlyScoreTotalImbalance: getImbalance(v => v.behaviorOnlyScoreTotal),
        emotionalOnlyScoreTotalImbalance: getImbalance(v => v.emotionalOnlyScoreTotal),
    };
}

function isBalancedV121(stats: BalanceStatsV121): boolean {
    return stats.studentCountImbalance <= BALANCE_TOLERANCE &&
        stats.genderImbalance <= BALANCE_TOLERANCE &&
        stats.leaderImbalance <= BALANCE_TOLERANCE &&
        stats.behaviorImbalance <= BALANCE_TOLERANCE &&
        stats.emotionalImbalance <= BALANCE_TOLERANCE &&
        stats.totalBehaviorEmotionalImbalance <= BALANCE_TOLERANCE + 1 &&
        stats.scoreImbalance <= 30 &&
        stats.behaviorTotalImbalance <= 2;
}

function canSwapForGeneralBalanceV121(studentA: Student, studentB: Student | undefined, targetClass: string): boolean {
    if (studentA.fixed_class) return false;
    if (studentB && studentB.fixed_class) return false;
    if (studentA.is_pre_transfer) {
        if (!studentB || !studentB.is_pre_transfer) return false;
    }
    if (studentB && studentB.is_pre_transfer) {
        if (!studentA.is_pre_transfer) return false;
    }
    const aGroups = studentA.group_ids || [];
    const bGroups = studentB ? (studentB.group_ids || []) : [];
    if (aGroups.length > 0) {
        if (!studentB) return false;
        if (aGroups.length !== bGroups.length) return false;
        const bGroupSet = new Set(bGroups);
        if (!aGroups.every(g => bGroupSet.has(g))) return false;
    }
    if (bGroups.length > 0 && aGroups.length === 0) return false;
    if (studentA.avoid_ids && studentA.avoid_ids.length > 0) return false;
    if (studentB && studentB.avoid_ids && studentB.avoid_ids.length > 0) return false;
    if (studentA.keep_ids && studentA.keep_ids.length > 0) return false;
    if (studentB && studentB.keep_ids && studentB.keep_ids.length > 0) return false;
    return true;
}

function balanceStudentCountV121(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentToMove = students.find(s => s.assigned_class === maxClass && canSwapForGeneralBalanceV121(s, undefined, minClass));
    if (studentToMove) {
        studentToMove.assigned_class = minClass;
        return true;
    }
    return false;
}

function balanceGenderV121(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    for (const gender of ['M', 'F'] as const) {
        const counts: Record<string, number> = {};
        classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.gender === gender).length);
        const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
        if (sorted[0][1] - sorted[sorted.length - 1][1] > BALANCE_TOLERANCE) {
            const maxClass = sorted[0][0];
            const minClass = sorted[sorted.length - 1][0];
            const studentA = students.find(s => s.assigned_class === maxClass && s.gender === gender && !s.fixed_class);
            if (!studentA) continue;
            const studentB = students.find(s =>
                s.assigned_class === minClass && s.gender !== gender &&
                canSwapForGeneralBalanceV121(studentA, s, minClass) &&
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

function balanceTypeV121(students: Student[], classNames: string[], type: 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL', scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === type).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_type === type && !s.fixed_class);
    if (!studentA) return false;
    const studentB = students.find(s =>
        s.assigned_class === minClass && s.behavior_type === 'NONE' &&
        canSwapForGeneralBalanceV121(studentA, s, minClass) &&
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

function balanceBehaviorEmotionalTotalV121(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && (s.behavior_type === 'BEHAVIOR' || s.behavior_type === 'EMOTIONAL')).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE + 1) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && (s.behavior_type === 'BEHAVIOR' || s.behavior_type === 'EMOTIONAL') && !s.fixed_class);
    if (!studentA) return false;
    const studentB = students.find(s =>
        s.assigned_class === minClass && s.behavior_type === 'NONE' &&
        canSwapForGeneralBalanceV121(studentA, s, minClass) &&
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

function balanceByScoreV121(students: Student[], classNames: string[], targetScore: number, scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_score === targetScore).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_score === targetScore && !s.fixed_class);
    if (!studentA) return false;
    const studentB = students.find(s =>
        s.assigned_class === minClass && s.behavior_score === 0 &&
        canSwapForGeneralBalanceV121(studentA, s, minClass) &&
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

function balanceBehaviorTotalV121(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn).reduce((sum, s) => sum + s.behavior_score, 0));
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= 2) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    // 총점이 높은(양수) 반에서 양수 학생을, 낮은(음수) 반으로 이동
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_score > 0 && !s.fixed_class);
    if (!studentA) return false;
    const studentB = students.find(s =>
        s.assigned_class === minClass && s.behavior_score <= 0 &&
        canSwapForGeneralBalanceV121(studentA, s, minClass) &&
        s.gender === studentA.gender
    );
    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }
    return false;
}

function balanceTypeScoreTotalV121(students: Student[], classNames: string[], type: 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL', scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === type).reduce((sum, s) => sum + s.behavior_score, 0));
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= 2) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_type === type && s.behavior_score > 0 && !s.fixed_class);
    if (!studentA) return false;
    const studentB = students.find(s =>
        s.assigned_class === minClass && s.behavior_type === 'NONE' &&
        canSwapForGeneralBalanceV121(studentA, s, minClass) &&
        s.gender === studentA.gender
    );
    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }
    return false;
}

function balanceByTypeAndScoreV121(students: Student[], classNames: string[], type: 'LEADER' | 'BEHAVIOR' | 'EMOTIONAL', targetScore: number, scoreTolerance: number): boolean {
    const counts: Record<string, number> = {};
    classNames.forEach(cn => counts[cn] = students.filter(s => s.assigned_class === cn && s.behavior_type === type && s.behavior_score === targetScore).length);
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= BALANCE_TOLERANCE) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.behavior_type === type && s.behavior_score === targetScore && !s.fixed_class);
    if (!studentA) return false;
    const studentB = students.find(s =>
        s.assigned_class === minClass && s.behavior_type === 'NONE' &&
        canSwapForGeneralBalanceV121(studentA, s, minClass) &&
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

function balanceScoreV121(students: Student[], classNames: string[]): boolean {
    const avgScores: Record<string, number> = {};
    classNames.forEach(cn => {
        const classStudents = students.filter(s => s.assigned_class === cn);
        avgScores[cn] = classStudents.length > 0 ? classStudents.reduce((sum, s) => sum + s.academic_score, 0) / classStudents.length : 0;
    });
    const sorted = Object.entries(avgScores).sort(([, a], [, b]) => b - a);
    if (sorted[0][1] - sorted[sorted.length - 1][1] <= 30) return false;
    const maxClass = sorted[0][0];
    const minClass = sorted[sorted.length - 1][0];
    const studentA = students.find(s => s.assigned_class === maxClass && s.academic_score > avgScores[maxClass] && canSwapForGeneralBalanceV121(s, undefined, minClass));
    const studentB = students.find(s => s.assigned_class === minClass && s.academic_score < avgScores[minClass] && studentA && canSwapForGeneralBalanceV121(studentA, s, minClass) && s.gender === studentA.gender);
    if (studentA && studentB) {
        studentA.assigned_class = minClass;
        studentB.assigned_class = maxClass;
        return true;
    }
    return false;
}

function fixAvoidViolationsV121(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    for (const student of students) {
        if (!student.assigned_class) continue;
        for (const avoidId of student.avoid_ids) {
            const avoidStudent = students.find(s => s.id === avoidId);
            if (avoidStudent && avoidStudent.assigned_class === student.assigned_class) {
                const otherClass = classNames.find(cn => cn !== student.assigned_class);
                if (otherClass) {
                    const candidates = students.filter(s =>
                        s.assigned_class === otherClass && s.gender === student.gender &&
                        s.behavior_type === student.behavior_type && !s.fixed_class && !s.is_pre_transfer &&
                        Math.abs(s.academic_score - student.academic_score) <= scoreTolerance
                    );
                    let swapCandidate = candidates.find(s => canSwapForGeneralBalanceV121(student, s, otherClass));
                    if (!swapCandidate) swapCandidate = candidates[0];
                    if (swapCandidate && !student.fixed_class) {
                        const tempClass = student.assigned_class;
                        student.assigned_class = swapCandidate.assigned_class;
                        swapCandidate.assigned_class = tempClass;
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function fixKeepViolationsV121(students: Student[], classNames: string[], scoreTolerance: number): boolean {
    for (const student of students) {
        if (!student.assigned_class || student.keep_ids.length === 0) continue;
        for (const keepId of student.keep_ids) {
            const keepStudent = students.find(s => s.id === keepId);
            if (keepStudent && keepStudent.assigned_class && keepStudent.assigned_class !== student.assigned_class) {
                // 둘 중 하나를 이동시켜서 같은 반으로 만들기
                const targetClass = keepStudent.assigned_class;
                const swapCandidate = students.find(s =>
                    s.assigned_class === targetClass && s.id !== keepStudent.id &&
                    !s.fixed_class && s.gender === student.gender &&
                    canSwapForGeneralBalanceV121(student, s, targetClass)
                );
                if (swapCandidate && !student.fixed_class) {
                    student.assigned_class = targetClass;
                    swapCandidate.assigned_class = student.assigned_class;
                    return true;
                }
            }
        }
    }
    return false;
}

function balanceCustomGroupsV121(students: Student[], groups: CustomGroup[], classNames: string[], scoreTolerance: number): boolean {
    for (const group of groups) {
        const classCount: Record<string, number> = {};
        classNames.forEach(cn => classCount[cn] = 0);
        students.forEach(s => {
            if (group.member_ids.includes(s.id) && s.assigned_class) classCount[s.assigned_class]++;
        });
        const sorted = Object.entries(classCount).sort(([, a], [, b]) => b - a);
        if (sorted[0][1] - sorted[sorted.length - 1][1] > 1) {
            const sourceClass = sorted[0][0];
            const targetClass = sorted[sorted.length - 1][0];
            const studentToMove = students.find(s => s.assigned_class === sourceClass && group.member_ids.includes(s.id) && !s.fixed_class);
            if (studentToMove) {
                const swapCandidate = students.find(s =>
                    s.assigned_class === targetClass && !group.member_ids.includes(s.id) &&
                    s.gender === studentToMove.gender && !s.fixed_class
                );
                if (swapCandidate) {
                    studentToMove.assigned_class = targetClass;
                    swapCandidate.assigned_class = sourceClass;
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * v1.2.1 신규 배정 전용 최적화 함수
 * 현재배정수정(optimize) 모드에는 영향 없음
 */
function optimizeBalanceForNewMode(
    students: Student[],
    classNames: string[],
    groups: CustomGroup[],
    scoreTolerance: number
): Student[] {
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
        iteration++;
        let improved = false;

        const stats = getBalanceStatsV121(students, classNames);

        // 1. 전체 학생 수 균형
        if (stats.studentCountImbalance > BALANCE_TOLERANCE) {
            if (balanceStudentCountV121(students, classNames, scoreTolerance)) improved = true;
        }

        // 2. 성비 균형
        if (stats.genderImbalance > BALANCE_TOLERANCE) {
            if (balanceGenderV121(students, classNames, scoreTolerance)) improved = true;
        }

        // 3. 리더형 균형
        if (stats.leaderImbalance > BALANCE_TOLERANCE) {
            if (balanceTypeV121(students, classNames, 'LEADER', scoreTolerance)) improved = true;
        }

        // 4. 행동형 균형
        if (stats.behaviorImbalance > BALANCE_TOLERANCE) {
            if (balanceTypeV121(students, classNames, 'BEHAVIOR', scoreTolerance)) improved = true;
        }

        // 5. 정서형 균형
        if (stats.emotionalImbalance > BALANCE_TOLERANCE) {
            if (balanceTypeV121(students, classNames, 'EMOTIONAL', scoreTolerance)) improved = true;
        }

        // 6. 행동형+정서형 합계 균형
        if (stats.totalBehaviorEmotionalImbalance > BALANCE_TOLERANCE) {
            if (balanceBehaviorEmotionalTotalV121(students, classNames, scoreTolerance)) improved = true;
        }

        // 7. 점수별 균형 (-3, -2, -1, +1, +2)
        if (stats.scoreMinus3Imbalance > BALANCE_TOLERANCE) {
            if (balanceByScoreV121(students, classNames, -3, scoreTolerance)) improved = true;
        }
        if (stats.scoreMinus2Imbalance > BALANCE_TOLERANCE) {
            if (balanceByScoreV121(students, classNames, -2, scoreTolerance)) improved = true;
        }
        if (stats.scoreMinus1Imbalance > BALANCE_TOLERANCE) {
            if (balanceByScoreV121(students, classNames, -1, scoreTolerance)) improved = true;
        }
        if (stats.scorePlus1Imbalance > BALANCE_TOLERANCE) {
            if (balanceByScoreV121(students, classNames, 1, scoreTolerance)) improved = true;
        }
        if (stats.scorePlus2Imbalance > BALANCE_TOLERANCE) {
            if (balanceByScoreV121(students, classNames, 2, scoreTolerance)) improved = true;
        }

        // 8. 생활지도 총점 균형
        if (stats.behaviorTotalImbalance > 2) {
            if (balanceBehaviorTotalV121(students, classNames, scoreTolerance)) improved = true;
        }

        // 8-1. 유형별 점수 총합 균형
        if (stats.leaderScoreTotalImbalance > 2) {
            if (balanceTypeScoreTotalV121(students, classNames, 'LEADER', scoreTolerance)) improved = true;
        }
        if (stats.behaviorOnlyScoreTotalImbalance > 2) {
            if (balanceTypeScoreTotalV121(students, classNames, 'BEHAVIOR', scoreTolerance)) improved = true;
        }
        if (stats.emotionalOnlyScoreTotalImbalance > 2) {
            if (balanceTypeScoreTotalV121(students, classNames, 'EMOTIONAL', scoreTolerance)) improved = true;
        }

        // 8-4. 유형+점수별 세분화 균형
        if (balanceByTypeAndScoreV121(students, classNames, 'BEHAVIOR', -3, scoreTolerance)) improved = true;
        if (balanceByTypeAndScoreV121(students, classNames, 'BEHAVIOR', -2, scoreTolerance)) improved = true;
        if (balanceByTypeAndScoreV121(students, classNames, 'BEHAVIOR', -1, scoreTolerance)) improved = true;
        if (balanceByTypeAndScoreV121(students, classNames, 'EMOTIONAL', -3, scoreTolerance)) improved = true;
        if (balanceByTypeAndScoreV121(students, classNames, 'EMOTIONAL', -2, scoreTolerance)) improved = true;
        if (balanceByTypeAndScoreV121(students, classNames, 'EMOTIONAL', -1, scoreTolerance)) improved = true;
        if (balanceByTypeAndScoreV121(students, classNames, 'LEADER', 2, scoreTolerance)) improved = true;
        if (balanceByTypeAndScoreV121(students, classNames, 'LEADER', 1, scoreTolerance)) improved = true;

        // 9. 성적 평균 균형
        if (stats.scoreImbalance > 30) {
            if (balanceScoreV121(students, classNames)) improved = true;
        }

        // 10. 상극 관계 해결
        if (fixAvoidViolationsV121(students, classNames, scoreTolerance)) improved = true;

        // 10-2. 같은 반 희망 해결
        if (fixKeepViolationsV121(students, classNames, scoreTolerance)) improved = true;

        // 11. 커스텀 그룹 균형
        if (balanceCustomGroupsV121(students, groups, classNames, scoreTolerance)) improved = true;

        if (!improved || isBalancedV121(stats)) break;
    }

    return students;
}

// ============================================================================
// 신규 배정 전용 후처리: 피함/함께 관계 강제 해결
// ============================================================================

interface SwapCandidate {
    studentA: Student;
    studentB: Student;
    cost: number;
}

/**
 * 피해야 할 관계(Avoid)와 같은 반 희망(Keep) 제약을 강제로 해결
 * 최적화 루프에서 해결되지 않은 위반을 다양한 전략으로 시도
 */
function forceFixRelationConstraints(students: Student[], classNames: string[]): Student[] {
    const attemptedSwaps = new Set<string>();

    // 위반 수집 함수
    const getAvoidViolations = () => {
        const violations: { studentA: Student; studentB: Student }[] = [];
        for (const student of students) {
            for (const avoidId of student.avoid_ids) {
                const target = students.find(s => s.id === avoidId);
                if (target && student.assigned_class === target.assigned_class) {
                    // 중복 방지 (A-B와 B-A는 같은 위반)
                    const key = [student.id, target.id].sort().join('|');
                    if (!violations.some(v => [v.studentA.id, v.studentB.id].sort().join('|') === key)) {
                        violations.push({ studentA: student, studentB: target });
                    }
                }
            }
        }
        return violations;
    };

    const getKeepViolations = () => {
        const violations: { studentA: Student; studentB: Student }[] = [];
        for (const student of students) {
            for (const keepId of student.keep_ids) {
                const target = students.find(s => s.id === keepId);
                if (target && student.assigned_class !== target.assigned_class) {
                    const key = [student.id, target.id].sort().join('|');
                    if (!violations.some(v => [v.studentA.id, v.studentB.id].sort().join('|') === key)) {
                        violations.push({ studentA: student, studentB: target });
                    }
                }
            }
        }
        return violations;
    };

    // 교환 비용 계산 (낮을수록 좋음)
    const calculateSwapCost = (studentA: Student, studentB: Student): number => {
        if (studentA.fixed_class || studentB.fixed_class) return Infinity; // 고정배정은 이동 불가

        const classA = studentA.assigned_class!;
        const classB = studentB.assigned_class!;

        // 교환 후 새로운 avoid 위반이 생기는지 확인
        for (const avoidId of studentA.avoid_ids) {
            const avoidTarget = students.find(s => s.id === avoidId);
            if (avoidTarget && avoidTarget.assigned_class === classB && avoidTarget.id !== studentB.id) {
                return Infinity; // 새로운 위반 생성
            }
        }
        for (const avoidId of studentB.avoid_ids) {
            const avoidTarget = students.find(s => s.id === avoidId);
            if (avoidTarget && avoidTarget.assigned_class === classA && avoidTarget.id !== studentA.id) {
                return Infinity;
            }
        }

        // 균형 영향 계산
        let cost = 0;

        // 성별 균형 영향
        if (studentA.gender !== studentB.gender) {
            cost += 10;
        }

        // 점수 차이 영향
        cost += Math.abs(studentA.academic_score - studentB.academic_score) / 10;

        // 행동유형 영향
        if (studentA.behavior_type !== studentB.behavior_type) {
            cost += 5;
        }

        // 행동점수 영향
        cost += Math.abs(studentA.behavior_score - studentB.behavior_score);

        return cost;
    };

    // 교환 실행
    const executeSwap = (studentA: Student, studentB: Student) => {
        const tempClass = studentA.assigned_class;
        studentA.assigned_class = studentB.assigned_class;
        studentB.assigned_class = tempClass;
    };

    // 교환 키 생성
    const getSwapKey = (idA: string, idB: string) => [idA, idB].sort().join('↔');

    // 전략 1: 단순 교환 시도 (동성 우선)
    const trySimpleSwap = (studentToMove: Student, targetClass: string): boolean => {
        const candidates: SwapCandidate[] = [];

        for (const candidate of students) {
            if (candidate.assigned_class !== targetClass) continue;
            if (candidate.fixed_class) continue;

            const swapKey = getSwapKey(studentToMove.id, candidate.id);
            if (attemptedSwaps.has(swapKey)) continue;

            const cost = calculateSwapCost(studentToMove, candidate);
            if (cost < Infinity) {
                candidates.push({ studentA: studentToMove, studentB: candidate, cost });
            }
        }

        if (candidates.length === 0) return false;

        // 동성 우선 교환: 같은 성별 후보 먼저 시도
        const sameGenderCandidates = candidates.filter(c =>
            c.studentB.gender === studentToMove.gender
        );

        let best: SwapCandidate;
        if (sameGenderCandidates.length > 0) {
            // 같은 성별 중 최저 비용 선택
            sameGenderCandidates.sort((a, b) => a.cost - b.cost);
            best = sameGenderCandidates[0];
        } else {
            // 같은 성별 없으면 다른 성별도 허용 (피함/함께 해결이 우선)
            candidates.sort((a, b) => a.cost - b.cost);
            best = candidates[0];
        }

        attemptedSwaps.add(getSwapKey(best.studentA.id, best.studentB.id));
        executeSwap(best.studentA, best.studentB);
        return true;
    };

    // 전략 2: 체인 교환 (A↔X, 이후 상황 개선) - 동성 우선
    const tryChainSwap = (studentToMove: Student, targetClass: string): boolean => {
        // 중간 반을 경유하는 2단계 교환 시도
        for (const midClass of classNames) {
            if (midClass === studentToMove.assigned_class || midClass === targetClass) continue;

            // 동성 우선: 같은 성별 중간 학생 먼저 시도
            const midCandidates = students.filter(s => s.assigned_class === midClass && !s.fixed_class);
            const sortedMidCandidates = [
                ...midCandidates.filter(s => s.gender === studentToMove.gender),
                ...midCandidates.filter(s => s.gender !== studentToMove.gender)
            ];

            // 1단계: studentToMove를 midClass로
            for (const midStudent of sortedMidCandidates) {
                const swapKey1 = getSwapKey(studentToMove.id, midStudent.id);
                if (attemptedSwaps.has(swapKey1)) continue;

                const cost1 = calculateSwapCost(studentToMove, midStudent);
                if (cost1 >= Infinity) continue;

                // 임시 교환
                executeSwap(studentToMove, midStudent);
                attemptedSwaps.add(swapKey1);

                // 2단계: studentToMove(이제 midClass)를 targetClass로 - 동성 우선
                const finalCandidates = students.filter(s => s.assigned_class === targetClass && !s.fixed_class);
                const sortedFinalCandidates = [
                    ...finalCandidates.filter(s => s.gender === studentToMove.gender),
                    ...finalCandidates.filter(s => s.gender !== studentToMove.gender)
                ];

                for (const finalStudent of sortedFinalCandidates) {
                    const swapKey2 = getSwapKey(studentToMove.id, finalStudent.id);
                    if (attemptedSwaps.has(swapKey2)) continue;

                    const cost2 = calculateSwapCost(studentToMove, finalStudent);
                    if (cost2 < Infinity) {
                        executeSwap(studentToMove, finalStudent);
                        attemptedSwaps.add(swapKey2);
                        return true;
                    }
                }

                // 2단계 실패 시 1단계 롤백
                executeSwap(studentToMove, midStudent);
            }
        }
        return false;
    };

    // 전략 3: 3자 순환 교환 (A→B반, B→C반, C→A반) - 동성 우선
    const tryTriangleSwap = (studentA: Student, targetClass: string): boolean => {
        const originalClass = studentA.assigned_class!;
        if (studentA.fixed_class) return false;

        // 동성 우선: studentB와 studentC 모두 같은 성별 먼저 시도
        const targetCandidates = students.filter(s => s.assigned_class === targetClass && !s.fixed_class);
        const sortedTargetCandidates = [
            ...targetCandidates.filter(s => s.gender === studentA.gender),
            ...targetCandidates.filter(s => s.gender !== studentA.gender)
        ];

        for (const studentB of sortedTargetCandidates) {
            const thirdCandidates = students.filter(s =>
                s.assigned_class !== originalClass &&
                s.assigned_class !== targetClass &&
                !s.fixed_class
            );
            const sortedThirdCandidates = [
                ...thirdCandidates.filter(s => s.gender === studentA.gender),
                ...thirdCandidates.filter(s => s.gender !== studentA.gender)
            ];

            for (const studentC of sortedThirdCandidates) {
                // A→targetClass, B→C's class, C→originalClass
                const key = `△${studentA.id}|${studentB.id}|${studentC.id}`;
                if (attemptedSwaps.has(key)) continue;

                // 비용 체크 (간단히 avoid 위반만)
                const aToTarget = !studentA.avoid_ids.some(id =>
                    students.find(s => s.id === id)?.assigned_class === targetClass
                );
                const bToC = !studentB.avoid_ids.some(id =>
                    students.find(s => s.id === id)?.assigned_class === studentC.assigned_class
                );
                const cToOrig = !studentC.avoid_ids.some(id =>
                    students.find(s => s.id === id)?.assigned_class === originalClass
                );

                if (aToTarget && bToC && cToOrig) {
                    const cClass = studentC.assigned_class;
                    studentA.assigned_class = targetClass;
                    studentB.assigned_class = cClass;
                    studentC.assigned_class = originalClass;
                    attemptedSwaps.add(key);
                    return true;
                }

                attemptedSwaps.add(key);
            }
        }
        return false;
    };

    // 메인 로직: Avoid 먼저, Keep 나중
    let avoidViolations = getAvoidViolations();
    let keepViolations = getKeepViolations();

    // Avoid 위반 해결 (반드시 분리해야 함)
    for (const violation of avoidViolations) {
        // 현재도 같은 반인지 다시 확인
        if (violation.studentA.assigned_class !== violation.studentB.assigned_class) continue;

        const currentClass = violation.studentA.assigned_class!;
        const otherClasses = classNames.filter(c => c !== currentClass);

        let solved = false;

        // A를 다른 반으로 (전략 1, 2, 3 순서)
        for (const targetClass of otherClasses) {
            if (!violation.studentA.fixed_class) {
                if (trySimpleSwap(violation.studentA, targetClass)) { solved = true; break; }
            }
        }

        if (!solved) {
            for (const targetClass of otherClasses) {
                if (!violation.studentA.fixed_class) {
                    if (tryChainSwap(violation.studentA, targetClass)) { solved = true; break; }
                }
            }
        }

        if (!solved) {
            for (const targetClass of otherClasses) {
                if (!violation.studentA.fixed_class) {
                    if (tryTriangleSwap(violation.studentA, targetClass)) { solved = true; break; }
                }
            }
        }

        // A 실패 시 B 시도
        if (!solved && violation.studentA.assigned_class === violation.studentB.assigned_class) {
            for (const targetClass of otherClasses) {
                if (!violation.studentB.fixed_class) {
                    if (trySimpleSwap(violation.studentB, targetClass)) { solved = true; break; }
                }
            }

            if (!solved) {
                for (const targetClass of otherClasses) {
                    if (!violation.studentB.fixed_class) {
                        if (tryChainSwap(violation.studentB, targetClass)) { solved = true; break; }
                    }
                }
            }

            if (!solved) {
                for (const targetClass of otherClasses) {
                    if (!violation.studentB.fixed_class) {
                        if (tryTriangleSwap(violation.studentB, targetClass)) { solved = true; break; }
                    }
                }
            }
        }
    }

    // Keep 위반 해결 (가능하면 같은 반으로)
    keepViolations = getKeepViolations(); // 갱신

    for (const violation of keepViolations) {
        // 현재도 다른 반인지 다시 확인
        if (violation.studentA.assigned_class === violation.studentB.assigned_class) continue;

        let solved = false;

        // A를 B의 반으로 이동 시도
        const targetClass = violation.studentB.assigned_class!;
        if (!violation.studentA.fixed_class) {
            if (trySimpleSwap(violation.studentA, targetClass)) solved = true;
            if (!solved) solved = tryChainSwap(violation.studentA, targetClass);
            if (!solved) solved = tryTriangleSwap(violation.studentA, targetClass);
        }

        // A 실패 시 B를 A의 반으로 이동 시도
        if (!solved && violation.studentA.assigned_class !== violation.studentB.assigned_class) {
            const targetClass2 = violation.studentA.assigned_class!;
            if (!violation.studentB.fixed_class) {
                if (trySimpleSwap(violation.studentB, targetClass2)) solved = true;
                if (!solved) solved = tryChainSwap(violation.studentB, targetClass2);
                if (!solved) solved = tryTriangleSwap(violation.studentB, targetClass2);
            }
        }
    }

    return students;
}

// ============================================================================
// 신규 배정 전용 후처리: 자유 학생 교환으로 성적 균형 보정
// ============================================================================

/**
 * 제약 조건이 없는 "자유로운 학생"들끼리 교환하여 반별 성적 균형을 맞춤
 */
function balanceScoresWithFreeStudents(students: Student[], classNames: string[], groups: CustomGroup[]): Student[] {
    const MAX_ITERATIONS = 20;
    const SCORE_TOLERANCE = 3; // 평균 점수 차이 허용 범위

    // 자유로운 학생인지 확인
    const isFreeStudent = (s: Student): boolean => {
        return (
            s.avoid_ids.length === 0 &&
            s.keep_ids.length === 0 &&
            !s.fixed_class &&
            !s.is_pre_transfer &&
            !groups.some(g => g.member_ids.includes(s.id))
        );
    };

    // 반별 평균 점수 계산
    const getClassAverages = (): { className: string; avg: number; students: Student[] }[] => {
        return classNames.map(cn => {
            const classStudents = students.filter(s => s.assigned_class === cn);
            const avg = classStudents.length > 0
                ? classStudents.reduce((sum, s) => sum + s.academic_score, 0) / classStudents.length
                : 0;
            return { className: cn, avg, students: classStudents };
        });
    };

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const classStats = getClassAverages();
        classStats.sort((a, b) => b.avg - a.avg);

        const highestClass = classStats[0];
        const lowestClass = classStats[classStats.length - 1];
        const scoreDiff = highestClass.avg - lowestClass.avg;

        // 허용 범위 내면 종료
        if (scoreDiff <= SCORE_TOLERANCE) break;

        // 높은 반에서 자유 학생 중 고득점자 찾기
        const freeHighStudents = highestClass.students
            .filter(isFreeStudent)
            .sort((a, b) => b.academic_score - a.academic_score);

        // 낮은 반에서 자유 학생 중 저득점자 찾기
        const freeLowStudents = lowestClass.students
            .filter(isFreeStudent)
            .sort((a, b) => a.academic_score - b.academic_score);

        if (freeHighStudents.length === 0 || freeLowStudents.length === 0) break;

        // 교환 가능한 쌍 찾기 (동성 + 같은 행동유형)
        let swapped = false;
        for (const highStudent of freeHighStudents) {
            for (const lowStudent of freeLowStudents) {
                // 동성 체크
                if (highStudent.gender !== lowStudent.gender) continue;

                // 같은 행동유형 체크 (둘 다 NONE이거나 같은 유형)
                if (highStudent.behavior_type !== lowStudent.behavior_type) continue;

                // 교환이 개선을 가져오는지 확인
                const scoreDiffAfter = highStudent.academic_score - lowStudent.academic_score;
                if (scoreDiffAfter <= 0) continue; // 개선 없음

                // 교환 실행
                highStudent.assigned_class = lowestClass.className;
                lowStudent.assigned_class = highestClass.className;
                swapped = true;
                break;
            }
            if (swapped) break;
        }

        // 교환 못했으면 종료
        if (!swapped) break;
    }

    return students;
}

/**
 * 제약 조건이 없는 "자유로운 학생"들끼리 교환하여 반별 성별 균형을 맞춤
 */
function balanceGenderWithFreeStudents(students: Student[], classNames: string[], groups: CustomGroup[]): Student[] {
    const MAX_ITERATIONS = 20;
    const GENDER_TOLERANCE = 2; // 남녀 차이 허용 범위

    // 자유로운 학생인지 확인
    const isFreeStudent = (s: Student): boolean => {
        return (
            s.avoid_ids.length === 0 &&
            s.keep_ids.length === 0 &&
            !s.fixed_class &&
            !s.is_pre_transfer &&
            !groups.some(g => g.member_ids.includes(s.id))
        );
    };

    // 반별 성별 통계 계산
    const getClassGenderStats = (): { className: string; maleCount: number; femaleCount: number; diff: number; students: Student[] }[] => {
        return classNames.map(cn => {
            const classStudents = students.filter(s => s.assigned_class === cn);
            const maleCount = classStudents.filter(s => s.gender === 'M').length;
            const femaleCount = classStudents.filter(s => s.gender === 'F').length;
            return {
                className: cn,
                maleCount,
                femaleCount,
                diff: maleCount - femaleCount, // 양수: 남초, 음수: 여초
                students: classStudents
            };
        });
    };

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const classStats = getClassGenderStats();

        // 가장 남초인 반과 가장 여초인 반 찾기
        classStats.sort((a, b) => b.diff - a.diff);
        const maleHeavyClass = classStats[0]; // 가장 남초
        const femaleHeavyClass = classStats[classStats.length - 1]; // 가장 여초

        // 둘 다 허용 범위 내면 종료
        if (Math.abs(maleHeavyClass.diff) <= GENDER_TOLERANCE &&
            Math.abs(femaleHeavyClass.diff) <= GENDER_TOLERANCE) break;

        // 남초 반에서 여초 반으로 균형 맞추기
        // 남초 반에서 남자 하나를 여초 반의 여자와 교환
        if (maleHeavyClass.diff > GENDER_TOLERANCE && femaleHeavyClass.diff < -GENDER_TOLERANCE) {
            // 남초 반의 자유 남학생
            const freeMales = maleHeavyClass.students
                .filter(s => s.gender === 'M' && isFreeStudent(s))
                .sort((a, b) => a.academic_score - b.academic_score); // 낮은 점수 우선 (성적 영향 최소화)

            // 여초 반의 자유 여학생
            const freeFemales = femaleHeavyClass.students
                .filter(s => s.gender === 'F' && isFreeStudent(s))
                .sort((a, b) => b.academic_score - a.academic_score); // 높은 점수 우선 (균형)

            if (freeMales.length === 0 || freeFemales.length === 0) break;

            let swapped = false;
            for (const male of freeMales) {
                for (const female of freeFemales) {
                    // 같은 행동유형 체크
                    if (male.behavior_type !== female.behavior_type) continue;

                    // 교환 실행
                    male.assigned_class = femaleHeavyClass.className;
                    female.assigned_class = maleHeavyClass.className;
                    swapped = true;
                    break;
                }
                if (swapped) break;
            }

            if (!swapped) break;
        } else {
            break; // 교환 조건 불충족
        }
    }

    return students;
}

