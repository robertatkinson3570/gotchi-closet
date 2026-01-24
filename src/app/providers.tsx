import { Provider } from "urql";
import { client } from "@/graphql/client";
import { Toaster } from "@/ui/toaster";
import { ThemeProvider } from "./ThemeProvider";
import { AppProviders } from "@/providers/AppProviders";
import { HelmetProvider } from "react-helmet-async";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <AppProviders>
          <Provider value={client}>
            {children}
            <Toaster />
          </Provider>
        </AppProviders>
      </ThemeProvider>
    </HelmetProvider>
  );
}

