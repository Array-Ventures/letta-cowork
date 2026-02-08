import { useState } from "react"
import {
  Bot,
  User,
  CircleCheck,
  SlidersHorizontal,
  Search,
  SquareCheckBig,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────

type Priority = "critical" | "high" | "medium" | "low"
type Status = "live" | "draft"
type Assignee =
  | { type: "agent" }
  | { type: "human"; initials: string }

interface Task {
  id: string
  title: string
  subtitle: string
  priority: Priority
  assignee: Assignee
  status: Status
  time: string
  done: boolean
}

// ── Sample data (matches .pen design) ──────────────────────────────

const initialTasks: Task[] = [
  {
    id: "1",
    title: "Research Maanav's (Retina) competitive landscape",
    subtitle: "Due Diligence / Market Research",
    priority: "critical",
    assignee: { type: "agent" },
    status: "live",
    time: "5m ago",
    done: false,
  },
  {
    id: "2",
    title: "Intro call with Arjun (stealth AI infra)",
    subtitle: "Sourcing / First Meeting",
    priority: "high",
    assignee: { type: "human", initials: "SG" },
    status: "draft",
    time: "in 1h",
    done: false,
  },
  {
    id: "3",
    title: "Summarize Priya's (dev tools) pitch deck",
    subtitle: "Deal Flow / Deck Review",
    priority: "high",
    assignee: { type: "agent" },
    status: "live",
    time: "12m ago",
    done: false,
  },
  {
    id: "4",
    title: "Draft investment memo for Vikram (fintech)",
    subtitle: "Investment / IC Prep",
    priority: "medium",
    assignee: { type: "human", initials: "PM" },
    status: "draft",
    time: "today",
    done: false,
  },
  {
    id: "5",
    title: "Analyze Sam's (ML ops) GitHub metrics",
    subtitle: "Technical DD / Code Review",
    priority: "low",
    assignee: { type: "agent" },
    status: "live",
    time: "30m ago",
    done: false,
  },
  {
    id: "6",
    title: "Reference calls for Neha (healthtech)",
    subtitle: "Due Diligence / References",
    priority: "critical",
    assignee: { type: "human", initials: "RD" },
    status: "draft",
    time: "2h ago",
    done: false,
  },
]

// ── Priority colors ────────────────────────────────────────────────

const priorityColor: Record<Priority, string> = {
  critical: "bg-[#c41952]",
  high: "bg-[#b87800]",
  medium: "bg-[#16a34a]",
  low: "bg-[#9ca3af]",
}

// ── Components ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  valueColor,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  valueColor?: string
}) {
  return (
    <div className="flex-1 rounded-[10px] border border-border bg-card p-3.5 flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`text-[22px] font-semibold ${valueColor ?? "text-foreground"}`}>
          {value}
        </span>
        {icon}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-[5px] rounded-xl bg-green-50 dark:bg-green-950 px-2 py-[3px] h-[22px]">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
        <span className="text-[10px] font-semibold text-green-600">Live</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-[5px] rounded-xl bg-muted px-2 py-[3px] h-[22px]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#9ca3af]" />
      <span className="text-[10px] font-semibold text-[#9ca3af]">Draft</span>
    </span>
  )
}

function AssigneeAvatar({ assignee }: { assignee: Assignee }) {
  if (assignee.type === "agent") {
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ebebf5] dark:bg-indigo-950">
        <Bot className="h-3 w-3 text-[#0606ac] dark:text-indigo-400" />
      </div>
    )
  }
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ebebf5] dark:bg-indigo-950">
      <span className="text-[9px] font-semibold text-[#0606ac] dark:text-indigo-400">
        {assignee.initials}
      </span>
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
}: {
  task: Task
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-card px-4 h-14">
      <span className={`h-2 w-2 shrink-0 rounded-full ${priorityColor[task.priority]}`} />
      <button
        onClick={() => onToggle(task.id)}
        className={`h-[18px] w-[18px] shrink-0 rounded border-[1.5px] flex items-center justify-center transition-colors ${
          task.done
            ? "bg-[#0606ac] border-[#0606ac]"
            : "border-border"
        }`}
      >
        {task.done && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className={`text-[13px] font-medium truncate ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title}
        </span>
        <span className="text-[11px] text-muted-foreground truncate">{task.subtitle}</span>
      </div>
      <AssigneeAvatar assignee={task.assignee} />
      <StatusBadge status={task.status} />
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{task.time}</span>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks] = useState(initialTasks)

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    )
  }

  const activeTasks = tasks.filter((t) => !t.done)
  const doneCount = tasks.filter((t) => t.done).length
  const agentCount = tasks.filter((t) => t.assignee.type === "agent").length
  const humanCount = tasks.filter((t) => t.assignee.type === "human").length
  const inProgressCount = tasks.filter((t) => t.status === "live" && !t.done).length
  const total = tasks.length

  const donePercent = total > 0 ? (doneCount / total) * 100 : 0
  const inProgressPercent = total > 0 ? (inProgressCount / total) * 100 : 0

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Title bar */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ebebf5] dark:bg-indigo-950">
          <SquareCheckBig className="h-3.5 w-3.5 text-[#0606ac] dark:text-indigo-400" />
        </div>
        <span className="text-base font-semibold text-foreground">Team Todos</span>
        <StatusBadge status="live" />
        <div className="flex-1" />
        <button className="flex h-7 items-center gap-[5px] rounded-md border border-border px-2.5">
          <SlidersHorizontal className="h-[13px] w-[13px] text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">Filter</span>
        </button>
        <Search className="h-[18px] w-[18px] text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* Summary cards */}
        <div className="flex gap-3">
          <StatCard label="Total" value={total} />
          <StatCard
            label="In Progress"
            value={inProgressCount}
            icon={<span className="h-1.5 w-1.5 rounded-full bg-green-600" />}
          />
          <StatCard
            label="Agent Tasks"
            value={agentCount}
            icon={<Bot className="h-3.5 w-3.5 text-[#0606ac] dark:text-indigo-400" />}
          />
          <StatCard
            label="Human Tasks"
            value={humanCount}
            icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
          />
          <StatCard
            label="Done Today"
            value={doneCount}
            icon={<CircleCheck className="h-3.5 w-3.5 text-green-600" />}
            valueColor="text-green-600"
          />
        </div>

        {/* Progress bar */}
        <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-muted">
          <div className="bg-green-600 transition-all" style={{ width: `${donePercent}%` }} />
          <div className="bg-[#0606ac] dark:bg-indigo-500 transition-all" style={{ width: `${inProgressPercent}%` }} />
        </div>

        {/* Task header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Active Tasks</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Bot className="h-3 w-3 text-[#0606ac] dark:text-indigo-400" />
              <span className="text-[11px] text-muted-foreground">Agent</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Human</span>
            </div>
          </div>
        </div>

        {/* Task list */}
        <div className="flex flex-col gap-0.5">
          {activeTasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={toggleTask} />
          ))}
        </div>

        {/* Done tasks (if any) */}
        {doneCount > 0 && (
          <>
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              Completed
            </span>
            <div className="flex flex-col gap-0.5 opacity-60">
              {tasks.filter((t) => t.done).map((task) => (
                <TaskRow key={task.id} task={task} onToggle={toggleTask} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
