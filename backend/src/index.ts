import { Hono } from "hono";
import type { Context } from "hono";
import { supabase } from "./supabaseClient";
import { queueBundleBuild } from "./utils";

const app = new Hono();

const DEFAULT_PLATFORM = "android";

type BundleRecord = {
  id: number;
  platform: string;
  version: number;
  bundle_url: string;
  checksum: string | null;
  created_at: string;
};

app.get("/", (c) => c.text("OK"));

app.get("/bundle/latest", async (c: Context) => {
  const platform = c.req.query("platform") ?? DEFAULT_PLATFORM;

  const { data, error } = await supabase
    .from("bundles")
    .select("*")
    .eq("platform", platform)
    .order("version", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error fetching latest bundle:", error);
    return c.json({ error: "failed_to_fetch_latest_bundle" }, 500);
  }

  const record = (data?.[0] as BundleRecord | undefined) ?? null;

  if (!record) {
    return c.json({ latest: null });
  }

  return c.json({
    latest: {
      id: record.id,
      platform: record.platform,
      version: record.version,
      bundleUrl: record.bundle_url,
      checksum: record.checksum,
      createdAt: record.created_at,
    },
  });
});

app.post("/bundle", async (c: Context) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    platform?: string;
  };

  const platform = body.platform ?? c.req.query("platform") ?? DEFAULT_PLATFORM;

  queueBundleBuild(platform).catch((err) => {
    console.error("Background bundle build failed:", err);
  });

  return c.json({ status: "queued", platform }, 202);
});

export default app;
