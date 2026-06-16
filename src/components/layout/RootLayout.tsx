import { Suspense } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Coins, Search, Shirt, MapPin, Activity, Gavel, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FooterAttribution } from "@/components/FooterAttribution";

// Every page shows the full nav so all sections are reachable everywhere.
const NAV: { to: string; title: string; icon: LucideIcon }[] = [
  { to: "/explorer", title: "Explorer / Baazaar", icon: Search },
  { to: "/dress", title: "Dress", icon: Shirt },
  { to: "/auction", title: "Auctions", icon: Gavel },
  { to: "/activity", title: "Activity", icon: Activity },
  { to: "/lending", title: "Lending", icon: Coins },
  { to: "/lending/lands", title: "Land Management", icon: MapPin },
  { to: "/me", title: "My Profile", icon: User },
];

function isActive(pathname: string, to: string): boolean {
  if (to === "/lending") return pathname === "/lending" || pathname.startsWith("/lending/me") || pathname.startsWith("/lending/analytics") || pathname.startsWith("/lending/whitelists");
  return pathname === to || pathname.startsWith(to + "/");
}

export function RootLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 w-full glass-nav sticky top-0 z-30">
        <div className="flex h-14 items-center justify-between px-3 md:px-4 gap-3 max-w-[1600px] mx-auto">
          <Link to="/" className="flex items-center gap-1.5 min-w-0 hover:opacity-90 transition-opacity">
            <img src="/logo.png" alt="GotchiCloset" className="h-12 w-12 object-contain -my-2" />
            <div className="text-xl font-heading tracking-tight truncate gradient-text hidden sm:block">GotchiCloset</div>
          </Link>
          <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap justify-end">
            {NAV.map(({ to, title, icon: Icon }) => (
              <Link key={to} to={to}>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-8 px-2 ${isActive(location.pathname, to) ? "bg-primary/15 text-primary shadow-glow-sm" : ""}`}
                  title={title}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </Link>
            ))}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 relative z-[1]">
        <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <FooterAttribution className="px-4 py-4 text-center" />
    </div>
  );
}
