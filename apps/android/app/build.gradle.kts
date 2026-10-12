import java.net.URI
import java.nio.file.Files
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipInputStream

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

val voskModelVersion = "0.15"
val voskModelArchiveName = "vosk-model-small-en-us-$voskModelVersion.zip"
val voskModelUrl =
    "https://alphacephei.com/vosk/models/$voskModelArchiveName"
val voskModelSha256 =
    "30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498"
val voskModelAssetDir = layout.projectDirectory.dir("src/main/assets/model-en-us")
val voskModelMarker = voskModelAssetDir.file("uuid")
val voskModelCacheDir = layout.buildDirectory.dir("vosk-model")

val fetchVoskModel = tasks.register("fetchVoskModel") {
    description = "Download and unpack the bundled Vosk en-us model into assets."
    group = "vosk"

    inputs.property("modelUrl", voskModelUrl)
    inputs.property("modelSha256", voskModelSha256)
    outputs.file(voskModelMarker)

    doLast {
        val cacheDir = voskModelCacheDir.get().asFile
        cacheDir.mkdirs()
        val archive = cacheDir.resolve(voskModelArchiveName)

        if (!archive.exists()) {
            URI(voskModelUrl).toURL().openStream().use { input ->
                archive.outputStream().use { output -> input.copyTo(output) }
            }
        }

        val digest = MessageDigest.getInstance("SHA-256")
        archive.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        val actualSha = digest.digest().joinToString("") { byte ->
            "%02x".format(byte)
        }
        check(actualSha == voskModelSha256) {
            "Vosk model SHA-256 mismatch. expected=$voskModelSha256 actual=$actualSha"
        }

        val extractRoot = cacheDir.resolve("extract")
        if (extractRoot.exists()) {
            extractRoot.deleteRecursively()
        }
        extractRoot.mkdirs()

        ZipInputStream(archive.inputStream().buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val outFile = extractRoot.resolve(entry.name)
                if (entry.isDirectory) {
                    outFile.mkdirs()
                } else {
                    outFile.parentFile?.mkdirs()
                    outFile.outputStream().use { output -> zip.copyTo(output) }
                }
                zip.closeEntry()
            }
        }

        val unpackedModel = extractRoot.resolve("vosk-model-small-en-us-$voskModelVersion")
        check(unpackedModel.isDirectory) {
            "Expected unpacked model directory at ${unpackedModel.absolutePath}"
        }

        val assetDir = voskModelAssetDir.asFile
        if (assetDir.exists()) {
            assetDir.deleteRecursively()
        }
        assetDir.mkdirs()
        Files.walk(unpackedModel.toPath()).use { paths ->
            paths.forEach { source ->
                val relative = unpackedModel.toPath().relativize(source)
                val target = assetDir.toPath().resolve(relative)
                if (Files.isDirectory(source)) {
                    Files.createDirectories(target)
                } else {
                    Files.createDirectories(target.parent)
                    Files.copy(source, target)
                }
            }
        }
        assetDir.resolve("uuid").writeText(UUID.nameUUIDFromBytes(voskModelSha256.toByteArray()).toString())
    }
}

tasks.named("preBuild").configure {
    dependsOn(fetchVoskModel)
}

tasks.matching { it.name.startsWith("compile") && it.name.contains("UnitTest") }.configureEach {
    dependsOn(fetchVoskModel)
}

dependencies {
    val composeBom = platform(libs.androidx.compose.bom)

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.androidx.lifecycle.viewmodel.navigation3)
    implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.zxing.core)
    implementation(libs.markdown.renderer.android)
    implementation(libs.markdown.renderer.m3)
    implementation(libs.vosk.android) {
        artifact {
            type = "aar"
        }
    }
    implementation(libs.jna) {
        artifact {
            type = "aar"
        }
    }

    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
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
