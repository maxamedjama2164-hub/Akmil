"use client";

export const AVATAR_GRADIENTS = [
  ["#059669", "#064e3b"], // emerald
  ["#3b82f6", "#1e3a8a"], // blue
  ["#7c3aed", "#4c1d95"], // purple
  ["#dc2626", "#7f1d1d"], // red
  ["#d97706", "#78350f"], // amber
  ["#0891b2", "#164e63"], // cyan
  ["#db2777", "#831843"], // pink
  ["#65a30d", "#365314"], // lime
] as const;

function deterministicIdx(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  }
  return h % AVATAR_GRADIENTS.length;
}

const SIZE = {
  xs: { box: "w-7 h-7", text: "text-xs" },
  sm: { box: "w-9 h-9", text: "text-sm" },
  md: { box: "w-12 h-12", text: "text-base" },
  lg: { box: "w-20 h-20", text: "text-3xl" },
  xl: { box: "w-28 h-28", text: "text-4xl" },
};

export function Avatar({
  name,
  size = "md",
  colorIdx,
  imageData,
}: {
  name: string;
  size?: keyof typeof SIZE;
  colorIdx?: number;
  imageData?: string | null;
}) {
  const { box, text } = SIZE[size];

  if (imageData) {
    return (
      <div className={`${box} rounded-full overflow-hidden shrink-0 ring-2 ring-slate-700`}>
        <img
          src={imageData}
          alt={name}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  const idx = colorIdx ?? deterministicIdx(name);
  const [from, to] = AVATAR_GRADIENTS[idx];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`${box} rounded-full flex items-center justify-center font-black text-white shrink-0`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <span className={text}>{initial}</span>
    </div>
  );
}
