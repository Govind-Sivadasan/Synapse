export function reorderList<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
  next.splice(insertAt, 0, removed);
  return next;
}

export function moveItemById<T extends { id: string }>(
  items: T[],
  fromId: string,
  toId: string,
  position: "before" | "after",
): T[] {
  const fromIndex = items.findIndex((item) => item.id === fromId);
  let toIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;

  if (position === "after") toIndex += 1;
  return reorderList(items, fromIndex, toIndex);
}

export function moveValue<T>(
  values: T[],
  fromValue: T,
  toValue: T,
  position: "before" | "after",
): T[] {
  const fromIndex = values.indexOf(fromValue);
  let toIndex = values.indexOf(toValue);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return values;

  if (position === "after") toIndex += 1;
  return reorderList(values, fromIndex, toIndex);
}

export function dropPosition(event: { clientY: number }, element: HTMLElement): "before" | "after" {
  const rect = element.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
