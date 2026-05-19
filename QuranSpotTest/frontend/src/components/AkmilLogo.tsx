type Size = "sm" | "md" | "lg";

const sizes: Record<Size, { img: string; label: string }> = {
  sm: { img: "w-8 h-8", label: "text-xs" },
  md: { img: "w-10 h-10", label: "text-sm" },
  lg: { img: "w-14 h-14", label: "text-base" },
};

export function AkmilLogo({ size = "md" }: { size?: Size }) {
  const s = sizes[size];
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo.svg"
        alt="Akmil logo"
        className={`${s.img} shrink-0`}
      />
      <div className="flex flex-col leading-tight">
        <span
          dir="rtl"
          className="font-arabic text-sm font-bold text-emerald-400 tracking-wide"
        >
          أكمل
        </span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          Akmil
        </span>
      </div>
    </div>
  );
}
