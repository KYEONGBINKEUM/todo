'use client';

const SHARED_LISTS = [
  {
    id: 's1',
    name: '프로젝트 A - 디자인 팀',
    color: '#8b5cf6',
    icon: '🎨',
    owner: '김디자인',
    members: ['나', '김디자인', '박개발', '이기획'],
    permission: 'edit' as const,
    taskCount: 12,
    completedCount: 5,
  },
  {
    id: 's2',
    name: '가족 장보기',
    color: '#06b6d4',
    icon: '🛒',
    owner: '나',
    members: ['나', '배우자'],
    permission: 'admin' as const,
    taskCount: 8,
    completedCount: 3,
  },
  {
    id: 's3',
    name: '스터디 그룹 과제',
    color: '#22c55e',
    icon: '📚',
    owner: '최스터디',
    members: ['나', '최스터디', '정학습', '한열공'],
    permission: 'view' as const,
    taskCount: 6,
    completedCount: 1,
  },
];

const permissionLabels = {
  view: { label: '보기', color: '#64748b' },
  edit: { label: '편집', color: '#8b5cf6' },
  admin: { label: '관리자', color: '#e94560' },
};

export default function SharedPage() {
  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">👥</span>
            <h2 className="text-3xl font-extrabold">공유됨</h2>
          </div>
          <p className="text-[#94a3b8] text-sm">다른 사람과 공유된 목록을 관리하세요</p>
        </div>

        {/* Shared Lists */}
        <div className="space-y-3">
          {SHARED_LISTS.map((list, index) => {
            const perm = permissionLabels[list.permission];
            const progress = list.taskCount > 0 ? (list.completedCount / list.taskCount) * 100 : 0;

            return (
              <div
                key={list.id}
                className="p-5 bg-[#111128] border border-[#1e1e3a] rounded-xl hover:border-[#333] transition-all cursor-pointer group"
                style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: `${list.color}20` }}
                  >
                    {list.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-[#e2e8f0] truncate">{list.name}</h3>
                      <span
                        className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ color: perm.color, backgroundColor: `${perm.color}20` }}
                      >
                        {perm.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748b] mb-3">
                      공유자: {list.owner} · {list.members.length}명 참여
                    </p>

                    {/* Progress */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-[#1e1e3a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress}%`, backgroundColor: list.color }}
                        />
                      </div>
                      <span className="text-[10px] text-[#64748b]">
                        {list.completedCount}/{list.taskCount}
                      </span>
                    </div>
                  </div>

                  {/* Members */}
                  <div className="flex -space-x-2 flex-shrink-0">
                    {list.members.slice(0, 3).map((member, i) => (
                      <div
                        key={i}
                        className="w-7 h-7 rounded-full border-2 border-[#111128] flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ backgroundColor: ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e'][i % 4] }}
                      >
                        {member[0]}
                      </div>
                    ))}
                    {list.members.length > 3 && (
                      <div className="w-7 h-7 rounded-full border-2 border-[#111128] bg-[#1e1e3a] flex items-center justify-center text-[9px] text-[#94a3b8]">
                        +{list.members.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Invite CTA */}
        <div className="mt-8 p-5 border-2 border-dashed border-[#1e1e3a] rounded-xl text-center hover:border-[#e94560]/30 transition-colors cursor-pointer group">
          <div className="text-3xl mb-2">✉️</div>
          <p className="text-sm font-semibold text-[#94a3b8] group-hover:text-[#e2e8f0] transition-colors">
            새 목록 공유하기
          </p>
          <p className="text-[11px] text-[#64748b] mt-1">
            이메일 주소로 목록을 공유하고 함께 작업하세요
          </p>
        </div>

        {/* Premium upsell */}
        <div className="mt-6 p-4 bg-gradient-to-r from-[#111128] to-[#0a0a23] border border-[#1e1e3a] rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white">
              TEAM
            </span>
            <span className="text-xs font-bold text-[#94a3b8]">팀 플랜으로 업그레이드</span>
          </div>
          <p className="text-[11px] text-[#64748b]">
            무제한 공유, 실시간 협업, 역할 기반 권한 관리 등 팀을 위한 강력한 기능을 사용해보세요.
          </p>
        </div>
      </div>
    </div>
  );
}
