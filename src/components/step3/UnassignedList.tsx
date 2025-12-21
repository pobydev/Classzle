import { Student } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StudentCard } from './StudentCard';

interface UnassignedListProps {
    students: Student[];
    groups: { id: string; name: string; color: string }[];
    allStudents: Student[];
    selectedStudentId: string | null;
    activeRelationIds: string[] | null;
    recommendedStudentIds: string[];
    onStudentClick: (studentId: string) => void;
    onHoverRelation: (studentIds: string[] | null) => void;
    onHeaderClick: () => void;
}

export function UnassignedList({
    students,
    groups,
    allStudents,
    selectedStudentId,
    activeRelationIds,
    recommendedStudentIds,
    onStudentClick,
    onHoverRelation,
    onHeaderClick,
}: UnassignedListProps) {
    return (
        <Card className={`rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur border-dashed overflow-hidden p-0 ${selectedStudentId ? 'ring-2 ring-primary/50 cursor-pointer hover:bg-muted/50 transition-all' : ''}`}>
            <CardHeader className="py-3 px-4 bg-indigo-50/30 border-b cursor-pointer" onClick={onHeaderClick}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        미배정 학생
                        <Badge variant="secondary" className="text-xs">
                            {students.length}명
                        </Badge>
                    </CardTitle>
                    {selectedStudentId && (
                        <span className="text-xs text-primary animate-pulse">
                            이동하려면 클릭하여 선택
                        </span>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-4">
                {students.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-2">모든 학생이 배정되었습니다.</p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                        {students.map((s) => (
                            <StudentCard
                                key={s.id}
                                student={s}
                                groups={groups}
                                allStudents={allStudents}
                                isSelected={selectedStudentId === s.id}
                                isHighlighted={activeRelationIds?.includes(s.id) || false}
                                isRecommended={recommendedStudentIds.includes(s.id)}
                                showScore={!!selectedStudentId && (selectedStudentId === s.id || recommendedStudentIds.includes(s.id))}
                                onClick={() => onStudentClick(s.id)}
                                onHoverRelation={onHoverRelation}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
