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

// The daemon binds every interface and derives the pairing endpoint at pair
// time, so the runtime settings only carry the port and log configuration.
@Serializable
data class RuntimeSettings(
    val bindPort: Int,
    val logLevel: LogLevel,
    val logPath: String? = null,
)

@Serializable
data class RuntimeSettingsEffective(
    val bindPort: Int,
    val logPath: String? = null,
)

@Serializable
data class RuntimeSettingsOverrides(
    val bindPort: RuntimeSettingsOverrideSource? = null,
)

@Serializable
data class RuntimeSettingsView(
    val settings: RuntimeSettings,
    val restartRequired: Boolean,
    val effective: RuntimeSettingsEffective,
    val overrides: RuntimeSettingsOverrides = RuntimeSettingsOverrides(),
)
