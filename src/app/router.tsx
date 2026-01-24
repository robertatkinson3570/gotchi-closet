import { createBrowserRouter } from "react-router-dom";
import HomePage from "@/pages/HomePage";
import DressPage from "@/pages/DressPage";
import SetsIndexPage from "@/pages/SetsIndexPage";
import SetPage from "@/pages/SetPage";
import TraitsIndexPage from "@/pages/TraitsIndexPage";
import TraitPage from "@/pages/TraitPage";
import RarityScorePage from "@/pages/RarityScorePage";
import WearablesIndexPage from "@/pages/WearablesIndexPage";
import WearablePage from "@/pages/WearablePage";
import GotchiPage from "@/pages/GotchiPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { RootLayout } from "@/components/layout/RootLayout";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootLayout />,
      errorElement: <ErrorBoundary />,
      children: [
        {
          index: true,
          element: <HomePage />,
        },
        {
          path: "sets",
          element: <SetsIndexPage />,
        },
        {
          path: "sets/:slug",
          element: <SetPage />,
        },
        {
          path: "traits",
          element: <TraitsIndexPage />,
        },
        {
          path: "traits/:trait",
          element: <TraitPage />,
        },
        {
          path: "rarity-score",
          element: <RarityScorePage />,
        },
        {
          path: "wearables",
          element: <WearablesIndexPage />,
        },
        {
          path: "wearable/:slug",
          element: <WearablePage />,
        },
        {
          path: "gotchi/:tokenId",
          element: <GotchiPage />,
        },
        {
          path: "dress",
          element: <DressPage />,
        },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
    },
  }
);

