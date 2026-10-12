plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.api"
}

dependencies {
    implementation(project(":contracts"))
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)

    testImplementation(libs.bundles.unit.test)
    testImplementation(libs.okhttp.mockwebserver)
}
