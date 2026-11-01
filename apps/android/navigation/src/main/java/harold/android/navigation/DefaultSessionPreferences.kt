package harold.android.navigation

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class DefaultSessionPreferences internal constructor(
    private val dataStore: DataStore<Preferences>,
) : SessionPreferences {
    @Inject
    constructor(@ApplicationContext context: Context) : this(
        dataStore = PreferenceDataStoreFactory.create {
            context.getNoBackupFilesDir().resolve(PREFERENCES_FILE_NAME)
        },
    )

    override suspend fun loadLastSessionSelection(): LastSessionSelection? =
        dataStore.data.first()[KEY_LAST_SESSION_SELECTION]?.let { raw ->
            runCatching { json.decodeFromString<LastSessionSelection>(raw) }.getOrNull()
        }

    override suspend fun saveLastSessionSelection(selection: LastSessionSelection) {
        val encoded = json.encodeToString(selection)
        dataStore.edit { preferences ->
            preferences[KEY_LAST_SESSION_SELECTION] = encoded
        }
    }

    override suspend fun loadLastModel(serverOrigin: String, agentId: String): String? =
        decodeModels(dataStore.data.first()[KEY_LAST_MODELS])[modelKey(serverOrigin, agentId)]

    override suspend fun saveLastModel(serverOrigin: String, agentId: String, model: String) {
        dataStore.edit { preferences ->
            val models = decodeModels(preferences[KEY_LAST_MODELS]) +
                (modelKey(serverOrigin, agentId) to model)
            preferences[KEY_LAST_MODELS] = json.encodeToString(models)
        }
    }

    private fun decodeModels(raw: String?): Map<String, String> =
        raw?.let { encoded ->
            runCatching { json.decodeFromString<Map<String, String>>(encoded) }.getOrNull()
        }.orEmpty()

    private fun modelKey(serverOrigin: String, agentId: String): String = "$serverOrigin|$agentId"

    private companion object {
        const val PREFERENCES_FILE_NAME = "session.preferences_pb"
        val KEY_LAST_SESSION_SELECTION = stringPreferencesKey("last_session_selection")
        val KEY_LAST_MODELS = stringPreferencesKey("last_models")
        val json = Json { ignoreUnknownKeys = true }
    }
}
