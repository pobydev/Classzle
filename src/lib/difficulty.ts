// 어려움 합계에 넣을 점수입니다. 배정, 추천, 통계 표, 비교 화면이 모두 이 값을 씁니다.
// 어려운 학생의 점수만 더하고 리더는 더하지 않습니다. 리더를 넣을지 바꾸려면 여기만 고칩니다.
export const difficultyOf = (student: { behavior_score: number }): number => Math.min(student.behavior_score, 0);
