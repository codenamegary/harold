package harold.android.network

import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitScope
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class GitApiTest {
    private lateinit var server: MockWebServer
    private lateinit var gitApi: DefaultAgentApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        gitApi = DefaultAgentApi(
            client = OkHttpClient.Builder()
                .addInterceptor(BearerAuthInterceptor { _ -> "devcred_test_secret" })
                .build(),
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun getSummaryEncodesThePathAndDecodesTheResponse() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "repository": {
                        "root": "/tmp/my repo",
                        "currentWorktreePath": "/tmp/my repo",
                        "currentBranch": "feat/a",
                        "defaultBranch": "main",
                        "headSha": "abc123"
                      },
                      "uncommittedFileCount": 3
                    }
                    """.trimIndent(),
                ),
        )

        val summary = gitApi.getSummary(
            serverOrigin = origin(),
            path = "/tmp/my repo#1/子",
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals(
            "/v1/git/summary?path=%2Ftmp%2Fmy%20repo%231%2F%E5%AD%90",
            recorded.path,
        )
        assertEquals("/tmp/my repo#1/子", recorded.requestUrl?.queryParameter("path"))
        assertEquals("Bearer devcred_test_secret", recorded.getHeader("Authorization"))
        assertEquals(3, summary.uncommittedFileCount)
        assertEquals("feat/a", summary.repository.currentBranch)
    }

    @Test
    fun getChangesSendsTheScope() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "scope": "branch",
                      "baseRef": "refs/heads/main",
                      "mergeBaseSha": "base123",
                      "headSha": "abc123",
                      "files": [],
                      "totals": { "files": 0, "additions": 0, "deletions": 0 },
                      "truncated": false
                    }
                    """.trimIndent(),
                ),
        )

        val changes = gitApi.getChanges(
            serverOrigin = origin(),
            path = "/tmp/repo",
            scope = GitScope.Branch,
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("/v1/git/changes?path=%2Ftmp%2Frepo&scope=branch", recorded.path)
        assertEquals(GitScope.Branch, changes.scope)
    }

    @Test
    fun getFileDiffEncodesFileAndOldPath() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "path": "src/new name.kt",
                      "oldPath": "src/old name.kt",
                      "status": "renamed",
                      "additions": 2,
                      "deletions": 1,
                      "binary": false,
                      "submodule": false,
                      "hunks": [],
                      "truncated": false
                    }
                    """.trimIndent(),
                ),
        )

        val diff = gitApi.getFileDiff(
            serverOrigin = origin(),
            worktreePath = "/tmp/my repo",
            scope = GitScope.Uncommitted,
            filePath = "src/new name.kt",
            oldPath = "src/old name.kt",
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals(
            "/v1/git/file?path=%2Ftmp%2Fmy%20repo&scope=uncommitted&file=src%2Fnew%20name.kt&oldPath=src%2Fold%20name.kt",
            recorded.path,
        )
        assertEquals(GitFileStatus.Renamed, diff.status)
        assertEquals(2, diff.additions)
    }

    @Test
    fun getFileDiffOmitsOldPathWhenAbsent() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "path": "README.md",
                      "oldPath": null,
                      "status": "modified",
                      "additions": 1,
                      "deletions": 0,
                      "binary": false,
                      "submodule": false,
                      "hunks": [],
                      "truncated": false
                    }
                    """.trimIndent(),
                ),
        )

        gitApi.getFileDiff(
            serverOrigin = origin(),
            worktreePath = "/tmp/repo",
            scope = GitScope.Uncommitted,
            filePath = "README.md",
            oldPath = null,
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals(
            "/v1/git/file?path=%2Ftmp%2Frepo&scope=uncommitted&file=README.md",
            recorded.path,
        )
    }

    @Test
    fun maps404ProblemDetails() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setBody(
                    """
                    {
                      "type": "https://harold.local/problems/not-found",
                      "title": "Not a git repository",
                      "status": 404,
                      "detail": "Not a git repository"
                    }
                    """.trimIndent(),
                ),
        )

        val error = (gitApi.getSummary(origin(), "/tmp/plain").exceptionOrNull() as AgentApiException).error

        assertTrue(error is AgentApiError.Problem)
        assertEquals(404, (error as AgentApiError.Problem).status)
        assertEquals("Not a git repository", error.detail)
    }

    private fun origin(): String = server.url("/").toString().trimEnd('/')
}
