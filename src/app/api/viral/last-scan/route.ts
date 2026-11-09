import { adminRoute } from "@/lib/http";
import { lastScan, lastScraperRun } from "@/lib/viral";
import { getSettings } from "@/lib/settings";
import { apifyUsage, estimateRunUsd } from "@/lib/apify";
import { config } from "@/lib/config";

// Kết quả lần quét gần nhất + trạng thái nguồn quét hiện tại (để hiện banner / chi phí trên UI)
export const GET = adminRoute(async () => {
  const s = await getSettings();
  return {
    last: await lastScan(),
    source: s.viralSource,
    scraper: { last: await lastScraperRun(), accounts: s.viralSourceAccounts.length, intervalMinutes: s.scraperIntervalMinutes },
    apify: {
      hasToken: !!config.apifyToken,
      usage: await apifyUsage(s),
      estRunUsd: Math.round(estimateRunUsd(s) * 1000) / 1000,
      budget: s.apifyMonthlyBudget,
    },
  };
});
