import { Outlet, useLocation, Link } from "react-router-dom";
import { Coins, Search, Shirt, MapPin } from "lucide-react";
import { Button } from "@/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FooterAttribution } from "@/components/FooterAttribution";

export function RootLayout() {
  const location = useLocation();
  const isDress = location.pathname.startsWith("/dress");
  const isExplorer = location.pathname.startsWith("/explorer");
  const isWardrobeLab = location.pathname.startsWith("/wardrobe-lab");
  const isHome = location.pathname === "/";
  const hideHeader = isHome || isDress || isExplorer || isWardrobeLab;

  return (
    <div className="min-h-screen flex flex-col">
      {!hideHeader && (
        <header className="h-14 w-full glass-nav sticky top-0 z-30">
          <div className="flex h-14 items-center justify-between px-3 md:px-4 gap-3 max-w-[1600px] mx-auto">
            <Link
              to="/"
              className="flex items-center gap-1.5 min-w-0 hover:opacity-90 transition-opacity"
            >
              <img
                src="/logo.png"
                alt="GotchiCloset"
                className="h-12 w-12 object-contain -my-2"
              />
              <div className="text-xl font-heading tracking-tight truncate gradient-text">
                GotchiCloset
              </div>
            </Link>
            <div className="flex items-center gap-1.5">
              <Link to="/explorer">
                <Button size="sm" variant="ghost" className="h-8 px-2" title="Explorer">
                  <Search className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/dress">
                <Button size="sm" variant="ghost" className="h-8 px-2" title="Dress">
                  <Shirt className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/lending">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-8 px-2 ${
                    location.pathname.startsWith("/lending")
                      ? "bg-primary/15 text-primary shadow-glow-sm"
                      : ""
                  }`}
                  title="Lending"
                >
                  <Coins className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/lending/lands">
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-8 px-2 ${
                    location.pathname.startsWith("/lending/lands")
                      ? "bg-primary/15 text-primary shadow-glow-sm"
                      : ""
                  }`}
                  title="Land Management"
                >
                  <MapPin className="h-4 w-4" />
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}
      <main className="flex-1 relative z-[1]">
        <Outlet />
      </main>
      {!hideHeader && (
        <FooterAttribution className="px-4 py-4 text-center" />
      )}
    </div>
  );
}
