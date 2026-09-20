export type ProblemReply = {
  status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } }
}

export const sendProblem = (reply: ProblemReply, status: number, problem: unknown) =>
  reply.status(status).type("application/problem+json").send(problem)
