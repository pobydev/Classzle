import { Student } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StudentCard } from './StudentCard';

interface ClassColumnProps {
    className: string;
    students: Student[];
    groups: { id: string; name: string; color: string }[];
    allStudents: Student[];
    selectedStudentId: string | null;
    activeRelationIds: string[] | null;
    recommendedStudentIds: string[];
    onStudentClick: (studentId: string) => void;
    onHoverRelation: (studentIds: string[] | null) => void;
    onHeaderClick: (className: string) => void;
}

export function ClassColumn({
    className,
    students,
    groups,
    allStudents,
    selectedStudentId,
    activeRelationIds,
    recommendedStudentIds,
    onStudentClick,
    onHoverRelation,
    onHeaderClick,
}: ClassColumnProps) {
    return (
        <Card className={`h-full rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur overflow-hidden p-0 ${selectedStudentId ? 'ring-2 ring-primary/50 cursor-pointer hover:bg-muted/50 transition-all' : ''}`}>
            <CardHeader className="py-3 px-4 bg-indigo-50/50 border-b cursor-pointer" onClick={() => onHeaderClick(className)}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-primary">{className}</CardTitle>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                            {students.length}명
                        </Badge>
                        {selectedStudentId && (
                            <span className="text-[10px] text-primary flex items-center animate-pulse">
                                이동하려면 클릭
                            </span>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-2 min-h-[200px]">
                <div className="space-y-2">
                    {students.map((s, index) => (
                        <StudentCard
                            key={s.id}
                            student={s}
                            groups={groups}
                            allStudents={allStudents}
                            isSelected={selectedStudentId === s.id}
                            isHighlighted={activeRelationIds?.includes(s.id) || false}
                            isRecommended={recommendedStudentIds.includes(s.id)}
                            showScore={!!selectedStudentId && (selectedStudentId === s.id || recommendedStudentIds.includes(s.id))}
                            attendanceNumber={index + 1}
                            onClick={() => onStudentClick(s.id)}
                            onHoverRelation={onHoverRelation}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
