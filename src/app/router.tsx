import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { RootLayout } from "@/components/layout/RootLayout";

// Route-based code splitting: each page is its own chunk so the first paint no
// longer ships the entire app (was a single ~2 MB bundle).
const HomePage = lazy(() => import("@/pages/HomePage"));
const DressPage = lazy(() => import("@/pages/DressPage"));
const WardrobeLabPage = lazy(() => import("@/pages/WardrobeLabPage"));
const ExplorerPage = lazy(() => import("@/pages/ExplorerPage"));
const SetsIndexPage = lazy(() => import("@/pages/SetsIndexPage"));
const SetPage = lazy(() => import("@/pages/SetPage"));
const TraitsIndexPage = lazy(() => import("@/pages/TraitsIndexPage"));
const TraitPage = lazy(() => import("@/pages/TraitPage"));
const RarityScorePage = lazy(() => import("@/pages/RarityScorePage"));
const WearablesIndexPage = lazy(() => import("@/pages/WearablesIndexPage"));
const WearablePage = lazy(() => import("@/pages/WearablePage"));
const GotchiPage = lazy(() => import("@/pages/GotchiPage"));
const LendingPage = lazy(() => import("@/pages/LendingPage"));
const LendingAnalyticsPage = lazy(() => import("@/pages/LendingAnalyticsPage"));
const LendingMePage = lazy(() => import("@/pages/LendingMePage"));
const LandManagementPage = lazy(() => import("@/pages/LandManagementPage"));
const WhitelistsPage = lazy(() => import("@/pages/WhitelistsPage"));
const BulkListPage = lazy(() => import("@/pages/BulkListPage"));
const ActivityPage = lazy(() => import("@/pages/ActivityPage"));
const UserActivityPage = lazy(() => import("@/pages/UserActivityPage"));
const StatsPage = lazy(() => import("@/pages/StatsPage"));
const LeaderboardPage = lazy(() => import("@/pages/LeaderboardPage"));
const DaoPage = lazy(() => import("@/pages/DaoPage"));
const GetTokensPage = lazy(() => import("@/pages/GetTokensPage"));
const ForgePage = lazy(() => import("@/pages/ForgePage"));
const SoulVerifyPage = lazy(() => import("@/pages/SoulVerifyPage"));
const StewardPage = lazy(() => import("@/pages/StewardPage"));
const PublicGotchiPage = lazy(() => import("@/pages/PublicGotchiPage"));
const PublicBattlePage = lazy(() => import("@/pages/PublicBattlePage"));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "sets", element: <SetsIndexPage /> },
      { path: "sets/:slug", element: <SetPage /> },
      { path: "traits", element: <TraitsIndexPage /> },
      { path: "traits/:trait", element: <TraitPage /> },
      { path: "rarity-score", element: <RarityScorePage /> },
      { path: "wearables", element: <WearablesIndexPage /> },
      { path: "wearable/:slug", element: <WearablePage /> },
      { path: "gotchi/:tokenId", element: <GotchiPage /> },
      { path: "dress", element: <DressPage /> },
      { path: "wardrobe-lab", element: <WardrobeLabPage /> },
      { path: "explorer", element: <ExplorerPage /> },
      { path: "baazaar", element: <ExplorerPage /> },
      { path: "me", element: <Navigate to="/explorer?scope=owned" replace /> },
      { path: "me/activity", element: <UserActivityPage /> },
      { path: "u/:address", element: <UserActivityPage /> },
      { path: "u/:address/activity", element: <UserActivityPage /> },
      { path: "activity", element: <ActivityPage /> },
      { path: "stats", element: <StatsPage /> },
      { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "dao", element: <DaoPage /> },
      { path: "get-tokens", element: <GetTokensPage /> },
      { path: "forge", element: <ForgePage /> },
      { path: "steward", element: <StewardPage /> },
      { path: "soul/verify/:tokenId", element: <SoulVerifyPage /> },
      // Public arena — no wallet required
      { path: "g/:tokenId", element: <PublicGotchiPage /> },
      { path: "arena/:a/vs/:b", element: <PublicBattlePage /> },
      { path: "lending", element: <LendingPage /> },
      { path: "lending/analytics", element: <LendingAnalyticsPage /> },
      { path: "lending/me", element: <LendingMePage /> },
      { path: "lending/lands", element: <LandManagementPage /> },
      { path: "lending/me/list", element: <BulkListPage /> },
      { path: "lending/whitelists", element: <WhitelistsPage /> },
    ],
  },
]);
