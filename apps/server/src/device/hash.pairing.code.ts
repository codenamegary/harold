export const hashPairingCode = async (code: string): Promise<string> =>
  Bun.password.hash(code, { algorithm: "argon2id" })

export const verifyPairingCode = async (params: {
  code: string
  codeHash: string
}): Promise<boolean> => Bun.password.verify(params.code, params.codeHash)
