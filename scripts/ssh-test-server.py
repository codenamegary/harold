#!/usr/bin/env python3
"""Small SSH server for exercising Harold Direct without root or system sshd.

It accepts exec channels and SFTP as the current user. Pass --authorized-keys
to require a specific phone key; omit it to trust any public key.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import pathlib
import sys

import asyncssh

PATH_PREFIX: str | None = None


class TestSshServer(asyncssh.SSHServer):
    def __init__(self, authorized_keys: set[str] | None, password: str | None) -> None:
        self.authorized_keys = authorized_keys
        self.password = password

    def begin_auth(self, username: str) -> bool:
        return True

    def public_key_auth_supported(self) -> bool:
        return True

    def validate_public_key(self, username: str, key: asyncssh.SSHKey) -> bool:
        fingerprint = key.get_fingerprint("sha256")
        print(f"auth publickey user={username} fingerprint={fingerprint}", file=sys.stderr)
        if self.authorized_keys is None:
            return True
        return key.export_public_key().decode().split()[1] in self.authorized_keys

    def password_auth_supported(self) -> bool:
        return self.password is not None

    def validate_password(self, username: str, password: str) -> bool:
        print(f"auth password user={username}", file=sys.stderr)
        return self.password is not None and password == self.password


async def pump_stdin(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    child: asyncio.subprocess.Process,
) -> None:
    """SSH reader (str) -> child stdin (bytes). EOF means the channel closed."""
    try:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break
            writer.write(chunk.encode() if isinstance(chunk, str) else chunk)
            await writer.drain()
    except (asyncio.CancelledError, ConnectionError, BrokenPipeError):
        pass
    finally:
        if child.returncode is None:
            child.terminate()


async def pump_output(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    """Child stdout/stderr (bytes) -> SSH writer (str)."""
    try:
        while True:
            chunk = await reader.read(65536)
            if not chunk:
                break
            print(f"pump {len(chunk)} bytes", file=sys.stderr)
            writer.write(chunk)
            await writer.drain()
    except (asyncio.CancelledError, ConnectionError, BrokenPipeError):
        pass


async def handle_client(process: asyncssh.SSHServerProcess) -> None:
    command = process.command
    if not command:
        process.exit(1)
        return

    print(f"exec {command}", file=sys.stderr)
    home = os.path.expanduser("~")
    env = os.environ.copy()
    env.update(
        {
            "HOME": home,
            "PATH": ":".join(
                [
                    *([PATH_PREFIX] if PATH_PREFIX else []),
                    f"{home}/.opencode/bin",
                    f"{home}/.local/bin",
                    "/usr/local/sbin",
                    "/usr/local/bin",
                    "/usr/sbin",
                    "/usr/bin",
                    "/sbin",
                    "/bin",
                ]
            ),
            "TERM": "xterm-256color",
        }
    )
    proc = await asyncio.create_subprocess_shell(
        command,
        executable="/bin/bash",
        cwd=home,
        env=env,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert proc.stdin is not None
    assert proc.stdout is not None
    assert proc.stderr is not None
    print(f"child pid={proc.pid}", file=sys.stderr)
    stdin_pump = asyncio.create_task(pump_stdin(process.stdin, proc.stdin, proc))
    output_pumps = [
        asyncio.create_task(pump_output(proc.stdout, process.stdout)),
        asyncio.create_task(pump_output(proc.stderr, process.stderr)),
    ]
    code = await proc.wait()
    print(f"child exited code={code}", file=sys.stderr)
    results = await asyncio.gather(*output_pumps, return_exceptions=True)
    print("output pumps done", file=sys.stderr)
    stdin_pump.cancel()
    await asyncio.gather(stdin_pump, return_exceptions=True)
    print("stdin pump cancelled", file=sys.stderr)
    for result in results:
        if isinstance(result, Exception):
            print(f"pump error: {result!r}", file=sys.stderr)
    try:
        await asyncio.sleep(0.1)
        process.exit(code)
        await process.wait_closed()
        print("process closed", file=sys.stderr)
    except Exception as error:
        print(f"process.exit error: {error!r}", file=sys.stderr)


async def main() -> None:
    global PATH_PREFIX
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=2222)
    parser.add_argument("--host-key", default="/tmp/harold-test-hostkey")
    parser.add_argument("--authorized-keys", default=None)
    parser.add_argument("--password", default=None)
    parser.add_argument("--path-prefix", default=None)
    args = parser.parse_args()
    PATH_PREFIX = args.path_prefix

    host_key_path = pathlib.Path(args.host_key)
    if not host_key_path.exists():
        key = asyncssh.generate_private_key("ssh-ed25519")
        key.write_private_key(str(host_key_path))
        print(f"generated host key {host_key_path}", file=sys.stderr)
    host_key = asyncssh.read_private_key(str(host_key_path))

    authorized = None
    if args.authorized_keys:
        lines = pathlib.Path(args.authorized_keys).read_text().splitlines()
        authorized = {
            line.split()[1]
            for line in lines
            if line.strip() and not line.strip().startswith("#")
        }

    await asyncssh.create_server(
        lambda: TestSshServer(authorized, args.password),
        args.host,
        args.port,
        server_host_keys=[host_key],
        sftp_factory=asyncssh.SFTPServer,
        process_factory=handle_client,
        encoding=None,
    )
    print(
        f"harold ssh test server on {args.host}:{args.port} "
        f"hostkey={host_key.get_fingerprint('sha256')}",
        file=sys.stderr,
    )
    await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
