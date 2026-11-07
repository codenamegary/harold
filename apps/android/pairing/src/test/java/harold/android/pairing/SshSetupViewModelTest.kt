package harold.android.pairing

import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshCredential
import harold.android.credentials.SshCredentialKind
import harold.android.navigation.Navigator
import harold.android.testing.FakeCredentialStore
import harold.android.testing.FakeSessionGateway
import harold.android.testing.FakeSshCredentialStore
import harold.android.transport.ssh.SshProbe
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SshSetupViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun selectingASavedKeyUsesItsMaterialForTheConnection() = runTest {
        val savedKey = savedKey()
        val fixture = fixture(initialCredentials = listOf(savedKey))

        fixture.viewModel.onHostChanged("laptop.local")
        fixture.viewModel.onUserChanged("gary")
        fixture.viewModel.onCredentialSelected(savedKey.id)
        fixture.viewModel.testConnection()
        fixture.viewModel.onTrustChanged(true)
        fixture.viewModel.save()

        val connection = fixture.connections.list().single()
        assertEquals(
            SshAuth.PrivateKey(
                pem = savedKey.privateKeyPem.orEmpty(),
                publicKey = savedKey.publicKey.orEmpty(),
            ),
            connection.ssh?.auth,
        )
        assertEquals("SHA256:test", connection.ssh?.hostKeyFingerprint)
        assertEquals("touched", fixture.credentials.list().single().lastUsedAt)
    }

    @Test
    fun savingANewGeneratedKeyStoresItUnderTheChosenName() = runTest {
        val fixture = fixture()
        val generated = fixture.viewModel.uiState.value.generatedKey
            ?: error("expected a generated key")

        fixture.viewModel.onHostChanged("laptop.local")
        fixture.viewModel.onUserChanged("gary")
        fixture.viewModel.onCredentialNameChanged("Laptop key")
        fixture.viewModel.testConnection()
        fixture.viewModel.onTrustChanged(true)
        fixture.viewModel.save()

        val credential = fixture.credentials.list().single()
        assertEquals("Laptop key", credential.name)
        assertEquals(SshCredentialKind.PrivateKey, credential.kind)
        assertEquals(generated.privateKeyPem, credential.privateKeyPem)
        assertEquals(generated.publicKey, credential.publicKey)
    }

    @Test
    fun savingANewPasswordStoresItForReuse() = runTest {
        val fixture = fixture()

        fixture.viewModel.onHostChanged("laptop.local")
        fixture.viewModel.onUserChanged("gary")
        fixture.viewModel.onAuthModeChanged(SshAuthMode.Password)
        fixture.viewModel.onPasswordChanged("hunter2")
        fixture.viewModel.onCredentialNameChanged("Host password")
        fixture.viewModel.testConnection()
        fixture.viewModel.onTrustChanged(true)
        fixture.viewModel.save()

        val credential = fixture.credentials.list().single()
        assertEquals("Host password", credential.name)
        assertEquals(SshCredentialKind.Password, credential.kind)
        assertEquals("hunter2", credential.password)
        assertEquals(
            SshAuth.Password("hunter2"),
            fixture.connections.list().single().ssh?.auth,
        )
    }

    @Test
    fun savingTwoConnectionsToTheSameHostKeepsBoth() = runTest {
        val connections = FakeCredentialStore()
        val first = fixture(connections = connections)
        first.viewModel.onHostChanged("laptop.local")
        first.viewModel.onUserChanged("gary")
        first.viewModel.testConnection()
        first.viewModel.onTrustChanged(true)
        first.viewModel.save()

        val second = fixture(connections = connections)
        second.viewModel.onHostChanged("laptop.local")
        second.viewModel.onUserChanged("gary")
        second.viewModel.testConnection()
        second.viewModel.onTrustChanged(true)
        second.viewModel.save()

        val saved = connections.list()
        assertEquals(2, saved.size)
        assertEquals(
            listOf("ssh://gary@laptop.local:22", "ssh://gary@laptop.local:22#2"),
            saved.map { credential -> credential.serverOrigin },
        )
        assertEquals(listOf("laptop", "laptop 2"), saved.map { credential -> credential.name })
    }

    @Test
    fun deletingTheSelectedCredentialClearsTheSelection() = runTest {
        val savedKey = savedKey()
        val fixture = fixture(initialCredentials = listOf(savedKey))

        fixture.viewModel.onCredentialSelected(savedKey.id)
        fixture.viewModel.onDeleteCredential(savedKey.id)

        assertNull(fixture.viewModel.uiState.value.selectedCredentialId)
        assertTrue(fixture.viewModel.uiState.value.savedCredentials.isEmpty())
        assertTrue(fixture.credentials.list().isEmpty())
    }
}

private data class Fixture(
    val viewModel: SshSetupViewModel,
    val connections: FakeCredentialStore,
    val credentials: FakeSshCredentialStore,
)

private fun fixture(
    connections: FakeCredentialStore = FakeCredentialStore(),
    initialCredentials: List<SshCredential> = emptyList(),
): Fixture {
    val credentials = FakeSshCredentialStore(initialCredentials)
    val probe = SshProbe { Result.success("SHA256:test") }
    return Fixture(
        viewModel = SshSetupViewModel(
            repository = SavedHaroldRepository(connections),
            gateway = FakeSessionGateway(),
            enrollment = probe,
            navigator = Navigator(),
            credentials = credentials,
        ),
        connections = connections,
        credentials = credentials,
    )
}

private fun savedKey() = SshCredential(
    id = "key_1",
    name = "Work key",
    kind = SshCredentialKind.PrivateKey,
    privateKeyPem = "-----BEGIN OPENSSH PRIVATE KEY-----\nkey\n-----END OPENSSH PRIVATE KEY-----",
    publicKey = "ssh-ed25519 AAAA work",
    createdAt = "2026-01-01T00:00:00Z",
)
