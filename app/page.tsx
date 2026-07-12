import type { Metadata } from "next";
import CamoClashGame from "./CamoClashGame";

export const metadata: Metadata = {
  title: "Camo Clash — AESTRAWEAR",
  description: "An endless street-fight survival game. Pick your pants, unleash its power, and own the leaderboard.",
};

export default function Home() {
  return <CamoClashGame />;
}
