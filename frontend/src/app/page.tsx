"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";

// ── 기능 카드 데이터 ───────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "🔍",
    title: "Story Keeper",
    desc: "캐릭터·플롯·세계관 설정을 회차마다 자동으로 비교해 모순을 찾아냅니다.",
    color: "bg-blue-50 border-blue-100",
    iconBg: "bg-blue-100",
  },
  {
    icon: "📋",
    title: "AI 리뷰",
    desc: "스토리·캐릭터·템포·문체 등 7개 항목을 점수화해 구체적인 피드백을 제공합니다.",
    color: "bg-purple-50 border-purple-100",
    iconBg: "bg-purple-100",
  },
  {
    icon: "📖",
    title: "위키 자동 추출",
    desc: "회차를 저장하면 등장인물·장소·사건을 자동으로 분류해 설정집을 만들어 줍니다.",
    color: "bg-emerald-50 border-emerald-100",
    iconBg: "bg-emerald-100",
  },
  {
    icon: "✨",
    title: "플롯 AI",
    desc: "현재 흐름을 분석해 다음 전개 방향 3가지를 추천하거나 새 플롯 아이디어를 생성합니다.",
    color: "bg-amber-50 border-amber-100",
    iconBg: "bg-amber-100",
  },
  {
    icon: "🔎",
    title: "Clio 팩트 체커",
    desc: "역사·사실 관계를 웹 검색과 지식 DB로 교차 검증해 고증 오류를 잡아냅니다.",
    color: "bg-orange-50 border-orange-100",
    iconBg: "bg-orange-100",
  },
  {
    icon: "📤",
    title: "원고 내보내기",
    desc: "완성된 원고를 txt·docx·pdf·epub 등 다양한 형식으로 바로 내보낼 수 있습니다.",
    color: "bg-rose-50 border-rose-100",
    iconBg: "bg-rose-100",
  },
];

const STEPS = [
  { num: "01", title: "프로젝트 생성", desc: "소설 제목·장르·플랫폼 설정" },
  { num: "02", title: "설정 구축", desc: "캐릭터·세계관·자료 등록" },
  { num: "03", title: "AI 보조 집필", desc: "에디터 + 플롯 AI + 맞춤법" },
  { num: "04", title: "검수 & 완성", desc: "일관성 검사 + 리뷰 + 내보내기" },
];

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  function handleStart() {
    if (token) {
      router.push("/projects");
    } else {
      router.push("/signup");
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-moneta flex items-center justify-center">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <span className="font-semibold text-gray-900">Moneta</span>
          </div>
          <div className="flex items-center gap-3">
            {token ? (
              <Link
                href="/projects"
                className="px-4 py-1.5 bg-moneta text-white text-sm font-medium rounded-lg hover:bg-moneta-dark transition-colors"
              >
                내 프로젝트
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  로그인
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-1.5 bg-moneta text-white text-sm font-medium rounded-lg hover:bg-moneta-dark transition-colors"
                >
                  무료로 시작하기
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── 히어로 ─────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-moneta-light text-moneta text-xs font-medium rounded-full mb-6">
          <span>✦</span>
          <span>AI 웹소설 창작 어시스턴트</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-5">
          쓰는 데만 집중하세요.
          <br />
          <span className="text-moneta">나머지는 Moneta가 합니다.</span>
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          일관성 검사, AI 리뷰, 위키 자동 생성, 플롯 추천까지.
          <br />
          웹소설 작가를 위한 AI 집필 도구를 한 곳에서.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={handleStart}
            className="px-6 py-3 bg-moneta text-white font-medium rounded-xl hover:bg-moneta-dark transition-colors shadow-md shadow-moneta/20"
          >
            무료로 시작하기 →
          </button>
          {!token && (
            <Link
              href="/login"
              className="px-6 py-3 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
            >
              로그인
            </Link>
          )}
        </div>
      </section>

      {/* ── 기능 카드 ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
            창작의 모든 단계를 지원합니다
          </h2>
          <p className="text-center text-gray-500 text-sm mb-12">
            Gemini 2.5 Flash · GPT-4o 기반
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl border p-6 ${f.color} transition-transform hover:-translate-y-0.5`}
              >
                <div className={`w-10 h-10 rounded-xl ${f.iconBg} flex items-center justify-center text-xl mb-4`}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 사용 흐름 ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">
            4단계로 완성하는 웹소설
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <div key={s.num} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block absolute top-5 left-[60%] w-full h-px bg-gray-200" />
                )}
                <div className="w-10 h-10 rounded-full bg-moneta-light text-moneta font-bold text-sm flex items-center justify-center mx-auto mb-3 relative z-10">
                  {s.num}
                </div>
                <p className="font-semibold text-gray-900 text-sm mb-1">{s.title}</p>
                <p className="text-xs text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA 배너 ─────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-moneta">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            지금 바로 시작해보세요
          </h2>
          <p className="text-moneta-light text-sm mb-8">
            회원가입 후 바로 사용 가능합니다.
          </p>
          <button
            onClick={handleStart}
            className="px-8 py-3 bg-white text-moneta font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            무료로 시작하기
          </button>
        </div>
      </section>

      {/* ── 푸터 ─────────────────────────────────────────────────────────────── */}
      <footer className="py-8 px-6 border-t border-gray-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-moneta flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">M</span>
            </div>
            <span>Moneta</span>
          </div>
          <span>웹소설 AI 창작 어시스턴트</span>
        </div>
      </footer>

    </div>
  );
}
