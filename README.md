# Classzle (클래스즐)

선생님을 위한 학급 편성 프로그램입니다. 학생 명단을 넣고 조건을 정하면 다음 학년도 반을 나눕니다. made by gnilab

## 내려받기

[최신 버전](https://github.com/pobydev/Classzle/releases/latest)에서 받습니다.

- `Classzle-Setup-<버전>.exe`: 내 PC에 설치해서 씁니다. 새 버전이 나오면 알려 줍니다.
- `Classzle-USB-<버전>.exe`(USB판): 설치 없이 USB에 넣어 씁니다. 자료는 실행 파일 옆 `클래스즐-자료` 폴더에 저장됩니다. 자동으로 업데이트되지 않으니, 새 버전은 실행 파일만 바꾸고 `클래스즐-자료` 폴더는 그대로 둡니다.

## 할 수 있는 일

- 양식 A(전학년도 명단)와 양식 B(이미 나눈 배정안)로 명단 넣기
- 학생 표에서 생활지도 바로 넣기, 담임에게 반별 입력표로 받기
- 그룹 분산, 분리 배정, 함께 배정, 고정 배정, 전출 예정 조건
- 신규 배정, 현재 배정 수정, 균형 조정
- 학생을 눌러 추천을 보고 교환하기, 되돌리기, 변경 이력
- 배정 리포트, 반별과 전학년도 반별 결과 엑셀
- 작업 저장, 작업 파일 열기·내보내기(다른 컴퓨터에서 이어 하기)

## 학생 정보

학생 정보는 이 컴퓨터 밖으로 나가지 않습니다. 인터넷은 새 버전 확인에만 씁니다.

- 켤 때 GitHub에서 새 버전이 있는지 확인합니다. 학생 정보는 보내지 않습니다. 설치는 동의할 때만 하고, 사용 가이드 창에서 확인을 끌 수 있습니다.
- USB판은 새 버전을 확인하지 않습니다. 학생 정보는 인터넷으로 보내지 않고, USB의 `클래스즐-자료` 폴더에 둡니다.
- 저장 파일과 내보낸 작업 파일은 암호화되지 않습니다. 다른 사람이 쓰는 컴퓨터에는 저장하지 말아 주세요.

## 개발

```bash
npm ci
npm test                  # 시험
npm run electron:dev      # 개발 모드로 앱 실행
npm run electron:build    # 설치 파일과 USB판 만들기 (dist 폴더)
```

새 버전을 낼 때는 `dist`의 `Classzle-Setup-<버전>.exe`, `.blockmap`, `latest.yml` 세 파일을 모두 GitHub Release에 올립니다. 하나라도 빠지면 설치된 앱이 새 버전을 받지 못합니다. USB판 `Classzle-USB-<버전>.exe`는 함께 올리되 새 버전 확인에는 쓰이지 않습니다.

앱을 띄우는 시험은 `@playwright/test`를 저장소 밖에 설치하고 그 폴더를 `PW_DIR`로 줍니다.

```bash
npm run electron:build-main && npm run build
PW_DIR=<폴더> npm run test:shell
npm run electron:build
PW_DIR=<폴더> npm run test:update
```

문의: hello@gnilab.kr
