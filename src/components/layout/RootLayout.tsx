import { Outlet, useLocation, Link } from "react-router-dom";
import { Coins, Search, Shirt } from "lucide-react";
import { Button } from "@/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FooterAttribution } from "@/components/FooterAttribution";

export function RootLayout() {
  const location = useLocation();
  const isDress = location.pathname.startsWith("/dress");
  const isExplorer = location.pathname.startsWith("/explorer");
  const isWardrobeLab = location.pathname.startsWith("/wardrobe-lab");
  const isHome = location.pathname === "/";
  // Home has its own entry UI; Dress/Explorer/Wardrobe Lab take the full viewport.
  const hideHeader = isHome || isDress || isExplorer || isWardrobeLab;

  return (
    <div className="min-h-screen flex flex-col">
      {!hideHeader && (
        <header className="h-14 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity">
              <img
                src="/logo.png"
                alt="GotchiCloset"
                className="h-12 w-12 object-contain -my-2"
              />
              <div className="text-xl font-semibold tracking-tight truncate">
                Gotchi
                <span className="font-normal text-[hsl(var(--muted))]">
                  Closet
                </span>
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
                      ? "bg-primary/15 text-primary"
                      : ""
                  }`}
                  title="Lending"
                >
                  <Coins className="h-4 w-4" />
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
      {!hideHeader && (
        <FooterAttribution
          className="px-4 py-4 text-center"
        />
      )}
    </div>
  );
}
