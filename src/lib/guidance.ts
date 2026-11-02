// 합계에 넣을 생활지도 점수입니다. 배정, 추천, 통계 표, 비교 화면이 모두 이 값을 씁니다.
// 어려운 학생(음수)과 리더(양수)의 점수를 모두 더합니다. 합계 계산을 바꾸려면 여기만 고칩니다.
export const guidancePointsOf = (student: { behavior_score: number }): number => student.behavior_score;
