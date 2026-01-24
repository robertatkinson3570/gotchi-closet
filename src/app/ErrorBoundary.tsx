import { useRouteError } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Button } from "@/ui/button";

export function ErrorBoundary() {
  const error = useRouteError() as Error | undefined;
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {error?.message || "Unexpected error"}
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </CardContent>
      </Card>
    </div>
  );
}

