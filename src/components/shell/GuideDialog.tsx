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
                    <DialogTitle className="text-title font-bold">클래스즐 사용 가이드</DialogTitle>
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
                        <li>양식 A: 새로 반을 편성할 때 씁니다. 전학년도 반과 번호가 있으면 됩니다.</li>
                        <li>양식 B: 이미 나눈 배정안을 고칠 때 씁니다. 신학년 배정 결과를 함께 넣습니다.</li>
                    </ul>
                    <p>
                        채운 파일을 끌어다 놓거나 <strong className={STRONG}>파일 고르기</strong>로 넣습니다. 열 이름은{' '}
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
                        바꾸기 전에 두 반을 비교해 볼 수 있습니다. 학생을 눌러 바로 교환하거나 반 이름을 눌러 옮겨도 됩니다. 추천은 두 방식 중 고릅니다. <strong className={STRONG}>생활지도까지</strong>는 성적과 생활지도가 닮은 학생만, <strong className={STRONG}>성적만</strong>은 성적이 가까운 학생을 보여 주고 생활지도가 다르거나 몰림이 생기면 글로 알립니다. <strong className={STRONG}>전체 반</strong>은 모든 반을 한 화면에, <strong className={STRONG}>골라 보기</strong>는 고른 2~4개 반을 크게 나란히 보여 줍니다. 잘못 바꾸었으면 <strong className={STRONG}>되돌리기</strong>를 누릅니다. 되돌리기 기록은 앱을 끄면 지워집니다.
                    </p>
                    <p data-guide-board-marks>
                        보드의 <strong className={STRONG}>행-3</strong>에서 행은 행동, 정은 정서, 리는 리더입니다. 학생 칸은 행동은 흙 주황, 정서는 보라, 리더는 초록으로 칠하고, 정도가 클수록 진합니다.{' '}
                        <strong className={STRONG}>고·분·함·전</strong>은 고정 배정, 분리 배정, 함께 배정, 전출 예정이고, 색 테두리를 두른 네모 안의 글자는 그룹 이름의 첫 글자입니다.
                        반 이름 아래 숫자는 전출 뒤 기준이고, <strong className={STRONG}>!</strong>는 다른 반보다 몰린 곳입니다. 표시에 마우스를 올리면 뜻이 나오고, 보드 위 <strong className={STRONG}>?</strong>에 모두 모여 있습니다.
                    </p>
                    <p>학생을 고르지 않았을 때 오른쪽에는 <strong className={STRONG}>손볼 곳</strong>(지키지 못한 조건, 몰린 반, 미배정 학생)이 나옵니다. 누르면 그 학생이나 반으로 갑니다.</p>
                </Step>

                <Step number="06" title="저장하고 내보내기">
                    <p>
                        왼쪽 <strong className={STRONG}>작업 저장</strong>으로 이름을 정해 저장하면 다음에 이어서 할 수 있습니다.{' '}
                        <strong className={STRONG}>배정 결과 보고서</strong>에서 조건을 지켰는지와 바꾼 기록을 보고 인쇄하며,{' '}
                        <strong className={STRONG}>배정 결과 엑셀</strong>로 명단을 받습니다. 번호 부여 방식은 내보내기 창에서 고릅니다.
                    </p>
                    <p data-guide-work-file>
                        다른 컴퓨터에서 이어 하려면 왼쪽 <strong className={STRONG}>파일로 내보내기</strong>로 작업 파일을 만들고, 그 컴퓨터에서{' '}
                        <strong className={STRONG}>파일 열기</strong>로 엽니다. 이 파일도 암호화되지 않으니 다 쓰면 지워 주세요.
                    </p>
                    <p>
                        엑셀은 기본 정보와 상세 정보 중에서 고릅니다. 둘 다 성적과 반 평균이 들어 있고, 상세 정보에는 생활지도,
                        그룹, 관계 조건, 고정 배정이 더 있습니다. 담임 회의와 담당자가 쓰는 파일이므로 학생에게 나눠 주지 말아 주세요.
                    </p>
                    <p>편성이 모두 끝나면 왼쪽 목록에서 저장한 작업을 지워 주세요.</p>
                </Step>

                <section className={SECTION} data-guide-shortcuts>
                    <h3 className={HEADING}>단축키</h3>
                    <ul className="ml-4 list-disc">
                        <li>화면 크게, 작게: <strong className={STRONG}>Ctrl + +</strong>, <strong className={STRONG}>Ctrl + −</strong>, 원래 크기는 <strong className={STRONG}>Ctrl + 0</strong>입니다. Ctrl을 누른 채 마우스 휠을 굴려도 됩니다. 회의에서 TV로 함께 볼 때 씁니다. 고른 크기는 다음에 켜도 그대로입니다.</li>
                        <li>생활지도 입력: 표의 생활지도 칸을 누른 뒤 숫자 키를 누릅니다. 1·2·3은 행동 -3·-2·-1, 4·5·6은 정서 -3·-2·-1, 7·8은 리더 +1·+2, 0은 해당 없음입니다. 버튼도 왼쪽부터 같은 순서입니다.</li>
                        <li>상세 배치 조정: <strong className={STRONG}>Esc</strong>를 누르면 비교를 닫고, 한 번 더 누르면 고른 학생을 놓습니다.</li>
                    </ul>
                </section>

                <section className={SECTION}>
                    <h3 className={HEADING}>학생 정보</h3>
                    <p>{privacyNote(updates.support)}</p>
                </section>

                <UpdateSection updates={updates} bodyClass={SECTION} headingClass={HEADING} />

                <p className={BODY}>궁금한 점이나 불편한 점은 hello@gnilab.kr로 알려 주세요.</p>

                <div className="flex justify-end border-t border-line pt-[19px]">
                    <Button onClick={onClose}>확인</Button>
                </div>

                <div className="flex flex-col items-center gap-1.5 text-small text-soft">
                    <span>버전 {appVersion}{updates.isPortable && ' (USB판)'}</span>
                    {/* 누르면 기본 브라우저로 gnilab.kr을 엽니다(main/background.ts의 openLinkOutside). */}
                    <a
                        href="https://gnilab.kr"
                        target="_blank"
                        rel="noreferrer"
                        title="gnilab.kr 열기"
                        className="flex items-center gap-[5px] rounded-sm text-caption text-soft no-underline"
                        data-made-by="true"
                    >
                        <span>made by</span>
                        <img src="/icons/gnilab.svg" alt="gnilab" className="h-4 w-auto" />
                    </a>
                </div>
            </DialogContent>
        </Dialog>
    );
}
