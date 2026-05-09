export default function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white py-10">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">
              م
            </div>
            <span className="text-sm font-semibold tracking-tight text-black">المتجر</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-black/60">
            <span>دفع عند الاستلام</span>
            <span className="hidden md:inline">·</span>
            <span>توصيل لجميع الولايات</span>
            <span className="hidden md:inline">·</span>
            <span>ضمان الإرجاع</span>
          </div>

          <div className="text-xs text-black/40">
            © {new Date().getFullYear()} جميع الحقوق محفوظة
          </div>
        </div>
      </div>
    </footer>
  );
}
