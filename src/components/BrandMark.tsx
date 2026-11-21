import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"

/**
 * The X-Ray mark (public/xray-mark.svg): the lime sheet torn open in an X, the
 * machinery glowing underneath. Shared by the sidebar, the mobile bar, the
 * landing and the auth pages.
 */
export function BrandMark({ className }: { className?: string }) {
  return <img src="/xray-mark.svg" alt="" width={30} height={30} className={cn("size-[30px] shrink-0 rounded-[7px]", className)} />
}

/** Mark + wordmark, linking home. */
export function BrandLink({ className, to = "/", onClick }: { className?: string; to?: string; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} aria-label="X-Ray home"
      className={cn("flex shrink-0 items-center gap-2.5 font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.01em]", className)}>
      <BrandMark />
      X-Ray
    </Link>
  )
}
