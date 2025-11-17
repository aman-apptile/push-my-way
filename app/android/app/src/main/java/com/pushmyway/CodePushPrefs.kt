package com.pushmyway

import android.content.Context
import android.content.SharedPreferences

object CodePushPrefs {
  private const val PREFS_NAME = "codepush_prefs"
  private const val KEY_BUNDLE_VERSION = "bundle_version"
  private const val KEY_BUNDLE_PATH = "bundle_path"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun getBundleVersion(context: Context): Int =
    prefs(context).getInt(KEY_BUNDLE_VERSION, 1)

  fun getBundlePath(context: Context): String? =
    prefs(context).getString(KEY_BUNDLE_PATH, null)

  fun setBundleInfo(context: Context, version: Int, path: String) {
    prefs(context).edit()
      .putInt(KEY_BUNDLE_VERSION, version)
      .putString(KEY_BUNDLE_PATH, path)
      .apply()
  }

  fun clearBundleInfo(context: Context) {
    prefs(context).edit().clear().apply()
  }
}

