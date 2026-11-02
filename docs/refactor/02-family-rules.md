# 앱 틀과 패밀리 규칙

작성일 2026-11-02. 기준은 `brand/DESIGN.md`와 `gnilab/CLAUDE.md`입니다. main 병합, push, 릴리스, 버전 변경은 하지 않았습니다.

## 바뀐 것

| 항목 | 내용 | 코드 |
| --- | --- | --- |
| 공통 색과 글자 | ScoreShow와 같은 유틸리티 이름. 다크 모드와 그라데이션 유틸리티 삭제 | `src/app/globals.css`, `src/components/ui/*`, `src/lib/utils.ts` |
| 창 | 기본 틀과 메뉴 삭제, 34px 제목 바, 가운데에 지금 연 작업 이름 | `main/background.ts`, `src/components/shell/TitleBar.tsx` |
| 아이콘 | 새 아이콘을 앱, 창, 설치 파일에 적용. 옛 `logo.jpg`, `favicon.png` 삭제 | `public/icons/`, `package.json` |
| 사이드바 | 로고 자리, 1~3단계, 저장된 작업과 저장, 사용 가이드와 새 버전 알림. 옛 머리글과 푸터 삭제 | `src/components/shell/AppSidebar.tsx`, `useSavedProjects.ts` |
| 확인 창 | 앱 안의 창. `useConfirm()` | `src/components/shell/ConfirmProvider.tsx` |
| 사용 가이드 | 실제 절차, 암호화 안내, 통일 문구, 버전, made by gnilab | `src/components/shell/GuideDialog.tsx` |
| 새 버전 확인 | ScoreShow와 같은 동작과 문구. 시험 코드까지 옮김 | `main/updater.ts`, `src/lib/updates.ts`, `src/components/shell/Updates.tsx`, `useUpdates.ts` |
| 문서 | README를 Classzle 설명으로 새로 씀, `PRD.md`의 '100% 로컬' 문구 수정 | |

## 다른 담당과의 약속

- 본문 영역은 `flex-1 min-h-0 overflow-auto`인 `main`입니다.
- 제목 바 높이는 CSS 변수 `--shell-top: 34px`입니다.
- `page.tsx`가 `Step3Dashboard`에 `onBoardActiveChange`를 넘깁니다. 아직 그 prop이 없는 브랜치에서도 타입 오류가 나지 않도록 객체를 펼쳐서 넘깁니다. 합친 뒤에는 그대로 두어도 타입 검사를 받습니다.
- 값이 true이고 3단계이면 사이드바를 56px로 접습니다. 다른 단계로 가면 펼칩니다. `Step3Dashboard`가 사라지면서 false를 보내지 않아도 펼쳐집니다.
- 접힌 줄에는 1~3단계, 저장된 작업, 작업 저장, 사용 가이드가 있고, 새 버전 알림이 있으면 점이 달린 아이콘이 나옵니다. 누르면 펼쳐집니다.
- `Step1Setup`과 `Step2Constraints`의 `confirm`, `alert`, `confirmDialog`는 바꾸지 않았습니다. 다음 담당이 `useConfirm()`으로 바꾸고, 마지막 호출이 사라지면 `main/background.ts`의 `confirm-dialog`를 지웁니다.

```tsx
const confirm = useConfirm();
if (await confirm({ title: '지울까요?', description: '되돌릴 수 없습니다.', confirmLabel: '삭제', danger: true })) { ... }
```

## 판단한 것

- **메뉴는 Radix 세로 탭으로 두었습니다.** 키보드 조작이 그대로 되고, 안 보이는 단계는 지금처럼 화면에서 빠집니다.
- **접고 펴는 단추를 넣었습니다.** 보드를 보다가 저장된 작업을 열어야 할 때 필요합니다. 평소에도 접을 수 있습니다.
- **`electron-builder.yml`을 지웠습니다.** `package.json`의 `build`가 있으면 이 파일을 읽지 않습니다. 빌드 기록이 `file=package.json`, `oneClick=true`로 확인해 주었고, 지금까지의 릴리스도 이 설정이었습니다. 설치 방식은 바꾸지 않았습니다.
- **설치 파일 이름**이 `Classzle-Setup-<버전>.exe`로 바뀝니다. GitHub가 빈칸을 바꿔 `latest.yml`과 어긋나는 일을 막습니다.
- **통일 문구**는 새 버전 확인이 되는 설치본에서만 전체가 보입니다. 웹과 개발 모드에는 앞 문장만 나옵니다.
- **알림 자리**는 ScoreShow와 같은 사이드바 맨 아래 칸이고, 스위치는 설정 창이 없으므로 사용 가이드 창에 있습니다.
- **'프로젝트'를 화면에서 '작업'으로 통일했습니다.** 메뉴 이름이 '저장된 작업'이었기 때문입니다.
- **Pretendard와 학교안심 받아쓰기체 라이선스 파일**을 `public/fonts`에 넣었습니다. 받아쓰기체의 KERIS 공식 문서 원문은 확인하지 못했습니다(ScoreShow와 같은 사정).

## 시험

| 시험 | 결과 |
| --- | --- |
| `tsc --noEmit`, `tsc -p main` | 통과 |
| `vitest` (벤치 제외) | 105건 통과 |
| `scripts/shell-smoke.mjs` (실제 앱) | 9가지 통과 |
| `scripts/update-smoke.mjs` (포장한 앱, 시험용 서버) | 12가지 통과. 요청한 것은 `latest.yml`, 설치 파일, `.blockmap`뿐 |
| `brand/classzle-측정/app-check-*.cjs` (경로만 바꾼 사본) | 끝까지 통과, 화면 오류 없음, 외부 주소 없음, 사전 파일 없음 |
| 설치 파일과 실행 파일 아이콘 | 새 아이콘 확인 |

모두 가상 표본으로 돌렸고, 자료는 임시 폴더에 두었습니다.

## 확인하지 못한 것

- GitHub 실제 릴리스에서 받아 설치까지 끝나는 과정. 시험은 설치 직전에 멈춥니다. 1.2.4를 쓰는 분은 새 버전 확인이 없어 한 번은 직접 받아야 합니다.
- 설치 프로그램을 실제로 실행하는 과정과 작업 표시줄 아이콘.
- 보드 담당의 `onBoardActiveChange`를 합친 뒤의 접힘. 지금은 접기 단추로만 확인했습니다.
- 실제 명단.

## 남은 것

- Step 화면 안의 직접 적은 색(보라 `반편성 시작`, `다음: 조건 설정` 버튼 등)과 그림 문자는 그대로입니다. Step3는 보드 담당, Step1과 Step2는 다음 담당 몫입니다.
- `Step2Constraints`, `PreTransferSettings`의 `hover:bg-accent`, `bg-accent/50`을 `bg-wash` 계열로 바꾼 뒤 `globals.css`의 '옛 화면 호환' 규칙을 지웁니다.
- 같은 이름으로 저장하면 묻지 않고 덮어씁니다. 원래 동작 그대로입니다.
- 작업 이름에 파일 이름으로 쓸 수 없는 글자가 있으면 저장에 실패합니다. 원래 동작 그대로입니다.

# 나머지 화면

작성일 2026-11-02. Step1, Step2, 전출 예정, 리포트, 이력을 공통 디자인으로 옮겼습니다.

## 바뀐 것

- **색과 글자:** 직접 적은 색과 임의 글자 크기를 공통 이름과 8단계로 바꿨습니다. 그라데이션, 흐린 유리 효과, 큰 그림자는 뺐습니다.
- **그림 문자:** 화면의 그림 문자를 모두 Phosphor로 바꿨습니다. 아이콘은 기본형만 씁니다.
- **성공과 위험 표시:** 공통 색에 초록이 없으므로 '만족'은 `wash` 바탕과 체크, '미충족'은 `danger-wash` 바탕과 경고 기호입니다. 글자도 함께 있습니다.
- **생활지도 표시:** 학생 표의 줄 전체를 칠하던 색을 유형 칸의 표시(`BehaviorChip`)로 옮겼습니다. 기호(별, 번개, 하트), 글자, 점수를 함께 쓰고, 색 값은 기존 `--behavior-*`입니다. 남녀 수의 파랑, 분홍 글자는 뺐습니다.
- **확인 창:** Step1, Step2의 `confirm`, `confirmDialog`를 `useConfirm()`으로, `alert`를 `toast.error`로 바꿨습니다. `confirm-dialog` IPC를 지웠습니다.
- **호환 규칙:** `hover:bg-accent` 계열을 `bg-wash`로 바꾸고 `globals.css`의 '옛 화면 호환'을 지웠습니다. `classzle-refactor` 작업 공간의 Step3와 lib에는 이 규칙에 기대거나 기본 확인 창을 쓰는 곳이 없습니다(두 파일 안의 옛 사본은 이 브랜치 것으로 대체됩니다).
- **같은 이름 저장:** 지금 연 작업이 아닌 다른 작업의 이름이면 앱 안의 창으로 먼저 묻습니다. 취소하면 저장 창이 그대로 남습니다.
- **사용 가이드:** 기본 정보와 상세 정보 엑셀의 차이를 적었습니다.
- **조건 이름:** 그룹 분산, 분리 배정, 함께 배정, 고정 배정, 전출 예정으로 맞췄고, '제약 조건'은 '조건'으로 씁니다. 변수 이름과 저장 파일 형식은 그대로입니다.

## 고친 오류

- 리포트 창이 `max-w-4xl`을 줘도 `sm:max-w-lg`에 막혀 좁게 나왔습니다. `sm:max-w-4xl`로 고쳤습니다.
- 관계 조건이 없어도 '학급별 관계 상세 현황' 제목만 나오고 안내가 없었습니다. 빈 안내가 나옵니다.
- 고정 배정 표시가 '1반반 희망'처럼 나왔습니다. '1반 고정'으로 고쳤습니다.
- 엑셀 가이드의 '기존 배정 유지'는 없는 메뉴입니다. '현재 배정 수정'으로 고쳤습니다.

## 일부러 그대로 둔 것

- **그룹 색 8가지:** 교사가 고르는 값이고 저장 파일에 클래스 이름 그대로 들어갑니다. 바꾸면 옛 저장 파일이 깨지므로 그대로 둡니다. 그룹은 이름을 함께 보여 줍니다.
- **인쇄용 HTML:** 색과 모양은 그대로이고, 조건 이름만 바꿨습니다. 그림 문자 두 개(`희망`, `회피` 앞)는 이름과 함께 뺐습니다.
- **통계 표:** 건드리지 않았습니다.
- **`Step3Dashboard.tsx`, `AssignmentBoard.tsx`, `recommend.ts`, `excel.ts`:** 다른 담당의 파일입니다. 옛 조건 이름과 직접 적은 색이 남아 있습니다.
- **`tests/assignment.test.ts`, `tests/validation.test.ts`의 시험 제목:** '떼어 놓기' 같은 말이 남아 있습니다. 문구를 찾는 시험이 아니고, 배정 담당과 겹치지 않도록 그대로 둡니다.

## 시험

| 시험 | 결과 |
| --- | --- |
| `tsc --noEmit`, `tsc -p main` | 통과 |
| `vitest` (벤치 제외) | 105건 통과 |
| `scripts/shell-smoke.mjs` | 10가지 통과 (같은 이름 저장 추가) |
| `app-check-new`, `app-check-preassigned` (경로만 바꾼 사본) | 끝까지 통과, 화면 오류 없음, 외부 주소 없음 |
| 화면 문구 전후 비교 | 사라진 문구 없음. 달라진 것은 그림 문자, 어미, 확인 창 문구, 조건 이름 |
| 화면 확인 | 1단계, 엑셀 가이드, 2단계 5개 탭, 리포트 3개 탭, 이력, 확인 창을 캡처해 봄 |
| 인쇄 미리보기 | 창이 뜨고 11쪽 PDF가 나옴. 1쪽을 캡처해 봄 |

## 확인하지 못한 것

- 프린터로 실제 인쇄한 결과. 미리보기까지만 봤습니다.
- 11쪽 PDF 중 1쪽 말고 나머지 쪽의 세부 모양.
- `update-smoke`는 이 단계에서 다시 돌리지 않았습니다. `main/background.ts`의 확인 창 부분만 지웠고 새 버전 코드는 바꾸지 않았습니다.
- 실제 명단.
