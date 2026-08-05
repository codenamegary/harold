package server.agent.android.navigation

interface NavigationPreferences {
    suspend fun loadLastSessionId(): String?

    suspend fun saveLastSessionId(sessionId: String)

    suspend fun clearLastSessionId()
}
