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
        // 10회 시행 중 가장 점수가 좋은 결과 선택
        let bestResult: Student[] | null = null;
        let bestScore = Infinity;

        for (let trial = 0; trial < 10; trial++) {
            const trialStudents = students.map(s => ({
                ...s,
                assigned_class: s.fixed_class || null
            }));

            // 고정 배정되지 않은 학생들 섞기
            shuffleArray(trialStudents);

            // 초기 배정 실행
            const assigned = balancedInitialAssignment(trialStudents, classNames, groups, useAdvancedConstraints);

            // 최적화 루프 실행 (신규 배정 모드는 공격적 최적화 미사용 - optimizeBalance 내부에서 플래그로 제어)
            const optimized = optimizeBalance(assigned, classNames, groups, scoreTolerance, false, useAdvancedConstraints);

            // 전출생 검증
            validatePreTransferDistribution(optimized, classNames);

            // 균형 상태 계산
            const stats = getImbalanceStats(optimized, classNames, groups);
            const trialScore =
                (stats.genderImbalance * 100) +
                (stats.studentCountImbalance * 50) +
                (stats.scoreImbalance * 1) +
                (stats.behaviorTotalImbalance * 20) +
                (stats.scoreMinus3Imbalance * 30);

            if (trialScore < bestScore) {
                bestScore = trialScore;
                bestResult = JSON.parse(JSON.stringify(optimized));
            }
        }

        assignedStudents = bestResult || assignedStudents;
    } else {
        // 기배정 모드 (Optimize Mode)
        const isPreAssignedMode = true;

        // 미배정 학생들 채우기 (인원이 적은 반부터)
        fillUnassignedStudents(assignedStudents, classNames);

        // 2단계: 균형 최적화 루프 (기배정 모드만 여기서 실행)
        assignedStudents = optimizeBalance(assignedStudents, classNames, groups, scoreTolerance, isPreAssignedMode, useAdvancedConstraints);

        // 2.5단계: 전출생 분산 최종 검증
        validatePreTransferDistribution(assignedStudents, classNames);
    }

    // 3단계: 위반 사항 수집
    const violations: Violation[] = [];
    collectViolations(assignedStudents, groups, violations);

    return { students: assignedStudents, violations };
}

/**
 * 1단계: 균형 잡힌 초기 배정
 * 학생 유형별로 분류 후 라운드로빈 방식으로 균등 배정
 */
/**
 * 1단계: 균형 잡힌 초기 배정 (v1.2.2 - 적합도 기반 분산 복원)
 * 학생 유형별로 분류 후 적합도 점수제(Suitability Score)를 통해 최적의 반을 찾아 배정
 */
function balancedInitialAssignment(
    students: Student[],
    classNames: string[],
    groups: CustomGroup[],
    useAdvancedConstraints: boolean = true
): Student[] {
    // 고정 배정 학생 먼저 배정
    const fixedStudents = students.filter(s => s.fixed_class);
    fixedStudents.forEach(s => { s.assigned_class = s.fixed_class; });

    // 1.5. 전출생 배정 (고정반 다음, 커스텀 그룹 전)
    assignPreTransferStudents(students, classNames);

    // 2. 분산 배정 그룹(Custom Group) 처리
    groups.forEach(group => {
        const members = students.filter(s =>
            group.member_ids.includes(s.id) && !s.fixed_class && !s.assigned_class
        );

        if (members.length === 0) return;

        members.sort((a, b) => b.academic_score - a.academic_score);
        shuffleSimilarScores(members);

        const currentGroupCounts: Record<string, number> = {};
        classNames.forEach(cn => {
            currentGroupCounts[cn] = students.filter(s =>
                s.assigned_class === cn && group.member_ids.includes(s.id)
            ).length;
        });

        members.forEach(member => {
            const sortedClasses = [...classNames].sort((a, b) => {
                const diff = currentGroupCounts[a] - currentGroupCounts[b];
                if (diff !== 0) return diff;
                return Math.random() - 0.5;
            });

            const targetClass = sortedClasses[0];
            member.assigned_class = targetClass;
            currentGroupCounts[targetClass]++;
        });
    });

    // 3. 나머지 학생들 분류 & 세분화 그룹핑 (Strict Bucket)
    const normalStudents = students.filter(s => !s.assigned_class);

    // 반별 마이너스 학생 통계 추적 (유형별 분리)
    const classNegativeStats: Record<string, {
        count: number;
        score: number;
        has3: number;
        behaviorCount: number;
        emotionalCount: number;
    }> = {};
    classNames.forEach(cn => classNegativeStats[cn] = {
        count: 0, score: 0, has3: 0, behaviorCount: 0, emotionalCount: 0
    });

    // [중요] 각 점수/유형별로 엄격하게 분리하여 배정 (사용자 요청: +1도 3,4명씩 균등해야 함)
    // 그룹핑 키: 유형_점수 (예: BEHAVIOR_-3, EMOTIONAL_1 ...)
    const buckets: Record<string, Student[]> = {};
    const bucketKeys: string[] = [];

    // 우선순위 정의 (배정 순서)
    // 1. -3점 (가장 중요, 격리 필요)
    // 2. -2점, -1점 (균등 분산)
    // 3. Leader (균등 분산)
    // 4. 양수 점수 (균등 분산)

    // 버킷 초기화 & 분류
    normalStudents.forEach(s => {
        let key = '';
        if (s.behavior_type !== 'NONE') {
            key = `${s.behavior_type}_${s.behavior_score}`;
        } else if (s.behavior_type === 'NONE' && s.behavior_score !== 0) {
            // 유형은 없는데 점수가 있는 경우 (예외적 상황이지만 처리)
            key = `NONE_${s.behavior_score}`;
        } else {
            // 일반 학생 (나중에 배정)
            return;
        }

        if (!buckets[key]) {
            buckets[key] = [];
            bucketKeys.push(key);
        }
        buckets[key].push(s);
    });

    // 버킷 정렬 순서 정의
    const getPriority = (key: string): number => {
        const [type, scoreStr] = key.split('_');
        const score = parseInt(scoreStr, 10);

        if (score === -3) return 0; // 최우선
        if (score < 0) return 10;   // 그 다음 음수
        if (type === 'LEADER') return 20; // 리더
        return 30; // 양수 점수 등
    };

    bucketKeys.sort((a, b) => {
        const pA = getPriority(a);
        const pB = getPriority(b);
        if (pA !== pB) return pA - pB;
        // 같은 우선순위 내에서는 점수 오름차순 (작은 점수 먼저)
        const scoreA = parseInt(a.split('_')[1], 10);
        const scoreB = parseInt(b.split('_')[1], 10);
        return scoreA - scoreB;
    });

    // 엄격한 균형 배정 함수 (Strict Bucket Distribution)
    // 목표: 그룹 내 인원수 차이가 0~1명이 되도록 강제
    const assignStrictlyBalanced = (targetStudents: Student[], avoidMinus3: boolean) => {
        if (targetStudents.length === 0) return;

        // 성적순 정렬 + 셔플
        // (같은 점수 그룹 내에서도 성적을 골고루 퍼뜨리기 위함)
        targetStudents.sort((a, b) => b.academic_score - a.academic_score);
        shuffleSimilarScores(targetStudents);

        // 이 그룹만의 반별 카운트 추적
        const groupCounts: Record<string, number> = {};
        classNames.forEach(cn => groupCounts[cn] = 0);

        targetStudents.forEach(student => {
            // 1. 현재 이 그룹 인원이 가장 적은 반들 찾기 (Must)
            const minCount = Math.min(...Object.values(groupCounts));
            let candidates = classNames.filter(cn => groupCounts[cn] === minCount);

            // 2. (옵션) -3점 격리 로직
            // 후보군 중에서 -3점이 없는 곳을 선호
            if (avoidMinus3) {
                const safeCandidates = candidates.filter(cn => classNegativeStats[cn].has3 === 0);
                if (safeCandidates.length > 0) {
                    candidates = safeCandidates;
                }
            }

            // 3. (옵션) 2차 적합도: 전체 생활지도 총점/인원수 고려
            // 후보군이 여러 개라면, 전체 밸런스가 좋은 곳으로
            if (candidates.length > 1) {
                candidates.sort((a, b) => {
                    // 점수 합이 낮은(덜 나쁜) 곳 선호
                    const scoreDiff = classNegativeStats[a].score - classNegativeStats[b].score;
                    if (scoreDiff !== 0) return classNegativeStats[b].score - classNegativeStats[a].score; // score는 음수일수록 나쁨 -> 큰값(0에 가까운값) 선호? 
                    // score: -5 vs -2. -2 is better (higher). 
                    // Descending sort for score intent: (a,b) => b-a puts Higher values first.
                    // If a=-5, b=-2. -2 - (-5) = 3. Positive -> b comes first. Correct.
                    return classNegativeStats[b].score - classNegativeStats[a].score;
                });
            }

            // 최종 선택 (랜덤)
            const target = candidates[0]; // 정렬했으므로 첫번째가 Best

            // 할당
            student.assigned_class = target;
            groupCounts[target]++;

            // 전역 통계 업데이트
            classNegativeStats[target].count++;
            classNegativeStats[target].score += student.behavior_score;
            if (student.behavior_score === -3) classNegativeStats[target].has3++;
            if (student.behavior_type === 'BEHAVIOR') classNegativeStats[target].behaviorCount++;
            if (student.behavior_type === 'EMOTIONAL') classNegativeStats[target].emotionalCount++;
        });
    };

    // 각 버킷별로 순차 배정 실행
    bucketKeys.forEach(key => {
        const score = parseInt(key.split('_')[1], 10);
        // -3점이 아닌 학생들은 -3점이 있는 반을 피하려고 노력함 (Repulsion)
        // 단, 본인이 -3점이면 피할 필요 없음 (이미 분산 로직이 minCount로 동작하므로)
        const avoidMinus3 = (score !== -3);
        assignStrictlyBalanced(buckets[key], avoidMinus3);
    });

    // 4. 일반 학생 (NONE 타입) 배정
    // 이미 특수 학생들은 자리가 잡혔으므로, 빈 공간을 성비/성적 고려하여 채움
    const normalMales = normalStudents.filter(s => s.behavior_type === 'NONE' && s.gender === 'M');
    const normalFemales = normalStudents.filter(s => s.behavior_type === 'NONE' && s.gender === 'F');

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

    fillAssign(normalMales);
    fillAssign(normalFemales);

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
        const normal = cs.filter(s => !s.is_pre_transfer);
        const preTransfer = cs.filter(s => s.is_pre_transfer);

        return {
            className: cn,
            studentCount: cs.length,
            normalCount: normal.length,
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
