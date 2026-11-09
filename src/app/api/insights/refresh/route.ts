import { adminRoute } from "@/lib/http";
import { collectInsights } from "@/lib/jobs";

export const maxDuration = 60;
export const POST = adminRoute(() => collectInsights());
