import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AuthBar } from "./AuthBar";
import type { Session } from "@supabase/supabase-js";
import type { ProjectRow } from "@/lib/types";

interface SidebarProps {
  projects: ProjectRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: (name: string) => void;
  onRename: (jobId: string, newPrompt: string) => void;
  onDelete: (jobId: string) => void;
  session: Session | null;
  busy: boolean;
  onStatusChange: (status: string) => void;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function Sidebar({
  projects,
  selectedId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  session,
  busy,
  onStatusChange,
}: SidebarProps) {
  const [renameTarget, setRenameTarget] = useState<ProjectRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const openRename = (project: ProjectRow) => {
    setRenameTarget(project);
    setRenameValue(project.prompt ?? "");
  };

  const confirmRename = () => {
    if (renameTarget && renameValue.trim()) {
      onRename(renameTarget.job_id, renameValue.trim());
      setRenameTarget(null);
    }
  };

  return (
    <aside className="flex flex-col h-full w-[280px] border-r border-border bg-surface">
      {/* New Project Button */}
      <div className="p-4 pb-3">
        <Button
          variant="default"
          size="sm"
          className="w-full h-9 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] text-white/80 hover:text-white border border-white/[0.06] font-medium text-[13px] transition-all duration-200"
          onClick={() => setNewProjectOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5 opacity-60" />
          新建项目
        </Button>
      </div>

      {/* Project List */}
      <ScrollArea className="flex-1">
        <div className="px-3 pb-3 space-y-[3px]">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
                <Plus className="h-5 w-5 text-white/20" />
              </div>
              <p className="text-[13px] text-white/25 text-center leading-relaxed">
                {session ? "暂无项目" : "登录后查看云端项目"}
              </p>
            </div>
          ) : (
            projects.map((p, index) => (
              <div
                key={p.job_id}
                className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer transition-all duration-200 animate-stagger-in ${
                  selectedId === p.job_id
                    ? "bg-white/[0.08] border border-white/[0.08]"
                    : "hover:bg-white/[0.04] border border-transparent"
                }`}
                style={{ animationDelay: `${index * 30}ms` }}
                onClick={() => onSelect(p.job_id)}
              >
                {/* Selected indicator */}
                {selectedId === p.job_id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-blue-500" />
                )}

                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] truncate leading-snug ${selectedId === p.job_id ? "text-white/90" : "text-white/60"}`}>
                    {(p.prompt ?? "").slice(0, 36) || p.job_id}
                    {p.prompt && p.prompt.length > 36 ? "..." : ""}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 h-[16px] font-medium rounded-md ${
                        p.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20"
                          : p.status === "error"
                          ? "bg-red-500/10 text-red-400/80 border-red-500/20"
                          : "bg-white/[0.04] text-white/35 border-white/[0.06]"
                      }`}
                    >
                      {p.status}
                    </Badge>
                    {p.created_at && (
                      <span className="text-[10px] text-white/25 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(p.created_at)}
                      </span>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center rounded-lg hover:bg-white/[0.06] cursor-pointer border-none bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 text-white/40" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[140px]">
                    <DropdownMenuItem onClick={() => openRename(p)}>
                      <Pencil className="h-3.5 w-3.5 mr-2 opacity-60" />
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-400 focus:text-red-400"
                      onClick={() => onDelete(p.job_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2 opacity-60" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Auth Bar */}
      <AuthBar session={session} busy={busy} onStatusChange={onStatusChange} />

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmRename()}
            placeholder="项目描述"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmRename}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Project Dialog */}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <Input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newProjectName.trim()) {
                onNew(newProjectName.trim());
                setNewProjectName("");
                setNewProjectOpen(false);
              }
            }}
            placeholder="输入项目名称"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewProjectOpen(false); setNewProjectName(""); }}>
              取消
            </Button>
            <Button
              disabled={!newProjectName.trim()}
              onClick={() => {
                onNew(newProjectName.trim());
                setNewProjectName("");
                setNewProjectOpen(false);
              }}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
