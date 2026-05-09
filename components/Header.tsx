export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <a href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">
            م
          </div>
          <span className="text-base font-semibold tracking-tight text-black">المتجر</span>
        </a>

        <nav className="flex items-center gap-1">
          <a
            href="#features"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/5 hover:text-black md:block"
          >
            المميزات
          </a>
          <a
            href="#testimonials"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-black/70 transition-colors hover:bg-black/5 hover:text-black md:block"
          >
            الآراء
          </a>
          <a
            href="#order"
            className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-900"
          >
            اشترِ الآن
          </a>
        </nav>
      </div>
    </header>
  );
}
