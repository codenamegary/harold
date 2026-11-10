plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "harold.android.host"
}

dependencies {
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(project(":auth"))
    implementation(project(":transport"))
    implementation(libs.jsch)
    implementation(libs.bouncycastle)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(project(":testing"))
    testImplementation(libs.bundles.unit.test)
}
