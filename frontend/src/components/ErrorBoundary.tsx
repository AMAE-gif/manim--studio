import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="text-center space-y-4 max-w-md">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">出现错误</h2>
            <p className="text-muted-foreground text-sm">
              {this.state.error?.message || "未知错误"}
            </p>
            <Button onClick={() => window.location.reload()}>重新加载</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
