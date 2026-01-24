import { SITE_URL } from "@/lib/config";

export function siteUrl(pathname: string) {
  if (!pathname.startsWith("/")) return `${SITE_URL}/${pathname}`;
  return `${SITE_URL}${pathname}`;
}

