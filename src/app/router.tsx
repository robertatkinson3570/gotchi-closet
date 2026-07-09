import { createBrowserRouter, Navigate } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { RootLayout } from "@/components/layout/RootLayout";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Route-based code splitting: each page is its own chunk so the first paint no
// longer ships the entire app (was a single ~2 MB bundle). lazyWithRetry hard-
// reloads once if a chunk 404s after a redeploy (stale index.html).
const HomePage = lazyWithRetry(() => import("@/pages/HomePage"));
const DressPage = lazyWithRetry(() => import("@/pages/DressPage"));
const WardrobeLabPage = lazyWithRetry(() => import("@/pages/WardrobeLabPage"));
const ExplorerPage = lazyWithRetry(() => import("@/pages/ExplorerPage"));
const SetsIndexPage = lazyWithRetry(() => import("@/pages/SetsIndexPage"));
const SetPage = lazyWithRetry(() => import("@/pages/SetPage"));
const TraitsIndexPage = lazyWithRetry(() => import("@/pages/TraitsIndexPage"));
const TraitPage = lazyWithRetry(() => import("@/pages/TraitPage"));
const RarityScorePage = lazyWithRetry(() => import("@/pages/RarityScorePage"));
const WearablesIndexPage = lazyWithRetry(() => import("@/pages/WearablesIndexPage"));
const WearablePage = lazyWithRetry(() => import("@/pages/WearablePage"));
const GotchiPage = lazyWithRetry(() => import("@/pages/GotchiPage"));
const LendingPage = lazyWithRetry(() => import("@/pages/LendingPage"));
const LendingAnalyticsPage = lazyWithRetry(() => import("@/pages/LendingAnalyticsPage"));
const LendingMePage = lazyWithRetry(() => import("@/pages/LendingMePage"));
const LandManagementPage = lazyWithRetry(() => import("@/pages/LandManagementPage"));
const WhitelistsPage = lazyWithRetry(() => import("@/pages/WhitelistsPage"));
const BulkListPage = lazyWithRetry(() => import("@/pages/BulkListPage"));
const ActivityPage = lazyWithRetry(() => import("@/pages/ActivityPage"));
const UserActivityPage = lazyWithRetry(() => import("@/pages/UserActivityPage"));
const StatsPage = lazyWithRetry(() => import("@/pages/StatsPage"));
const PulsePage = lazyWithRetry(() => import("@/pages/PulsePage"));
const GameCenterPage = lazyWithRetry(() => import("@/pages/GameCenterPage"));
const MegaphonePage = lazyWithRetry(() => import("@/pages/MegaphonePage"));
const LeaderboardPage = lazyWithRetry(() => import("@/pages/LeaderboardPage"));
const DaoPage = lazyWithRetry(() => import("@/pages/DaoPage"));
const GetTokensPage = lazyWithRetry(() => import("@/pages/GetTokensPage"));
const ForgePage = lazyWithRetry(() => import("@/pages/ForgePage"));
const StakingPage = lazyWithRetry(() => import("@/pages/StakingPage"));
const SoulVerifyPage = lazyWithRetry(() => import("@/pages/SoulVerifyPage"));
const StewardPage = lazyWithRetry(() => import("@/pages/StewardPage"));
const PublicGotchiPage = lazyWithRetry(() => import("@/pages/PublicGotchiPage"));
const PublicBattlePage = lazyWithRetry(() => import("@/pages/PublicBattlePage"));
const AdminPage = lazyWithRetry(() => import("@/pages/AdminPage"));
// Guides (SEO content pages, see seo-output/content-plan.md briefs 7-18)
const GuidesIndexPage = lazyWithRetry(() => import("@/pages/guides/GuidesIndexPage"));
const BaseMigrationGuide = lazyWithRetry(() => import("@/pages/guides/BaseMigrationGuide"));
const GetStartedGuide = lazyWithRetry(() => import("@/pages/guides/GetStartedGuide"));
const RarityFarmingGuide = lazyWithRetry(() => import("@/pages/guides/RarityFarmingGuide"));
const KinshipGuide = lazyWithRetry(() => import("@/pages/guides/KinshipGuide"));
const ForgeGuide = lazyWithRetry(() => import("@/pages/guides/ForgeGuide"));
const GhstGuide = lazyWithRetry(() => import("@/pages/guides/GhstGuide"));
const WhatIsAavegotchiGuide = lazyWithRetry(() => import("@/pages/guides/WhatIsAavegotchiGuide"));
const BaazaarGuide = lazyWithRetry(() => import("@/pages/guides/BaazaarGuide"));
const GotchiLendingGuide = lazyWithRetry(() => import("@/pages/guides/GotchiLendingGuide"));
const GotchiBattlerGuide = lazyWithRetry(() => import("@/pages/guides/GotchiBattlerGuide"));
const WearableSetsGuide = lazyWithRetry(() => import("@/pages/guides/WearableSetsGuide"));
const ValuationGuide = lazyWithRetry(() => import("@/pages/guides/ValuationGuide"));

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
      { path: "pulse", element: <PulsePage /> },
      { path: "games", element: <GameCenterPage /> },
      { path: "megaphone", element: <MegaphonePage /> },
      { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "dao", element: <DaoPage /> },
      { path: "get-tokens", element: <GetTokensPage /> },
      { path: "forge", element: <ForgePage /> },
      { path: "staking", element: <StakingPage /> },
      { path: "steward", element: <StewardPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "guides", element: <GuidesIndexPage /> },
      { path: "guides/base-migration", element: <BaseMigrationGuide /> },
      { path: "guides/get-started", element: <GetStartedGuide /> },
      { path: "guides/rarity-farming", element: <RarityFarmingGuide /> },
      { path: "guides/kinship", element: <KinshipGuide /> },
      { path: "guides/forge", element: <ForgeGuide /> },
      { path: "guides/ghst", element: <GhstGuide /> },
      { path: "guides/what-is-aavegotchi", element: <WhatIsAavegotchiGuide /> },
      { path: "guides/baazaar", element: <BaazaarGuide /> },
      { path: "guides/gotchi-lending", element: <GotchiLendingGuide /> },
      { path: "guides/gotchi-battler", element: <GotchiBattlerGuide /> },
      { path: "guides/wearable-sets", element: <WearableSetsGuide /> },
      { path: "guides/valuation", element: <ValuationGuide /> },
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
