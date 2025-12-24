'use client';

import { Student, BehaviorType } from '@/types';
import { Badge } from '@/components/ui/badge';

interface StudentCardProps {
    student: Student;
    groups: { id: string; name: string; color: string }[];
    allStudents: Student[];
    isSelected: boolean;
    isHighlighted: boolean;
    isRecommended: boolean;
    showScore: boolean;
    attendanceNumber?: number;
    onClick: () => void;
    onHoverRelation: (studentIds: string[] | null) => void;
}

export function StudentCard({
    student,
    groups,
    allStudents,
    isSelected,
    isHighlighted,
    isRecommended,
    showScore,
    attendanceNumber,
    onClick,
    onHoverRelation,
}: StudentCardProps) {
    const studentGroups = groups.filter((g) =>
        student.group_ids.includes(g.id)
    );

    const getBehaviorStyle = (type: BehaviorType, score: number) => {
        if (type === 'NONE') return 'bg-white border-gray-200';
        if (type === 'LEADER') {
            return score >= 2
                ? 'bg-green-100 border-green-300'
                : 'bg-green-50 border-green-200';
        }
        if (type === 'BEHAVIOR') {
            if (score <= -3) return 'bg-red-100 border-red-300';
            if (score <= -2) return 'bg-orange-100 border-orange-300';
            return 'bg-orange-50 border-orange-200';
        }
        if (type === 'EMOTIONAL') {
            if (score <= -3) return 'bg-blue-100 border-blue-300';
            if (score <= -2) return 'bg-blue-50 border-blue-200';
            return 'bg-sky-50 border-sky-200';
        }
        return 'bg-white border-gray-200';
    };

    // 관련 학생 정보 조회 (allStudents가 없을 경우 빈 배열)
    const avoidStudents = (allStudents || []).length > 0 && student.avoid_ids.length > 0
        ? student.avoid_ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[]
        : [];
    const keepStudents = (allStudents || []).length > 0 && student.keep_ids.length > 0
        ? student.keep_ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[]
        : [];

    return (
        <div
            onClick={onClick}
            className={`
        p-2 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between min-h-[42px]
        ${getBehaviorStyle(student.behavior_type, student.behavior_score)}
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-md z-10' : ''}
        ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1 bg-yellow-50 shadow-lg z-20' : ''}
        ${isRecommended ? 'ring-2 ring-indigo-400 ring-offset-1 shadow-md z-10 animate-pulse' : ''}
        ${!isSelected && !isHighlighted && !isRecommended ? 'hover:shadow-md hover:scale-[1.01]' : ''}
      `}
        >
            <div className="flex items-center gap-1.5 overflow-hidden">
                {attendanceNumber && (
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {attendanceNumber}.
                    </span>
                )}
                <span className="font-medium text-sm truncate">{student.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                    ({student.gender === 'M' ? '남' : '여'})
                </span>
                {student.behavior_type !== 'NONE' && (
                    <span className="text-[10px] opacity-70 shrink-0">
                        {student.behavior_type === 'LEADER' && '리더'}
                        {student.behavior_type === 'BEHAVIOR' && '행동'}
                        {student.behavior_type === 'EMOTIONAL' && '정서'}
                        {student.behavior_score > 0 ? `+${student.behavior_score}` : student.behavior_score}
                    </span>
                )}
                {showScore && (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-100 shrink-0">
                        {student.academic_score}점
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
                {/* 관계 배정 - 피해야 할 관계 */}
                {avoidStudents.length > 0 && (
                    <div
                        className="relative group"
                        onMouseEnter={() => onHoverRelation(student.avoid_ids)}
                        onMouseLeave={() => onHoverRelation(null)}
                    >
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200 text-[10px] px-1 py-0 h-5 cursor-help">
                            피 {avoidStudents.length}
                        </Badge>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                            <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                <div className="font-semibold mb-0.5 text-red-300">피해야 할 학생</div>
                                {avoidStudents.map(s => {
                                    const classStudents = allStudents.filter(st => st.assigned_class === s.assigned_class).sort((a, b) => a.name.localeCompare(b.name));
                                    const studentNumber = classStudents.findIndex(st => st.id === s.id) + 1;
                                    // 이전 학년에서 +1, 뒷반호 추출, 새 번호
                                    const prevGrade = parseInt(s.prev_info.split('-')[0]) || 0;
                                    const newGrade = prevGrade + 1;
                                    const newClass = s.assigned_class ? s.assigned_class.replace('반', '') : '?';
                                    const newInfo = s.assigned_class ? `${newGrade}-${newClass}-${studentNumber}` : '미배정';
                                    return <div key={s.id}>{s.name} ({newInfo})</div>;
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {/* 관계 배정 - 같은 반 희망 */}
                {keepStudents.length > 0 && (
                    <div
                        className="relative group"
                        onMouseEnter={() => onHoverRelation(student.keep_ids)}
                        onMouseLeave={() => onHoverRelation(null)}
                    >
                        <Badge className="bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200 text-[10px] px-1 py-0 h-5 cursor-help">
                            친 {keepStudents.length}
                        </Badge>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                            <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                <div className="font-semibold mb-0.5 text-pink-300">같은 반 희망 학생</div>
                                {keepStudents.map(s => {
                                    const classStudents = allStudents.filter(st => st.assigned_class === s.assigned_class).sort((a, b) => a.name.localeCompare(b.name));
                                    const studentNumber = classStudents.findIndex(st => st.id === s.id) + 1;
                                    // 이전 학년에서 +1, 뒷반호 추출, 새 번호
                                    const prevGrade = parseInt(s.prev_info.split('-')[0]) || 0;
                                    const newGrade = prevGrade + 1;
                                    const newClass = s.assigned_class ? s.assigned_class.replace('반', '') : '?';
                                    const newInfo = s.assigned_class ? `${newGrade}-${newClass}-${studentNumber}` : '미배정';
                                    return <div key={s.id}>{s.name} ({newInfo})</div>;
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {/* 기존 배정 */}
                {(studentGroups.length > 0 || student.is_pre_transfer || student.fixed_class) && (
                    <div className="flex gap-1">
                        {student.fixed_class && (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 text-[10px] px-1 py-0 h-5">
                                고정
                            </Badge>
                        )}
                        {student.is_pre_transfer && (
                            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200 text-[10px] px-1 py-0 h-5">
                                전출
                            </Badge>
                        )}
                        {studentGroups.map((group) => (
                            <Badge key={group.id} className={`${group.color} text-[10px] px-1 py-0 h-5`}>
                                {group.name}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
