import java.net.URI
import java.nio.file.Files
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val appVersionName = "1.1.0" // x-release-please-version
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
    compileSdk {
        version = release(37) {
            minorApiLevel = 0
        }
    }

    defaultConfig {
        applicationId = "harold.android"
        minSdk = 30
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

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

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
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

val fetchVoskModel by tasks.registering {
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
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.9.8")
    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation("com.squareup.okhttp3:okhttp:5.4.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("androidx.camera:camera-camera2:1.5.0")
    implementation("androidx.camera:camera-lifecycle:1.5.0")
    implementation("androidx.camera:camera-view:1.5.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation("com.mikepenz:multiplatform-markdown-renderer-android:0.43.0")
    implementation("com.mikepenz:multiplatform-markdown-renderer-m3:0.43.0")
    implementation("com.alphacephei:vosk-android:0.3.75@aar")
    implementation("net.java.dev.jna:jna:5.18.1@aar")

    testImplementation("com.squareup.okhttp3:mockwebserver:5.4.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")

    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
    testImplementation("androidx.compose.ui:ui-test-junit4")
}
