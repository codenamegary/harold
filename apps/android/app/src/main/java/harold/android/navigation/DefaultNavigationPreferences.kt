package harold.android.navigation

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first

class DefaultNavigationPreferences(
    context: Context,
) : NavigationPreferences {
    private val dataStore: DataStore<Preferences> = PreferenceDataStoreFactory.create {
        context.getNoBackupFilesDir().resolve(PREFERENCES_FILE_NAME)
    }

    override suspend fun loadLastSessionId(): String? =
        dataStore.data.first()[KEY_LAST_SESSION_ID]

    override suspend fun saveLastSessionId(sessionId: String) {
        dataStore.edit { preferences ->
            preferences[KEY_LAST_SESSION_ID] = sessionId
        }
    }

    override suspend fun clearLastSessionId() {
        dataStore.edit { preferences ->
            preferences.remove(KEY_LAST_SESSION_ID)
        }
    }

    private companion object {
        const val PREFERENCES_FILE_NAME = "navigation.preferences_pb"
        val KEY_LAST_SESSION_ID = stringPreferencesKey("last_session_id")
    }
}
