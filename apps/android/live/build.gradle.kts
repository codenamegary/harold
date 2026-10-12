plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.live"
}

dependencies {
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(libs.androidx.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.bundles.unit.test)
}
