plugins {
    alias(libs.plugins.harold.android.library)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.auth"
}

dependencies {
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)

    testImplementation(project(":testing"))
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)

    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.kotlinx.coroutines.test)
}
