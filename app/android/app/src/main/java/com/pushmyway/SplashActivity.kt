package com.pushmyway

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

class SplashActivity : AppCompatActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Do the bundle check off the UI thread so the splash screen stays responsive
    Thread {
      try {
        checkAndUpdateBundle()
      } catch (_: Exception) {
        // For this POC we fail open and just continue to main activity
      } finally {
        runOnUiThread {
          startActivity(Intent(this@SplashActivity, MainActivity::class.java))
          finish()
        }
      }
    }.start()
  }

  private fun checkAndUpdateBundle() {
    // Hit backend to get the latest bundle metadata
    val latest = fetchLatestBundle() ?: return

    val currentVersion = CodePushPrefs.getBundleVersion(this)
    if (latest.version <= currentVersion) {
      // Already on latest version
      return
    }

    val file = downloadAndUnpackBundle(latest.bundleUrl, latest.version)

    // Persist new bundle info and let MainApplication pick it up on next start
    CodePushPrefs.setBundleInfo(this, latest.version, file.absolutePath)

    // Optionally clean up any old bundle lying around
    cleanupOldBundles(file)
  }

  private fun fetchLatestBundle(): LatestBundleResponse? {
    val backendUrl = "http://10.0.2.2:3000" // default for Android emulator; change for device/prod

    val url = URL("$backendUrl/bundle/latest?platform=android")
    val conn = url.openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.connectTimeout = 5000
    conn.readTimeout = 5000

    return try {
      val code = conn.responseCode
      if (code != 200) {
        null
      } else {
        val body = conn.inputStream.bufferedReader().use { it.readText() }
        parseLatestBundleResponse(body)
      }
    } finally {
      conn.disconnect()
    }
  }

  private fun downloadAndUnpackBundle(urlString: String, version: Int): File {
    val url = URL(urlString)
    val conn = url.openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.connectTimeout = 10_000
    conn.readTimeout = 10_000

    val bundlesDir = File(filesDir, "codepush-bundles")
    if (!bundlesDir.exists()) bundlesDir.mkdirs()

    val outFile = File(bundlesDir, "android-v$version.bundle")

    conn.inputStream.use { input ->
      GZIPInputStream(input).use { gzipIn ->
        outFile.outputStream().use { output ->
          gzipIn.copyTo(output)
        }
      }
    }

    conn.disconnect()

    return outFile
  }

  private fun cleanupOldBundles(keep: File) {
    val bundlesDir = keep.parentFile ?: return
    bundlesDir.listFiles()?.forEach { file ->
      if (file != keep && file.name.endsWith(".bundle")) {
        file.delete()
      }
    }
  }
}

// Minimal JSON model for backend /bundle/latest response
private data class LatestBundleResponse(
  val version: Int,
  val bundleUrl: String,
)

private fun parseLatestBundleResponse(json: String): LatestBundleResponse? {
  // Extremely small and naive parser to avoid pulling in a full JSON library for the POC.
  // Assumes backend responds with:
  // { "latest": { "version": 1, "bundleUrl": "https://..." } }
  val latestIndex = json.indexOf("\"latest\"")
  if (latestIndex == -1) return null

  val versionIndex = json.indexOf("\"version\"", latestIndex)
  val bundleUrlIndex = json.indexOf("\"bundleUrl\"", latestIndex)
  if (versionIndex == -1 || bundleUrlIndex == -1) return null

  val versionStart = json.indexOf(":", versionIndex) + 1
  val versionEnd = json.indexOf(',', versionStart).let { if (it == -1) json.length else it }
  val versionStr = json.substring(versionStart, versionEnd).trim().trimEnd('}', ' ')

  val urlStart = json.indexOf("\"", bundleUrlIndex + "\"bundleUrl\"".length)
  val urlEnd = json.indexOf("\"", urlStart + 1)
  if (urlStart == -1 || urlEnd == -1) return null

  val url = json.substring(urlStart + 1, urlEnd)

  val version = versionStr.toIntOrNull() ?: return null

  return LatestBundleResponse(version = version, bundleUrl = url)
}
