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
      <div className="p-3 border-b border-border">
        <Button variant="default" size="sm" className="w-full" onClick={() => setNewProjectOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          新建项目
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {projects.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {session ? "暂无项目" : "登录后查看云端项目"}
            </p>
          ) : (
            projects.map((p) => (
              <div
                key={p.job_id}
                className={`group flex items-start gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                  selectedId === p.job_id
                    ? "bg-accent/10 border border-accent/20"
                    : "hover:bg-surface-hover border border-transparent"
                }`}
                onClick={() => onSelect(p.job_id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate text-foreground">
                    {(p.prompt ?? "").slice(0, 36) || p.job_id}
                    {p.prompt && p.prompt.length > 36 ? "..." : ""}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {p.status}
                    </Badge>
                    {p.created_at && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(p.created_at)}
                      </span>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center rounded-md hover:bg-muted cursor-pointer border-none bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openRename(p)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(p.job_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <AuthBar session={session} busy={busy} onStatusChange={onStatusChange} />

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
