/**
 * Demo-only SSH host key.
 *
 * It is intentionally public and already shipped in this repository. Keeping
 * it in source means the demo server never reads the container filesystem.
 * The matching public key is
 * `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILAfSOY8eng2jAvcPjtsvXYyoXUTXnTXXmRM3fSc4u+P`.
 */
export const DEMO_HOST_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCwH0jmPHp4NowL3D47bL12MqF1E150115kTN30nOLvjwAAAJisVz1hrFc9
YQAAAAtzc2gtZWQyNTUxOQAAACCwH0jmPHp4NowL3D47bL12MqF1E150115kTN30nOLvjw
AAAECL9vB2l5B9R/Ayaxq3vO2xQ15GWXMmDREzxuiDjTQuhbAfSOY8eng2jAvcPjtsvXYy
oXUTXnTXXmRM3fSc4u+PAAAAEGhhcm9sZC1kZW1vLWhvc3QBAgMEBQ==
-----END OPENSSH PRIVATE KEY-----
`
