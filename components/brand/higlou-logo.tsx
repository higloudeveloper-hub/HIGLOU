import Link from "next/link";
import { cn } from "@/lib/utils";

/** Geometric hive + H. No sparkles. */
export function HiglouMarkIcon({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <path
        d="M16 1.8 28.4 8.9v14.2L16 30.2 3.6 23.1V8.9L16 1.8Z"
        fill="#141414"
      />
      <path
        d="M11.1 9.4h2.85v5.05h4.1V9.4H20.9v13.2h-2.85v-5.25h-4.1v5.25H11.1V9.4Z"
        fill="#C9A227"
      />
    </svg>
  );
}

export function HiglouLogo({
  href = "/home",
  size = 32,
  wordmark = true,
  className,
  subtitle,
  onClick,
}: {
  href?: string | false;
  size?: number;
  wordmark?: boolean;
  className?: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <HiglouMarkIcon size={size} />
      {wordmark ? (
        <span className="min-w-0">
          <span className="block text-[17px] leading-none font-semibold tracking-[-0.045em] text-[#141414] sm:text-[18px]">
            Higlou
          </span>
          {subtitle ? (
            <span className="mt-1 block text-[11px] leading-none tracking-[0.04em] text-[#707070]">
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  const row = cn("inline-flex items-center gap-2.5 no-underline", className);

  if (href === false) {
    return (
      <span className={row} aria-label="Higlou">
        {inner}
      </span>
    );
  }

  return (
    <Link href={href} onClick={onClick} className={row} aria-label="Higlou home">
      {inner}
    </Link>
  );
}
