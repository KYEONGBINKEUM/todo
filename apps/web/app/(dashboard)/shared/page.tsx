'use client';

// TODO: Firestore 권한 규칙 수정 후 부활
// 기존 에러: FirebaseError: Missing or insufficient permissions.
// 원본 코드는 git history에서 복원 가능

import { useI18n } from '@/lib/i18n-context';

export default function SharedPage() {
  const { t } = useI18n();

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">👥</span>
            <h2 className="text-2xl font-bold text-text-primary">{t('shared.title')}</h2>
          </div>
          <p className="text-text-secondary text-sm">{t('shared.desc')}</p>
        </div>

        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center">
            <div className="text-5xl mb-4">🚧</div>
            <p className="text-lg font-bold text-text-primary mb-2">준비 중</p>
            <p className="text-sm text-text-muted">공유 기능은 현재 점검 중입니다.<br />빠른 시일 내에 다시 제공하겠습니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
