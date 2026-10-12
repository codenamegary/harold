plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "harold.android.contracts"
}

dependencies {
    api(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}
