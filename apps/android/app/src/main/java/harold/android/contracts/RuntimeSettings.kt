package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class LogLevel {
    @SerialName("fatal")
    Fatal,

    @SerialName("error")
    Error,

    @SerialName("warn")
    Warn,

    @SerialName("info")
    Info,

    @SerialName("debug")
    Debug,

    @SerialName("trace")
    Trace,
}

@Serializable
enum class RuntimeSettingsOverrideSource {
    @SerialName("env")
    Env,
}

@Serializable
data class RuntimeSettings(
    val advertisedUrl: String? = null,
    val advertisedUrlEnabled: Boolean = true,
    val bindHost: String,
    val bindPort: Int,
    val logLevel: LogLevel,
    val logPath: String? = null,
    val allowedRoots: List<String>,
)

@Serializable
data class RuntimeSettingsEffective(
    val bindHost: String,
    val bindPort: Int,
    val logPath: String? = null,
)

@Serializable
data class RuntimeSettingsOverrides(
    val bindHost: RuntimeSettingsOverrideSource? = null,
    val bindPort: RuntimeSettingsOverrideSource? = null,
)

@Serializable
data class RuntimeSettingsView(
    val settings: RuntimeSettings,
    val restartRequired: Boolean,
    val effective: RuntimeSettingsEffective,
    val overrides: RuntimeSettingsOverrides = RuntimeSettingsOverrides(),
)
