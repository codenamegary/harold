package harold.android.chat

import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.database.workspace.WorkspaceRepository
import harold.android.navigation.Chat
import harold.android.navigation.ChosenCreateSessionWorkspace
import harold.android.navigation.CreateSession
import harold.android.navigation.Navigator
import harold.android.session.ActiveConnectionState
import harold.android.testing.FakeConnectionGateway
import harold.android.testing.FakeConnectionStore
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspaceChooserViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun keepsOnlyAvailableWorkspacesAndScopesTheirIds() = runTest {
        val network = RouteUserRepository(
            workspacesByConnection = mapOf(
                LAPTOP to listOf(
                    workspace("ws_notes", name = "notes", path = "/tmp/notes"),
                    workspace("ws_missing", name = "missing", state = WorkspaceState.Missing),
                ),
                DESKTOP to listOf(
                    workspace(
                        "ws_docs",
                        name = "docs",
                        path = "/tmp/docs",
                        lastUsedAt = "2026-08-03T00:00:00.000Z",
                    ),
                ),
            ),
        )
        val viewModel = viewModel(
            workspaceRepository = TestWorkspaceRepository(network),
            connectionRepository = connections(
                savedConnection(LAPTOP, "laptop", "tide", "bolt"),
                savedConnection(DESKTOP, "desktop", "ink", "mark"),
            ),
        )

        val rows = viewModel.uiState.value.workspaces

        assertEquals(listOf("$DESKTOP|ws_docs", "$LAPTOP|ws_notes"), rows.map { row -> row.id })
        assertEquals(listOf("ws_docs", "ws_notes"), rows.map { row -> row.workspaceId })
        assertEquals(listOf("desktop", "laptop"), rows.map { row -> row.connectionName })
        assertEquals(listOf("ink", "tide"), rows.map { row -> row.connectionColorId })
    }

    @Test
    fun sortsWorkspacesNewestUsedFirst() = runTest {
        val network = RouteUserRepository(
            workspacesByConnection = mapOf(
                LAPTOP to listOf(
                    workspace("ws_old", name = "old", lastUsedAt = "2026-08-01T00:00:00.000Z"),
                    workspace("ws_new", name = "new", lastUsedAt = "2026-08-04T00:00:00.000Z"),
                    workspace("ws_mid", name = "mid", lastUsedAt = "2026-08-02T00:00:00.000Z"),
                ),
            ),
        )
        val viewModel = viewModel(
            workspaceRepository = TestWorkspaceRepository(network),
            connectionRepository = connections(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
        )

        assertEquals(
            listOf("ws_new", "ws_mid", "ws_old"),
            viewModel.uiState.value.workspaces.map { row -> row.workspaceId },
        )
    }

    @Test
    fun searchFiltersOnNameAndPath() = runTest {
        val network = RouteUserRepository(
            workspacesByConnection = mapOf(
                LAPTOP to listOf(
                    workspace("ws_harold", name = "harold", path = "/home/u/sites/harold"),
                    workspace("ws_docs", name = "docs", path = "/home/u/notes"),
                ),
            ),
        )
        val viewModel = viewModel(
            workspaceRepository = TestWorkspaceRepository(network),
            connectionRepository = connections(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
        )

        viewModel.onSearchChanged("harold")
        assertEquals(listOf("ws_harold"), viewModel.uiState.value.visibleWorkspaces.map { row -> row.workspaceId })

        viewModel.onSearchChanged("notes")
        assertEquals(listOf("ws_docs"), viewModel.uiState.value.visibleWorkspaces.map { row -> row.workspaceId })

        viewModel.onSearchChanged("doc")
        assertEquals(listOf("ws_docs"), viewModel.uiState.value.visibleWorkspaces.map { row -> row.workspaceId })
    }

    @Test
    fun selectionReportsTheConnectionAndWorkspaceThenPops() = runTest {
        val navigator = Navigator()
        navigator.start(hasConnection = true)
        navigator.openCreateSession()
        navigator.openWorkspaceChooser()
        val network = RouteUserRepository(
            workspacesByConnection = mapOf(
                LAPTOP to listOf(
                    workspace("ws_notes", name = "notes", path = "/tmp/notes"),
                    workspace("ws_docs", name = "docs", path = "/tmp/docs"),
                ),
            ),
        )
        val viewModel = viewModel(
            workspaceRepository = TestWorkspaceRepository(network),
            connectionRepository = connections(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
            navigator = navigator,
        )
        val row = viewModel.uiState.value.workspaces.single { workspace -> workspace.workspaceId == "ws_docs" }
        val received = async(start = CoroutineStart.UNDISPATCHED) {
            navigator.chosenCreateSessionWorkspace.first()
        }

        viewModel.select(row)

        assertEquals(
            ChosenCreateSessionWorkspace(
                connectionId = LAPTOP,
                workspaceId = "ws_docs",
            ),
            received.await(),
        )
        assertEquals(listOf(Chat, CreateSession), navigator.backStack.toList())
    }

    private fun viewModel(
        workspaceRepository: WorkspaceRepository,
        connectionRepository: ConnectionRepository,
        navigator: Navigator = Navigator().apply {
            start(hasConnection = true)
            openCreateSession()
            openWorkspaceChooser()
        },
    ): WorkspaceChooserViewModel = WorkspaceChooserViewModel(
        connectionGateway = FakeConnectionGateway(ACTIVE),
        workspaceRepository = workspaceRepository,
        navigator = navigator,
        connectionRepository = connectionRepository,
    )

    private fun workspace(
        id: String,
        name: String = id,
        path: String = "/tmp/$id",
        state: WorkspaceState = WorkspaceState.Available,
        lastUsedAt: String = "2026-08-01T00:00:00.000Z",
    ) = Workspace(
        id = id,
        name = name,
        path = path,
        state = state,
        createdAt = "2026-08-01T00:00:00.000Z",
        lastUsedAt = lastUsedAt,
    )

    private companion object {
        val ACTIVE = ActiveConnectionState.Active("http://127.0.0.1:8787", "Pixel")
        const val LAPTOP = "http://laptop.local:3847"
        const val DESKTOP = "http://desktop.local:3847"
    }
}

private fun savedConnection(
    origin: String,
    name: String,
    colorId: String,
    iconId: String,
) = SavedConnection(
    formatVersion = 3,
    connectionId = origin,
    deviceName = "Pixel",
    name = name,
    colorId = colorId,
    iconId = iconId,
    ssh = SshConfig(
        host = origin,
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)

private suspend fun connections(vararg saved: SavedConnection): ConnectionRepository {
    val store = FakeConnectionStore()
    saved.forEach { connection -> store.save(connection) }
    return ConnectionRepository(store)
}
