import { createClient } from "@/utils/supabase/server"

type TodoRow = { id: string; name: string }

export default async function TodosPage() {
  const supabase = await createClient()
  const { data: todos, error } = await supabase.from("todos").select()

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <p>Supabase (tabla <code>todos</code> o permisos): {error.message}</p>
        <p style={{ fontSize: 14, color: "#666" }}>
          Creá la tabla o ignorá esta ruta de demo; el ERP sigue en <code>/</code>.
        </p>
      </div>
    )
  }

  return (
    <ul style={{ padding: 24, fontFamily: "system-ui" }}>
      {(todos as TodoRow[] | null)?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}
