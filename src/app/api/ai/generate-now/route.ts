import { adminRoute } from "@/lib/http";
import { autoGeneratePost } from "@/lib/jobs";

export const POST = adminRoute(async () => ({ item: await autoGeneratePost() }));
