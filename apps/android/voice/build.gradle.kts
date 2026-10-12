import java.net.URI
import java.nio.file.Files
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipInputStream

plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.voice"
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
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
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

    testImplementation(project(":testing"))
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
}
