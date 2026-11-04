// 사용 가이드 창: 교사가 실제로 하는 순서대로 적습니다.
// 짜임새는 어울림, ScoreShow 사용 가이드와 같습니다 (brand/DESIGN.md).

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ONE_VALUE_RULE } from '@/lib/classSheets';
import { privacyNote } from '@/lib/updates';
import { UpdateSection } from './Updates';
import type { Updates } from './useUpdates';

// 오래 읽는 창이라 본문 16px, 진한 색으로 씁니다 (brand/DESIGN.md).
const STRONG = 'font-bold';
const BODY = 'text-emph !leading-[26px] text-ink';
const SECTION = `${BODY} flex flex-col gap-1.5`;
const HEADING = 'text-title-sm font-bold text-ink';

function Step({ number, title, children }: { number: string; title: string; children: ReactNode }) {
    return (
        <section className="flex gap-4">
            <span className="flex-shrink-0 self-start w-10 rounded-[7px] bg-tint py-[7px] text-center text-body font-semibold text-accent">
                {number}
            </span>
            <div className={`${SECTION} min-w-0 flex-1`}>
                <h3 className={HEADING}>{title}</h3>
                {children}
            </div>
        </section>
    );
}

export function GuideDialog({
    isOpen,
    appVersion,
    updates,
    onClose,
}: {
    isOpen: boolean;
    appVersion: string;
    updates: Updates;
    onClose: () => void;
}) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[760px] max-h-[calc(100vh-32px)] overflow-y-auto gap-6 p-8">
                <div className="flex flex-col gap-2 pr-6">
                    <DialogTitle className="text-title font-bold">Classzle 사용 가이드</DialogTitle>
                    <DialogDescription className={BODY}>학생 명단을 넣고 다음 학년도 반을 편성하는 순서입니다.</DialogDescription>
                </div>

                <section className="rounded-card bg-wash p-5 text-emph !leading-[26px] text-ink flex flex-col gap-1.5">
                    <h3 className={HEADING}>시작하기 전에</h3>
                    <p>
                        <strong className={STRONG}>저장 파일은 암호화되지 않습니다.</strong> 저장한 작업에는 학생 성적과 생활지도
                        내용이 들어 있으니, 다른 사람이 쓰는 컴퓨터에는 저장하지 말아 주세요.
                    </p>
                </section>

                <Step number="01" title="기초 정보 넣기">
                    <p>왼쪽 <strong className={STRONG}>기초 정보</strong>에서 양식을 받아 학생 정보를 붙여 넣고 파일을 넣습니다. 학급 수는 파일에 맞춰 정해지고, 맨 위 요약 줄의 바꾸기로 고칩니다.</p>
                    <ul className="ml-4 list-disc">
                        <li>양식 A: 새로 반을 편성할 때 씁니다. 이전 학년도 반과 번호가 있으면 됩니다.</li>
                        <li>양식 B: 이미 나눈 배정안을 고칠 때 씁니다. 신학년 배정 결과를 함께 넣습니다.</li>
                    </ul>
                    <p>
                        채운 파일을 끌어다 놓거나 <strong className={STRONG}>파일 선택</strong>으로 넣습니다. 열 이름은{' '}
                        <strong className={STRONG}>작성 방법</strong>에 있습니다. 넣은 뒤에는 표에서 고치거나 학생을 추가할 수 있습니다.
                    </p>
                </Step>

                <Step number="02" title="생활지도 입력하기">
                    <p>학생 표에서 바로 넣거나, 담임에게 반별 입력표를 받습니다. 엑셀로 이미 넣었다면 건너뜁니다.</p>
                    <ul className="ml-4 list-disc">
                        <li>
                            바로 넣기: 값을 한 번 누릅니다. 키보드로는 숫자를 누르면 값이 들어가고 다음 학생으로 넘어갑니다. 탭에서 반마다
                            입력 인원을 볼 수 있습니다.
                        </li>
                        <li>
                            반별 입력표: 학생 표 위의 <strong className={STRONG}>담임에게 받기</strong>에서 <strong className={STRONG}>반별 입력표 내보내기</strong>로 반마다 파일을 만들어 담임에게 보내고, 돌아온
                            파일을 <strong className={STRONG}>입력표 받기</strong>로 한꺼번에 넣습니다. 반영하기 전에 요약을 보여 줍니다.
                        </li>
                    </ul>
                    <p>
                        <strong className={STRONG}>{ONE_VALUE_RULE}</strong> 입력표에는 그 반 학생의 번호, 이름, 성별만 들어갑니다. 암호는 걸리지 않으니
                        학교 메신저처럼 정해진 경로로 주고받고, 끝나면 파일을 지워 주세요.
                    </p>
                </Step>

                <Step number="03" title="조건 정하기">
                    <p>왼쪽 <strong className={STRONG}>조건 설정</strong>에서 필요한 것만 정합니다.</p>
                    <ul className="ml-4 list-disc">
                        <li>그룹 분산: 그룹 학생을 모든 반에 고르게 나눕니다.</li>
                        <li>분리 배정: 같은 반이 되면 안 되는 학생입니다. 학폭 분리를 포함합니다.</li>
                        <li>함께 배정: 담임 판단으로 같은 반에 두는 학생입니다.</li>
                        <li>고정 배정: 특정 반에 꼭 넣어야 하는 학생을 정합니다.</li>
                        <li>전출 예정: 전출할 학생을 표시합니다. 인원과 성적은 전출 뒤 기준으로 맞춥니다.</li>
                    </ul>
                </Step>

                <Step number="04" title="반 편성하기">
                    <p>왼쪽 <strong className={STRONG}>반 편성</strong>에서 방식을 고르고 실행합니다.</p>
                    <ul className="ml-4 list-disc">
                        <li>신규 배정: 처음부터 새로 편성합니다.</li>
                        <li>현재 배정 수정: 지금 배정을 두고 어긴 조건만 고칩니다.</li>
                        <li>균형 조정: 어긴 조건을 고치고 성적과 생활지도 균형까지 맞춥니다.</li>
                    </ul>
                    <p>
                        생활지도는 -3, -2가 몰리지 않게 먼저 맞추고, 그다음 합계(어려운 학생과 리더의 점수를 모두 더한 값)를 맞춥니다. -1 인원은 합계에 맞춰
                        달라질 수 있습니다.
                    </p>
                    <p>조건을 다 지키지 못하면 어긴 것을 보여 줍니다. 조건을 바꿔 가며 다시 실행해도 됩니다.</p>
                </Step>

                <Step number="05" title="결과 다듬기">
                    <p>
                        <strong className={STRONG}>상세 배치 조정</strong>에서 학생을 누르면 바꿀 만한 학생을 오른쪽에 추천합니다. 추천 줄을 누르면
                        바꾸기 전에 두 반을 비교해 볼 수 있습니다. 학생을 눌러 바로 교환하거나 반 이름을 눌러 옮겨도 됩니다. 잘못 바꾸었으면 <strong className={STRONG}>되돌리기</strong>를 누릅니다.
                    </p>
                </Step>

                <Step number="06" title="저장하고 내보내기">
                    <p>
                        왼쪽 <strong className={STRONG}>작업 저장</strong>으로 이름을 정해 저장하면 다음에 이어서 할 수 있습니다.{' '}
                        <strong className={STRONG}>배정 리포트</strong>에서 조건 현황과 이동 명단을 보고,{' '}
                        <strong className={STRONG}>배정 결과 엑셀</strong>로 명단을 받습니다.
                    </p>
                    <p>
                        엑셀은 기본 정보와 상세 정보 중에서 고릅니다. 둘 다 성적과 반 평균이 들어 있고, 상세 정보에는 생활지도,
                        그룹, 관계 조건, 고정 배정이 더 있습니다. 담임 회의와 담당자가 쓰는 파일이므로 학생에게 나눠 주지 말아 주세요.
                    </p>
                    <p>편성이 모두 끝나면 왼쪽 목록에서 저장된 작업을 지워 주세요.</p>
                </Step>

                <section className={SECTION}>
                    <h3 className={HEADING}>학생 정보</h3>
                    <p>{privacyNote(updates.isSupported)}</p>
                </section>

                <UpdateSection updates={updates} bodyClass={SECTION} headingClass={HEADING} />

                <p className={BODY}>궁금한 점이나 불편한 점은 pobydev@gmail.com으로 알려 주세요.</p>

                <div className="flex justify-end border-t border-line pt-[19px]">
                    <Button onClick={onClose}>확인</Button>
                </div>

                <div className="flex flex-col items-center gap-1.5 text-small text-soft">
                    <span>버전 {appVersion}</span>
                    <p className="flex items-center gap-[5px] text-caption text-soft" data-made-by="true">
                        <span>made by</span>
                        <img src="/icons/gnilab.svg" alt="gnilab" className="h-4 w-auto" />
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
