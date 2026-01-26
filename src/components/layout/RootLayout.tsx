import { Outlet, useLocation, Link } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { FooterAttribution } from "@/components/FooterAttribution";

export function RootLayout() {
  const location = useLocation();
  const isDress = location.pathname.startsWith("/dress");
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      {!isDress && (
        <header className="h-14 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
              <img
                src="/logo.png"
                alt="GotchiCloset"
                className="h-10 w-10 object-contain"
              />
              <div className="text-xl font-semibold tracking-tight truncate">
                Gotchi
                <span className="font-normal text-[hsl(var(--muted))]">
                  Closet
                </span>
              </div>
            </Link>
            <ThemeToggle />
          </div>
        </header>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
      {!isDress && (
        <FooterAttribution
          className="px-4 py-4 text-center"
          showLink={!isHome}
        />
      )}
    </div>
  );
}

