import path from "node:path";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { supabase } from "./supabaseClient";

const STORAGE_BUCKET = "bundles";

export async function queueBundleBuild(platform: string): Promise<void> {
  const rnProjectRoot = path.resolve(__dirname, "../../app");
  const buildOutputDir = path.resolve(rnProjectRoot, "temp");

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
      "./node_modules/.bin/react-native",
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
      "--reset-cache",
      "--minify",
      "false",
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

  // Clean up temporary build directory contents after successful upload
  try {
    fs.rmSync(buildOutputDir, { recursive: true, force: true });
    fs.mkdirSync(buildOutputDir, { recursive: true });
  } catch (cleanupError) {
    console.warn("Failed to clean temp bundle directory:", cleanupError);
  }
}

export async function allocateNextVersion(platform: string): Promise<number> {
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
