package harold.android.navigation

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DefaultSessionPreferencesTest {
    @Test
    fun selectionRoundTrips() = runTest {
        val preferences = newPreferences()
        val selection = LastSessionSelection(
            serverOrigin = "http://laptop.local:3847",
            workspaceId = "ws_01",
            agentId = "cursor",
        )

        preferences.saveLastSessionSelection(selection)

        assertEquals(selection, preferences.loadLastSessionSelection())
    }

    @Test
    fun selectionMissingLoadsAsNull() = runTest {
        assertNull(newPreferences().loadLastSessionSelection())
    }

    @Test
    fun modelIsScopedByOriginAndAgent() = runTest {
        val preferences = newPreferences()
        preferences.saveLastModel("http://laptop.local:3847", "cursor", "m_laptop")
        preferences.saveLastModel("http://desktop.local:3847", "cursor", "m_desktop")

        assertEquals(
            "m_laptop",
            preferences.loadLastModel("http://laptop.local:3847", "cursor"),
        )
        assertEquals(
            "m_desktop",
            preferences.loadLastModel("http://desktop.local:3847", "cursor"),
        )
        assertNull(preferences.loadLastModel("http://desktop.local:3847", "codex"))
    }

    @Test
    fun modelOverwriteKeepsOtherAgents() = runTest {
        val preferences = newPreferences()
        preferences.saveLastModel("http://laptop.local:3847", "cursor", "m1")
        preferences.saveLastModel("http://laptop.local:3847", "codex", "c1")

        preferences.saveLastModel("http://laptop.local:3847", "cursor", "m2")

        assertEquals("m2", preferences.loadLastModel("http://laptop.local:3847", "cursor"))
        assertEquals("c1", preferences.loadLastModel("http://laptop.local:3847", "codex"))
    }

    private fun newPreferences(): DefaultSessionPreferences {
        val file = File.createTempFile("harold-session", ".preferences_pb")
        file.delete()
        return DefaultSessionPreferences(
            dataStore = PreferenceDataStoreFactory.create { file },
        )
    }
}
