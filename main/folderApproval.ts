/**
 * 메인 프로세스에서 교사가 고른 폴더만 기억합니다. 화면이 넘긴 경로는 고른 폴더와 같을 때 한 번만 받습니다.
 * 같은 이름이 있어 덮어쓸지 물었다가 다시 저장할 때 씁니다.
 */
export function createFolderApproval() {
    let approved: string | null = null;
    return {
        approve(folder: string) {
            approved = folder;
        },
        take(folder: string): boolean {
            const ok = approved !== null && folder === approved;
            approved = null;
            return ok;
        },
    };
}
