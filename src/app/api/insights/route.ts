import { adminRoute } from "@/lib/http";
import { latestInsights } from "@/lib/jobs";

export const GET = adminRoute(() => latestInsights());
