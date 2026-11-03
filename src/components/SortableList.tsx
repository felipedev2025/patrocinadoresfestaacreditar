"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type DragHandleProps = Record<string, unknown>;

/**
 * Lista ordenável por arrastar e soltar (mouse, toque e teclado).
 * No celular, o arraste começa após segurar a alça por 200 ms, para não brigar com a rolagem.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled = false,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  renderItem: (item: T, handle: DragHandleProps | null, index: number) => React.ReactNode;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  }

  if (disabled) return <ul className="space-y-2">{items.map((it, i) => <li key={it.id}>{renderItem(it, null, i)}</li>)}</ul>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {items.map((it, i) => (
            <SortableRow key={it.id} id={it.id}>
              {(handle) => renderItem(it, handle, i)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: DragHandleProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: "relative" }}
      className={isDragging ? "opacity-80 shadow-2xl" : ""}
    >
      {children({ ...attributes, ...listeners })}
    </li>
  );
}

/** Alça de arraste com área de toque grande. */
export function DragHandle({ handle }: { handle: DragHandleProps | null }) {
  if (!handle) return null;
  return (
    <button
      type="button"
      {...handle}
      aria-label="Arrastar para reordenar"
      className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-200 active:cursor-grabbing"
    >
      ⋮⋮
    </button>
  );
}
