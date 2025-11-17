package com.pushmyway

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    val bundlePath = CodePushPrefs.getBundlePath(this)

    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
      jsMainModulePath = "index",
      jsBundleAssetPath = "index.android.bundle",
      jsBundleFilePath = bundlePath,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
