import { afterEach } from "bun:test"
import { disposeTestResources } from "./test.harness"

afterEach(disposeTestResources, 20000)
