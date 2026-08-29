export const offsetFromElement = (
  target: EventTarget | null,
  clientX: number,
  valueLength: number,
): number => {
  if (target instanceof Element) {
    return offsetFromHit(target, clientX, valueLength)
  }
  if (target instanceof Node && target.parentElement !== null) {
    return offsetFromHit(target.parentElement, clientX, valueLength)
  }
  return valueLength
}

export const offsetFromPoint = (
  clientX: number,
  clientY: number,
  valueLength: number,
): number => offsetFromElement(document.elementFromPoint(clientX, clientY), clientX, valueLength)

const offsetFromHit = (
  element: Element,
  clientX: number,
  valueLength: number,
): number => {
  const char = element.closest("[data-offset]")
  if (char instanceof HTMLElement && char.dataset.offset !== undefined) {
    const offset = Number(char.dataset.offset)
    const box = char.getBoundingClientRect()
    const atRight = clientX > box.left + box.width / 2
    return atRight ? offset + 1 : offset
  }

  const chip = element.closest("[data-token-start]")
  if (chip instanceof HTMLElement && chip.dataset.tokenStart !== undefined) {
    return Number(chip.dataset.tokenStart)
  }

  return valueLength
}
