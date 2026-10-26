package harold.android.pairing

import harold.android.credentials.SavedHaroldRepository
import harold.android.user.UserRepository
import harold.android.credentials.StoredCredential
import harold.android.navigation.Navigator
import harold.android.navigation.Pairing
import harold.android.navigation.Shell
import harold.android.session.PairedState
import harold.android.testing.FakeCredentialStore
import harold.android.testing.FakeSessionGateway
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SavedHaroldsViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun theListShowsEachNameColorAndIcon() = runTest {
        val store = storeWithTwo()
        val viewModel = viewModel(store)

        assertEquals(
            listOf(
                Triple("laptop", "tide", "bolt"),
                Triple("desktop", "ink", "mark"),
            ),
            viewModel.uiState.value.rows.map { row -> Triple(row.name, row.colorId, row.iconId) },
        )
    }

    @Test
    fun editLeavesTheCredentialAndCanReuseAColor() = runTest {
        val store = storeWithTwo()
        val viewModel = viewModel(store)

        viewModel.startEdit("http://laptop.local:3847")
        viewModel.onNameChanged("work")
        viewModel.onColorSelected("ink")
        viewModel.saveEdit()

        val laptop = store.list().single { harold -> harold.serverOrigin == "http://laptop.local:3847" }
        assertEquals("devcred_laptop", laptop.credential)
        assertEquals("work", laptop.name)
        assertEquals("ink", laptop.colorId)
        assertEquals("devcred_desktop", store.list().single { harold -> harold.name == "desktop" }.credential)
    }

    @Test
    fun removingTheLastHaroldShowsPairing() = runTest {
        val store = FakeCredentialStore()
        store.save(saved("http://laptop.local:3847", "devcred_laptop", "laptop", "tide", "bolt"))
        val navigator = Navigator()
        navigator.start(paired = true)
        val viewModel = viewModel(store, navigator)

        viewModel.remove("http://laptop.local:3847")

        assertEquals(emptyList<StoredCredential>(), store.list())
        assertEquals(listOf(Shell, Pairing), navigator.backStack.toList())
    }
}

private fun viewModel(
    store: FakeCredentialStore,
    navigator: Navigator = Navigator(),
): SavedHaroldsViewModel = SavedHaroldsViewModel(
    repository = SavedHaroldRepository(store),
    userRepository = RevokeOnlyUserRepository(),
    sessionGateway = FakeSessionGateway(PairedState.Paired("http://laptop.local:3847", "device_laptop", "Pixel")),
    sessionOwner = NoopSessionOwner(),
    navigator = navigator,
)

private suspend fun storeWithTwo(): FakeCredentialStore {
    val store = FakeCredentialStore()
    store.save(saved("http://laptop.local:3847", "devcred_laptop", "laptop", "tide", "bolt"))
    store.save(saved("http://desktop.local:3847", "devcred_desktop", "desktop", "ink", "mark"))
    return store
}

private fun saved(
    serverOrigin: String,
    credential: String,
    name: String,
    colorId: String,
    iconId: String,
) = StoredCredential(
    formatVersion = 1,
    deviceId = "device_$name",
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    credential = credential,
    name = name,
    colorId = colorId,
    iconId = iconId,
)

private class RevokeOnlyUserRepository : UserRepository {
    override suspend fun revokeDevice(serverOrigin: String, deviceId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun listWorkspaces(serverOrigin: String, limit: Int) = error("unused")
    override suspend fun getRuntimeSettings(serverOrigin: String) = error("unused")
    override suspend fun listFilesystemDirectories(serverOrigin: String, root: String?) = error("unused")
    override suspend fun createFilesystemDirectory(
        serverOrigin: String,
        body: harold.android.contracts.CreateFilesystemDirectoryBody,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCreated>(
        UnsupportedOperationException("unused"),
    )

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: harold.android.contracts.CreateWorkspaceBody,
    ) = error("unused")
    override suspend fun listSessions(serverOrigin: String, cwd: String?) = error("unused")
    override suspend fun listAgents(serverOrigin: String) = error("unused")
    override suspend fun createSession(
        serverOrigin: String,
        body: harold.android.contracts.CreateSessionBody,
    ) = error("unused")
    override suspend fun deleteSession(serverOrigin: String, agentId: String, sessionId: String) = error("unused")
    override suspend fun getAgentAuth(serverOrigin: String, agentId: String) = error("unused")
    override suspend fun startAgentAuthSession(serverOrigin: String, agentId: String) = error("unused")
    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        action: harold.android.contracts.AuthSessionAction,
    ) = error("unused")
    override suspend fun logoutAgentAuth(serverOrigin: String, agentId: String) = error("unused")
}

private class NoopSessionOwner : harold.android.live.SessionOwner {
    override val connectionState = kotlinx.coroutines.flow.MutableStateFlow(harold.android.stream.ConnectionState())
    override val snapshot = kotlinx.coroutines.flow.MutableStateFlow(harold.android.live.SessionSnapshot())
    override val sessionTitles = kotlinx.coroutines.flow.MutableStateFlow(emptyMap<String, String>())
    override val promptCompletions = kotlinx.coroutines.flow.MutableSharedFlow<Unit>()
    override fun connect(serverOrigin: String) = Unit
    override fun retry() = Unit
    override fun disconnect() = Unit
    override fun onForeground() = Unit
    override fun onBackground() = Unit
    override fun watch(agentId: String?, sessionId: String?) = Unit
    override suspend fun prompt(
        text: String,
        attachments: List<harold.android.contracts.AttachmentReference>,
    ): Result<Unit> = Result.success(Unit)
    override suspend fun cancel(): Result<Unit> = Result.success(Unit)
    override suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> =
        Result.success(Unit)
    override suspend fun replyExtension(
        requestId: String,
        result: kotlinx.serialization.json.JsonElement,
    ): Result<Unit> = Result.success(Unit)
    override fun rememberConfig(
        agentId: String,
        sessionId: String,
        configOptions: List<harold.android.contracts.ConfigOption>,
    ) = Unit
    override fun forget(agentId: String, sessionId: String) = Unit
}
