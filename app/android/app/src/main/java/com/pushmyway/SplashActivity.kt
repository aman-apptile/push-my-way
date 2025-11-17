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

    
    Thread {
      try {
        checkAndUpdateBundle()
      } catch (_: Exception) {
        
      } finally {
        runOnUiThread {
          startActivity(Intent(this@SplashActivity, MainActivity::class.java))
          finish()
        }
      }
    }.start()
  }

  private fun checkAndUpdateBundle() {
    
    val latest = fetchLatestBundle() ?: return

    val currentVersion = CodePushPrefs.getBundleVersion(this)
    if (latest.version <= currentVersion) {
      
      return
    }

    val file = downloadAndUnpackBundle(latest.bundleUrl, latest.version)

    
    CodePushPrefs.setBundleInfo(this, latest.version, file.absolutePath)

    
    cleanupOldBundles(file)
  }

  private fun fetchLatestBundle(): LatestBundleResponse? {
    val backendUrl = "https://1d7b9c736279.ngrok-free.app" 

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

private data class LatestBundleResponse(
  val version: Int,
  val bundleUrl: String,
)

private fun parseLatestBundleResponse(json: String): LatestBundleResponse? {
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
