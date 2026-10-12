
plugins {
    alias(libs.plugins.harold.android.application)
    alias(libs.plugins.harold.android.compose)
    alias(libs.plugins.harold.android.hilt)
}

val appVersionName = "1.1.2" // x-release-please-version
val appVersionCode = run {
    val match = checkNotNull(Regex("""^(\d+)\.(\d+)\.(\d+)$""").matchEntire(appVersionName)) {
        "versionName must be MAJOR.MINOR.PATCH, got $appVersionName"
    }
    val (major, minor, patch) = match.destructured.toList().map(String::toInt)
    check(minor < 100 && patch < 100) {
        "versionCode packs minor and patch into two digits each, got $appVersionName"
    }
    major * 10000 + minor * 100 + patch
}

// Release signing comes from env vars set by CI (or exported locally).
// Without all four, release builds stay unsigned so lint and PR checks still run.
val releaseSigning = listOf(
    "ANDROID_KEYSTORE_PATH",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD",
).associateWith { System.getenv(it).orEmpty() }
val hasReleaseSigning = releaseSigning.values.all(String::isNotBlank)

android {
    namespace = "harold.android"

    defaultConfig {
        applicationId = "harold.android"
        versionCode = appVersionCode
        versionName = appVersionName

        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86_64", "x86")
        }
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseSigning.getValue("ANDROID_KEYSTORE_PATH"))
                storePassword = releaseSigning.getValue("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = releaseSigning.getValue("ANDROID_KEY_ALIAS")
                keyPassword = releaseSigning.getValue("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {
    implementation(project(":navigation"))
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(project(":auth"))
    implementation(project(":live"))
    implementation(project(":voice"))
    implementation(project(":design"))
    implementation(project(":pairing"))
    implementation(project(":chat"))
    implementation(project(":workspaces"))
    implementation(project(":shell"))

    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.androidx.lifecycle.viewmodel.navigation3)
    implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.turbine)
    testImplementation(libs.hilt.android.testing)
    kspTest(libs.hilt.compiler)

    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.kotlinx.coroutines.test)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
