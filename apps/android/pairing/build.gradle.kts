plugins {
    alias(libs.plugins.harold.android.feature)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.pairing"
}

dependencies {
    implementation(project(":navigation"))
    implementation(project(":auth"))
    implementation(project(":live"))
    implementation(project(":transport"))
    implementation(project(":design"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.bundles.feature)
    implementation(libs.bundles.compose.ui)
    implementation(libs.androidx.core)
    debugImplementation(libs.bundles.compose.debug)

    testImplementation(project(":api"))
    testImplementation(project(":contracts"))
    testImplementation(project(":testing"))
    testImplementation(libs.bundles.unit.test)
    testImplementation(libs.androidx.compose.ui.test.junit4)
}
