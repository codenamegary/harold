plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "harold.android.acp"
}

dependencies {
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(project(":testing"))
    testImplementation(project(":transport"))
    testImplementation(project(":host"))
    testImplementation(libs.bundles.unit.test)
}
