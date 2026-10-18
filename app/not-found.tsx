import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-6xl font-bold text-muted-foreground">404</p>
        <p className="mt-2 text-lg">This page doesn’t exist or you don’t have access to it.</p>
        <Button asChild className="mt-6">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
