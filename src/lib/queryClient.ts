import { QueryClient } from "@tanstack/react-query";

// Single app-wide QueryClient. Exported (rather than created inline in
// AppProviders) so imperative cache invalidators in data hooks can reach it
// without prop-drilling or a context read.
export const queryClient = new QueryClient();
