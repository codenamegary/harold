package harold.android.transport.direct

import harold.android.contracts.GitChanges
import harold.android.contracts.GitChangesTotals
import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitDiffHunk
import harold.android.contracts.GitDiffLine
import harold.android.contracts.GitDiffLineKind
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitRepository
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktree
import harold.android.contracts.GitWorktreeCollection
import harold.android.transport.ssh.SshCommandResult
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.runCommand

/** Git read paths executed as ordinary SSH commands. */
class SshGit(
    private val connection: SshConnection,
) {
    suspend fun summary(path: String): Result<GitSummary> = runCatching {
        val root = git(path, "rev-parse", "--show-toplevel").requiredTrimmed()
        val branch = git(root, "rev-parse", "--abbrev-ref", "HEAD").stdout.trim().ifBlank { null }
        val head = git(root, "rev-parse", "HEAD").stdout.trim()
        val defaultBranch = defaultBranch(root)
        val uncommitted = statusEntries(root).files.size
        GitSummary(
            repository = GitRepository(
                root = root,
                currentWorktreePath = root,
                currentBranch = branch?.takeUnless { it == "HEAD" },
                defaultBranch = defaultBranch,
                headSha = head,
            ),
            uncommittedFileCount = uncommitted,
        )
    }

    suspend fun worktrees(path: String): Result<GitWorktreeCollection> = runCatching {
        val root = git(path, "rev-parse", "--show-toplevel").requiredTrimmed()
        val output = git(root, "worktree", "list", "--porcelain").requiredStdout()
        val worktrees = mutableListOf<GitWorktree>()
        var currentPath: String? = null
        var currentHead: String? = null
        var currentBranch: String? = null
        var first = true

        fun flush() {
            val worktreePath = currentPath ?: return
            val head = currentHead ?: ""
            worktrees += GitWorktree(
                path = worktreePath,
                branch = currentBranch?.removePrefix("refs/heads/"),
                headSha = head,
                isCurrent = worktreePath == root,
                isMain = first,
                dirtyFileCount = null,
            )
            first = false
            currentPath = null
            currentHead = null
            currentBranch = null
        }

        output.lineSequence().forEach { line ->
            when {
                line.startsWith("worktree ") -> {
                    flush()
                    currentPath = line.removePrefix("worktree ")
                }
                line.startsWith("HEAD ") -> currentHead = line.removePrefix("HEAD ")
                line.startsWith("branch ") -> currentBranch = line.removePrefix("branch ")
                line.isBlank() -> flush()
            }
        }
        flush()
        GitWorktreeCollection(items = worktrees)
    }

    suspend fun changes(path: String, scope: GitScope): Result<GitChanges> = runCatching {
        val root = git(path, "rev-parse", "--show-toplevel").requiredTrimmed()
        val head = git(root, "rev-parse", "HEAD").stdout.trim()
        when (scope) {
            GitScope.Uncommitted -> {
                val status = statusEntries(root)
                val (additions, deletions) = diffTotals(root, emptyList())
                GitChanges(
                    scope = scope,
                    baseRef = null,
                    mergeBaseSha = null,
                    headSha = head,
                    files = status.files,
                    totals = GitChangesTotals(
                        files = status.files.size,
                        additions = additions,
                        deletions = deletions,
                    ),
                )
            }
            GitScope.Branch -> {
                val base = defaultBranch(root)
                val mergeBase = base
                    ?.let { branch -> git(root, "merge-base", branch, "HEAD").stdout.trim() }
                    ?.takeIf { sha -> sha.isNotBlank() }
                    ?: head
                val nameStatus = git(
                    root,
                    "diff",
                    "--name-status",
                    "--find-renames",
                    mergeBase,
                    "HEAD",
                ).stdout
                val files = parseNameStatus(nameStatus)
                val numstat = git(root, "diff", "--numstat", mergeBase, "HEAD").stdout
                val counts = parseNumstat(numstat)
                val merged = files.map { file ->
                    val count = counts[file.path]
                    file.copy(additions = count?.first, deletions = count?.second)
                }
                GitChanges(
                    scope = scope,
                    baseRef = base,
                    mergeBaseSha = mergeBase,
                    headSha = head,
                    files = merged,
                    totals = GitChangesTotals(
                        files = merged.size,
                        additions = merged.sumOf { it.additions ?: 0 },
                        deletions = merged.sumOf { it.deletions ?: 0 },
                    ),
                )
            }
        }
    }

    suspend fun fileDiff(
        path: String,
        scope: GitScope,
        filePath: String,
        oldPath: String? = null,
    ): Result<GitFileDiff> = runCatching {
        val root = git(path, "rev-parse", "--show-toplevel").requiredTrimmed()
        val base = when (scope) {
            GitScope.Uncommitted -> "HEAD"
            GitScope.Branch -> defaultBranch(root)
                ?.let { branch -> git(root, "merge-base", branch, "HEAD").stdout.trim() }
                ?.takeIf { sha -> sha.isNotBlank() }
                ?: "HEAD"
        }
        val target = oldPath ?: filePath
        var diff = git(
            root,
            "diff",
            "--no-color",
            "--unified=3",
            "--find-renames",
            base,
            "--",
            target,
            filePath,
        ).stdout
        if (diff.isBlank() && scope == GitScope.Uncommitted) {
            diff = git(
                root,
                "diff",
                "--no-color",
                "--unified=3",
                "--no-index",
                "--",
                "/dev/null",
                filePath,
            ).stdout
        }
        val hunks = parseHunks(diff)
        GitFileDiff(
            path = filePath,
            oldPath = oldPath,
            status = statusFor(root, scope, base, filePath),
            additions = hunks.sumOf { hunk -> hunk.lines.count { it.kind == GitDiffLineKind.Addition } },
            deletions = hunks.sumOf { hunk -> hunk.lines.count { it.kind == GitDiffLineKind.Deletion } },
            hunks = hunks,
        )
    }

    private suspend fun statusFor(
        root: String,
        scope: GitScope,
        base: String,
        filePath: String,
    ): GitFileStatus {
        val status = statusEntries(root).files.find { file -> file.path == filePath }
        if (status != null) {
            return status.status
        }
        if (scope == GitScope.Branch) {
            val nameStatus = git(
                root,
                "diff",
                "--name-status",
                "--find-renames",
                base,
                "HEAD",
                "--",
                filePath,
            ).stdout
            return parseNameStatus(nameStatus).firstOrNull()?.status ?: GitFileStatus.Modified
        }
        return GitFileStatus.Modified
    }

    private suspend fun statusEntries(root: String): StatusEntries {
        val output = git(root, "status", "--porcelain=v1", "-uall").stdout
        val files = output.lineSequence()
            .filter { line -> line.length >= 4 }
            .mapNotNull { line ->
                val code = line.substring(0, 2)
                val rawPath = line.substring(3)
                val renamed = rawPath.split(" -> ", limit = 2)
                val path = renamed.last()
                GitChangedFile(
                    path = path,
                    oldPath = renamed.firstOrNull()?.takeIf { renamed.size == 2 },
                    status = statusOf(code),
                )
            }
            .toList()
        return StatusEntries(files)
    }

    private fun statusOf(code: String): GitFileStatus = when {
        code == "??" -> GitFileStatus.Untracked
        code.contains('U') || code == "AA" || code == "DD" -> GitFileStatus.Conflicted
        code.contains('R') -> GitFileStatus.Renamed
        code.contains('C') -> GitFileStatus.Copied
        code.contains('A') -> GitFileStatus.Added
        code.contains('D') -> GitFileStatus.Deleted
        code.contains('T') -> GitFileStatus.TypeChanged
        else -> GitFileStatus.Modified
    }

    private suspend fun diffTotals(
        root: String,
        extra: List<String>,
    ): Pair<Int, Int> {
        val unstaged = parseNumstat(
            git(root, "diff", "--numstat", *extra.toTypedArray()).stdout,
        )
        val staged = parseNumstat(
            git(root, "diff", "--cached", "--numstat", *extra.toTypedArray()).stdout,
        )
        val merged = (unstaged.keys + staged.keys).associateWith { key ->
            val first = unstaged[key]
            val second = staged[key]
            (first?.first ?: 0) + (second?.first ?: 0) to
                (first?.second ?: 0) + (second?.second ?: 0)
        }
        return merged.values.fold(0 to 0) { total, value ->
            total.first + value.first to total.second + value.second
        }
    }

    private suspend fun defaultBranch(root: String): String? {
        val symbolic = git(
            root,
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
        ).stdout.trim()
        if (symbolic.isNotBlank()) {
            return symbolic.removePrefix("origin/")
        }
        val branches = git(root, "branch", "--format=%(refname:short)").stdout
            .lineSequence()
            .map { line -> line.trim() }
            .toList()
        return when {
            "main" in branches -> "main"
            "master" in branches -> "master"
            else -> branches.firstOrNull()
        }
    }

    private suspend fun git(path: String, vararg args: String): SshCommandResult {
        val command = buildString {
            append("cd ")
            append(SshSessionStore.shellQuote(path))
            append(" && git ")
            args.forEachIndexed { index, arg ->
                if (index > 0) append(' ')
                append(SshSessionStore.shellQuote(arg))
            }
        }
        return connection.runCommand(command)
    }

    private fun SshCommandResult.requiredTrimmed(): String {
        if (!succeeded) {
            throw IllegalStateException(stderr.trim().ifBlank { "git failed with $exitCode" })
        }
        return stdout.trim().ifBlank {
            throw IllegalStateException("git returned no path")
        }
    }

    private fun SshCommandResult.requiredStdout(): String {
        if (!succeeded) {
            throw IllegalStateException(stderr.trim().ifBlank { "git failed with $exitCode" })
        }
        return stdout
    }

    private fun parseNameStatus(output: String): List<GitChangedFile> =
        output.lineSequence()
            .filter { line -> line.isNotBlank() }
            .mapNotNull { line ->
                val parts = line.split('\t')
                if (parts.size < 2) {
                    return@mapNotNull null
                }
                val code = parts[0].firstOrNull()?.toString() ?: return@mapNotNull null
                val oldPath = if (parts.size >= 3) parts[1] else null
                GitChangedFile(
                    path = parts.last(),
                    oldPath = oldPath,
                    status = statusOf(code),
                )
            }
            .toList()

    private fun parseNumstat(output: String): Map<String, Pair<Int, Int>> =
        output.lineSequence()
            .filter { line -> line.isNotBlank() }
            .mapNotNull { line ->
                val parts = line.split('\t')
                if (parts.size < 3) {
                    return@mapNotNull null
                }
                val additions = parts[0].toIntOrNull() ?: 0
                val deletions = parts[1].toIntOrNull() ?: 0
                parts.last() to (additions to deletions)
            }
            .toMap()

    private fun parseHunks(diff: String): List<GitDiffHunk> {
        val hunks = mutableListOf<GitDiffHunk>()
        var header: String? = null
        var oldStart = 0
        var oldLines = 0
        var newStart = 0
        var newLines = 0
        var lines = mutableListOf<GitDiffLine>()
        var oldLine = 0
        var newLine = 0

        fun flush() {
            header?.let {
                hunks += GitDiffHunk(
                    header = it,
                    oldStart = oldStart,
                    oldLines = oldLines,
                    newStart = newStart,
                    newLines = newLines,
                    lines = lines,
                )
            }
            lines = mutableListOf()
        }

        diff.lineSequence().forEach { line ->
            if (line.startsWith("@@")) {
                flush()
                header = line
                val match = HUNK_PATTERN.matchEntire(line)
                if (match != null) {
                    oldStart = match.groupValues[1].toIntOrNull() ?: 0
                    oldLines = match.groupValues[2].toIntOrNull() ?: 1
                    newStart = match.groupValues[3].toIntOrNull() ?: 0
                    newLines = match.groupValues[4].toIntOrNull() ?: 1
                    oldLine = oldStart
                    newLine = newStart
                }
            } else if (header != null && line.isNotEmpty()) {
                when (line.first()) {
                    ' ' -> {
                        lines += GitDiffLine(
                            kind = GitDiffLineKind.Context,
                            oldLineNumber = oldLine++,
                            newLineNumber = newLine++,
                            text = line.drop(1),
                        )
                    }
                    '+' -> {
                        lines += GitDiffLine(
                            kind = GitDiffLineKind.Addition,
                            newLineNumber = newLine++,
                            text = line.drop(1),
                        )
                    }
                    '-' -> {
                        lines += GitDiffLine(
                            kind = GitDiffLineKind.Deletion,
                            oldLineNumber = oldLine++,
                            text = line.drop(1),
                        )
                    }
                    '\\' -> Unit
                }
            }
        }
        flush()
        return hunks
    }

    private data class StatusEntries(
        val files: List<GitChangedFile>,
    )

    companion object {
        private val HUNK_PATTERN = Regex("""^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$""")
    }
}
