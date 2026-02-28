# Release Checklist — AI Todo (Tauri v2)

이 파일은 커밋/푸시/빌드 시 반복하지 말아야 할 실수 목록입니다.

---

## 릴리스 전 체크리스트

### 1. package.json 변경 시 → lockfile 반드시 업데이트
- **증상**: CI에서 `ERR_PNPM_OUTDATED_LOCKFILE` 에러
- **원인**: package.json에 패키지 추가/제거 후 pnpm-lock.yaml 업데이트 안 함
- **해결**: `pnpm install --no-frozen-lockfile` 실행 후 `pnpm-lock.yaml` 커밋
- **발생 사례**: v1.2.0 릴리스 시 `@tauri-apps/plugin-opener` 추가 후 lockfile 미업데이트

### 2. Android buildSrc Kotlin 파일 경로 확인
- **증상**: CI에서 `Redeclaration: BuildTask`, `Conflicting declarations: TASK_GROUP` 에러
- **원인**: `applicationId` 변경 시 구 경로 파일이 남아있고, Tauri가 신 경로에 파일 재생성 → 중복
- **올바른 경로**: `gen/android/buildSrc/src/main/java/aitodo/firstb/aitodo/kotlin/`
- **잘못된 경로 (삭제해야 함)**: `gen/android/buildSrc/src/main/java/com/aitodo/desktop/kotlin/`
- **확인 명령**: `find apps/web/src-tauri/gen/android/buildSrc -name "*.kt"`
- **발생 사례**: v1.1.x에서 applicationId 변경 후 구 경로 파일 미삭제로 v1.2.0 Android 빌드 실패

### 3. 버전 태그가 최신 커밋을 가리키는지 확인
- **증상**: CI가 버그픽스 이전 코드로 빌드됨
- **원인**: 수정 후 추가 커밋이 생겼는데 태그는 이전 커밋을 가리킴
- **해결**: 태그 재생성
  ```bash
  git tag -d vX.X.X
  git tag vX.X.X
  git push origin :refs/tags/vX.X.X
  git push origin vX.X.X
  ```

### 4. out/ 폴더는 CI가 자동 재빌드
- CI (`tauri-release.yml`)의 `beforeBuildCommand: "pnpm run build"` 가 out/ 재빌드
- 로컬 out/ 폴더가 stale해도 릴리스 바이너리(exe/msi/dmg/APK)에는 최신 코드 반영됨
- 로컬 out/ 수동 재빌드는 `.env.local` (Firebase 환경변수) 필요

---

## 릴리스 절차 (정상 흐름)

```bash
# 1. 버전 업데이트 (tauri.conf.json)
# 2. package.json 변경 시 lockfile 업데이트
pnpm install --no-frozen-lockfile
# 3. 커밋
git add -p  # 민감한 파일 제외하고 선택적으로 add
git commit -m "feat: vX.X.X - ..."
# 4. 태그 생성 및 푸시 (CI 트리거)
git push origin main
git tag vX.X.X
git push origin vX.X.X
```

## Android 관련 파일 구조

```
apps/web/src-tauri/
  gen/android/
    app/
      build.gradle.kts          ← applicationId: aitodo.firstb.aitodo
      google-services.json      ← Firebase config (비공개)
      signing.properties        ← APK 서명 설정 (비공개)
    buildSrc/src/main/java/
      aitodo/firstb/aitodo/kotlin/   ← 올바른 경로 ✓
        BuildTask.kt
        RustPlugin.kt
    src-tauri/capabilities/mobile.json
  Cargo.toml
```

## CI/CD 구조

- `.github/workflows/tauri-release.yml` — `v*.*.*` 태그 또는 workflow_dispatch 트리거
  - `build-desktop`: Windows (msi+nsis) + macOS (dmg)
  - `build-android`: APK (needs build-desktop)
- Firebase 환경변수는 GitHub Secrets에서 주입 (`NEXT_PUBLIC_FIREBASE_*`)
