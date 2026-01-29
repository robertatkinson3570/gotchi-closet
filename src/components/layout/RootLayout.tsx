import { Outlet, useLocation, Link } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FooterAttribution } from "@/components/FooterAttribution";
import { Shirt, Search } from "lucide-react";

export function RootLayout() {
  const location = useLocation();
  const isDress = location.pathname.startsWith("/dress");
  const isExplorer = location.pathname.startsWith("/explorer");
  const isHome = location.pathname === "/";
  const hideHeader = isDress || isExplorer;

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
            <div className="flex items-center gap-1">
              <Link
                to="/explorer"
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Explorer"
              >
                <Search className="h-5 w-5" />
              </Link>
              <Link
                to="/dress"
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Dress"
              >
                <Shirt className="h-5 w-5" />
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
          showLink={!isHome}
        />
      )}
    </div>
  );
}

