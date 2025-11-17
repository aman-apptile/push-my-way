import { Hono } from "hono";
import type { Context } from "hono";
import path from "node:path";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { supabase } from "../../push-my-way-db/supabaseClient";

const app = new Hono();

const DEFAULT_PLATFORM = "android";
const STORAGE_BUCKET = "bundles";

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

  // Fire-and-forget background job so the request thread is not blocked
  queueBundleBuild(platform).catch((err) => {
    console.error("Background bundle build failed:", err);
  });

  return c.json({ status: "queued", platform }, 202);
});

async function queueBundleBuild(platform: string): Promise<void> {
  const backendRoot = Bun.cwd();
  const rnProjectRoot = path.resolve(backendRoot, "../PushMyWay");
  const buildOutputDir = path.resolve(rnProjectRoot, "codepush");

  fs.mkdirSync(buildOutputDir, { recursive: true });

  const nextVersion = await allocateNextVersion(platform);

  const bundleFilename = `index.${platform}.v${nextVersion}.bundle`;
  const bundlePath = path.resolve(buildOutputDir, bundleFilename);

  const assetsDest = path.resolve(
    buildOutputDir,
    "assets",
    platform,
    `v${nextVersion}`
  );
  fs.mkdirSync(assetsDest, { recursive: true });

  const relativeBundlePath = path.relative(rnProjectRoot, bundlePath);
  const relativeAssetsDest = path.relative(rnProjectRoot, assetsDest);

  console.log(
    `Starting Metro bundle for platform=${platform} version=${nextVersion}`
  );

  const proc = Bun.spawn({
    cmd: [
      "npx",
      "react-native",
      "bundle",
      "--platform",
      platform,
      "--dev",
      "false",
      "--entry-file",
      "index.js",
      "--bundle-output",
      relativeBundlePath,
      "--assets-dest",
      relativeAssetsDest,
    ],
    cwd: rnProjectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error("Metro bundling failed with exit code", exitCode);
    throw new Error(`Metro bundling failed with exit code ${exitCode}`);
  }

  console.log("Metro bundle finished, compressing...");

  const rawBuffer = await Bun.file(bundlePath).arrayBuffer();
  const checksum = Bun.hash(new Uint8Array(rawBuffer)).toString(16);

  const gzFilename = `${bundleFilename}.gz`;
  const gzPath = path.resolve(buildOutputDir, gzFilename);

  const gzipped = gzipSync(Buffer.from(rawBuffer));
  await Bun.write(gzPath, gzipped);

  const storageObjectPath = `${platform}/v${nextVersion}/${gzFilename}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storageObjectPath, gzipped, {
      contentType: "application/javascript+gzip",
      cacheControl: "public, max-age=31536000, immutable",
      upsert: true,
    });

  if (uploadError) {
    console.error("Upload to Supabase Storage failed:", uploadError);
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storageObjectPath);

  const publicUrl = publicUrlData.publicUrl;

  const { error: insertError } = await supabase.from("bundles").insert({
    platform,
    version: nextVersion,
    bundle_url: publicUrl,
    checksum,
  });

  if (insertError) {
    console.error("Failed to insert bundle metadata:", insertError);
    throw insertError;
  }

  console.log(
    `Bundle v${nextVersion} for platform=${platform} built and published at ${publicUrl}`
  );
}

async function allocateNextVersion(platform: string): Promise<number> {
  const { data, error } = await supabase
    .from("bundles")
    .select("version")
    .eq("platform", platform)
    .order("version", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Failed to query bundles table:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    return 1;
  }

  const latest = data[0] as { version: number };
  return (latest.version ?? 0) + 1;
}

export default app;
