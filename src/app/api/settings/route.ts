import { adminRoute, body } from "@/lib/http";
import { getSettings, updateSettings, type Settings } from "@/lib/settings";

export const GET = adminRoute(() => getSettings());
export const PUT = adminRoute(async (req) => updateSettings(await body<Partial<Settings>>(req)));
