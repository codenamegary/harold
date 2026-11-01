plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.compose)
    alias(libs.plugins.harold.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "harold.android.navigation"
}

dependencies {
    implementation(project(":contracts"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.runtime)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
}
