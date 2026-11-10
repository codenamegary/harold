package harold.android.connections

import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.SavedConnection
import harold.android.navigation.Navigator
import harold.android.navigation.Shell
import harold.android.navigation.SshSetup
import harold.android.session.InactiveConnections
import harold.android.session.ActiveConnectionState
import harold.android.testing.FakeConnectionStore
import harold.android.testing.FakeConnectionGateway
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
class ConnectionsViewModelTest {
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
    fun editKeepsTheConnectionAndCanReuseAColor() = runTest {
        val store = storeWithTwo()
        val desktopBefore = store.list().single { it.name == "desktop" }.ssh
        val viewModel = viewModel(store)

        viewModel.startEdit("ssh://gary@laptop.local:22")
        viewModel.onNameChanged("work")
        viewModel.onColorSelected("ink")
        viewModel.saveEdit()

        val laptop = store.list().single { it.connectionId == "ssh://gary@laptop.local:22" }
        assertEquals("work", laptop.name)
        assertEquals("ink", laptop.colorId)
        assertEquals(desktopBefore, store.list().single { it.name == "desktop" }.ssh)
    }

    @Test
    fun removingTheLastHaroldOpensHostSetup() = runTest {
        val store = FakeConnectionStore()
        store.save(saved("ssh://gary@laptop.local:22", "laptop", "tide", "bolt"))
        val navigator = Navigator()
        navigator.start(hasConnection = true)
        val viewModel = viewModel(store, navigator)

        viewModel.remove("ssh://gary@laptop.local:22")

        assertEquals(emptyList<SavedConnection>(), store.list())
        assertEquals(listOf(Shell, SshSetup), navigator.backStack.toList())
    }
}

private fun viewModel(
    store: FakeConnectionStore,
    navigator: Navigator = Navigator(),
): ConnectionsViewModel = ConnectionsViewModel(
    repository = ConnectionRepository(store),
    connectionGateway = FakeConnectionGateway(ActiveConnectionState.Active("ssh://gary@laptop.local:22", "Pixel")),
    sessionOwner = NoopSessionOwner(),
    navigator = navigator,
    connections = InactiveConnections,
)

private suspend fun storeWithTwo(): FakeConnectionStore {
    val store = FakeConnectionStore()
    store.save(saved("ssh://gary@laptop.local:22", "laptop", "tide", "bolt"))
    store.save(saved("ssh://gary@desktop.local:22", "desktop", "ink", "mark"))
    return store
}

private fun saved(
    connectionId: String,
    name: String,
    colorId: String,
    iconId: String,
) = SavedConnection(
    formatVersion = 3,
    connectionId = connectionId,
    deviceName = "Pixel",
    name = name,
    colorId = colorId,
    iconId = iconId,
    ssh = SshConfig(
        host = connectionId,
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)

private class NoopSessionOwner : harold.android.live.SessionOwner {
    override val connectionState = kotlinx.coroutines.flow.MutableStateFlow(harold.android.stream.ConnectionState())
    override val snapshot = kotlinx.coroutines.flow.MutableStateFlow(harold.android.live.SessionSnapshot())
    override val sessionTitles = kotlinx.coroutines.flow.MutableStateFlow(emptyMap<String, String>())
    override val promptCompletions = kotlinx.coroutines.flow.MutableSharedFlow<Unit>()
    override fun connect(connectionId: String) = Unit
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
