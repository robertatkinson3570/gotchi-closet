import { Outlet, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { WalletHeader } from "@/components/wallet/WalletHeader";
import { FooterAttribution } from "@/components/FooterAttribution";

export function RootLayout() {
  const location = useLocation();
  const isDress = location.pathname.startsWith("/dress");
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      {isDress ? (
        <WalletHeader />
      ) : (
        <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <Logo variant="navbar" />
              <div className="min-w-0 flex flex-col leading-tight">
                <div className="text-xl font-semibold tracking-tight truncate">
                  Gotchi
                  <span className="font-normal text-[hsl(var(--muted))]">
                    Closet
                  </span>
                </div>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
      <FooterAttribution
        className="px-4 py-4 text-center"
        showLink={!isHome && !isDress}
      />
    </div>
  );
}

